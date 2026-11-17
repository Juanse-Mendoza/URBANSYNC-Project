import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/cliente_api.dart';
import '../../estado/sesion.dart';
import '../../modelos/asignacion.dart';
import '../../modelos/incidente.dart';
import '../../modelos/usuario.dart';
import '../../widgets/comunes.dart';
import '../ciudadano/detalle_reporte.dart';

/// Detalle para el supervisor: confirmar, ajustar prioridad, asignar y reasignar
/// (RF-CLA-05, RF-ASG-01, RF-ASG-05, RF-ASG-06).
class DetalleSupervisor extends StatefulWidget {
  const DetalleSupervisor({super.key, required this.incidenteId});

  final String incidenteId;

  @override
  State<DetalleSupervisor> createState() => _DetalleSupervisorState();
}

class _DetalleSupervisorState extends State<DetalleSupervisor> {
  Incidente? _incidente;
  List<Asignacion> _asignaciones = [];
  int? _similares;
  Object? _error;
  bool _trabajando = false;

  // Se toma una vez (en initState) para no usar el BuildContext después de un await.
  late final ClienteApi _api = context.read<Sesion>().api;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final id = widget.incidenteId;
      final r = await _api.get('/api/incidentes/$id') as Map<String, dynamic>;
      final inc = Incidente.fromJson(r);
      var asignaciones = <Asignacion>[];
      int? similares;
      // Datos complementarios: si fallan, la pantalla se muestra igual.
      try {
        final a = await _api.get('/api/asignaciones/incidente/$id') as Map<String, dynamic>;
        asignaciones = (a['datos'] as List<dynamic>).map((x) => Asignacion.fromJson(x as Map<String, dynamic>)).toList();
      } catch (_) {}
      try {
        final s = await _api.get('/api/ubicaciones/$id/similares') as Map<String, dynamic>;
        similares = (s['total'] as num).toInt();
      } catch (_) {}
      if (mounted) {
        setState(() {
          _incidente = inc;
          _asignaciones = asignaciones;
          _similares = similares;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Asignacion? get _activa {
    for (final a in _asignaciones) {
      if (a.activa) return a;
    }
    return null;
  }

  /// Ejecuta una acción; si la versión cambió (409) recarga para mostrar los datos nuevos.
  Future<void> _ejecutar(Future<void> Function() accion, String exito, {bool esperarEvento = false}) async {
    setState(() => _trabajando = true);
    try {
      await accion();
      if (!mounted) return;
      mostrarMensaje(context, exito);
      // El cambio de estado llega por evento (outbox cada 2 s): se espera un momento.
      if (esperarEvento) await Future<void>.delayed(const Duration(seconds: 3));
      await _cargar();
    } catch (e) {
      if (!mounted) return;
      mostrarError(context, e, reintentar: e is ApiException && e.esDeRed ? () => _ejecutar(accion, exito) : null);
      if (e is ApiException && e.status == 409) await _cargar();
    } finally {
      if (mounted) setState(() => _trabajando = false);
    }
  }

  Future<void> _dialogoClasificar({required bool confirmar}) async {
    final inc = _incidente!;
    String prioridad = inc.prioridad;
    final comentario = TextEditingController();
    final aceptar = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(confirmar ? 'Confirmar incidente' : 'Ajustar prioridad'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Prioridad'),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'baja', label: Text('Baja')),
                  ButtonSegment(value: 'media', label: Text('Media')),
                  ButtonSegment(value: 'alta', label: Text('Alta')),
                ],
                selected: {prioridad},
                onSelectionChanged: (s) => setD(() => prioridad = s.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: comentario,
                maxLength: 300,
                decoration: const InputDecoration(labelText: 'Comentario (opcional)'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(confirmar ? 'Confirmar' : 'Guardar')),
          ],
        ),
      ),
    );
    final texto = comentario.text.trim();
    comentario.dispose();
    if (aceptar != true) return;
    await _ejecutar(
      () => _api.patch('/api/incidentes/${inc.id}/clasificacion', {
        'confirmar': confirmar,
        if (prioridad != inc.prioridad) 'prioridad': prioridad,
        if (texto.isNotEmpty) 'comentario': texto,
        'version': inc.version, // control optimista: si otro supervisor cambió algo -> 409
      }),
      confirmar ? 'Incidente confirmado' : 'Prioridad actualizada',
    );
  }

  /// Muestra los entes (primero los de la categoría del incidente) y devuelve el elegido.
  Future<Usuario?> _elegirEnte({String? excluir}) async {
    final inc = _incidente!;
    List<Usuario> entes;
    try {
      final r = await _api.get('/api/usuarios/entes', query: {'limite': '50'}) as Map<String, dynamic>;
      entes = (r['datos'] as List<dynamic>).map((u) => Usuario.fromJson(u as Map<String, dynamic>)).toList();
    } catch (e) {
      if (mounted) mostrarError(context, e);
      return null;
    }
    entes = entes.where((e) => e.id != excluir).toList()
      ..sort((a, b) => (a.categoriaAtencion == inc.categoria ? 0 : 1).compareTo(b.categoriaAtencion == inc.categoria ? 0 : 1));
    if (!mounted) return null;
    return showModalBottomSheet<Usuario>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          const ListTile(title: Text('Elige el ente de gestión')),
          for (final e in entes)
            ListTile(
              leading: AvatarCategoria(e.categoriaAtencion ?? ''),
              title: Text(e.nombre),
              subtitle: Text(nombresCategoria[e.categoriaAtencion] ?? 'Sin categoría'),
              trailing: e.categoriaAtencion == inc.categoria ? const Icon(Icons.recommend_outlined) : null,
              onTap: () => Navigator.pop(ctx, e),
            ),
          if (entes.isEmpty) const ListTile(title: Text('No hay entes disponibles')),
        ]),
      ),
    );
  }

  Future<void> _asignar() async {
    final ente = await _elegirEnte();
    if (ente == null) return;
    await _ejecutar(
      () => _api.post('/api/asignaciones', {'incidenteId': _incidente!.id, 'enteId': ente.id}),
      'Asignado a ${ente.nombre}',
      esperarEvento: true,
    );
  }

  Future<void> _reasignar() async {
    final activa = _activa!;
    final ente = await _elegirEnte(excluir: activa.enteId);
    if (ente == null) return;
    await _ejecutar(
      () => _api.patch('/api/asignaciones/${activa.id}/reasignar', {'enteId': ente.id}),
      'Reasignado a ${ente.nombre}',
      esperarEvento: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestionar incidente'),
        bottom: _trabajando
            ? const PreferredSize(preferredSize: Size.fromHeight(4), child: LinearProgressIndicator())
            : null,
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    final inc = _incidente;
    if (inc == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : VistaError(mensaje: mensajeDe(_error!), alReintentar: () {
              setState(() => _error = null);
              _cargar();
            });
    }
    final activa = _activa;
    final puedeReasignar = activa != null && activa.estado != 'resuelto';
    return RefreshIndicator(
      onRefresh: _cargar,
      child: VistaIncidente(incidente: inc, acciones: [
        if (_similares != null)
          ListTile(
            leading: const Icon(Icons.radar),
            title: Text('$_similares reporte(s) similar(es) cerca'),
            subtitle: Text('Misma categoría dentro de ${inc.radioM} m, últimos 30 días'),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            if (inc.estado == 'pendiente')
              FilledButton.icon(
                onPressed: _trabajando ? null : () => _dialogoClasificar(confirmar: true),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Confirmar'),
              ),
            if (inc.estado != 'resuelto')
              OutlinedButton.icon(
                onPressed: _trabajando ? null : () => _dialogoClasificar(confirmar: false),
                icon: const Icon(Icons.flag_outlined),
                label: const Text('Ajustar prioridad'),
              ),
            if (inc.estado == 'confirmado' && activa == null)
              FilledButton.icon(
                onPressed: _trabajando ? null : _asignar,
                icon: const Icon(Icons.assignment_ind_outlined),
                label: const Text('Asignar a ente'),
              ),
            if (puedeReasignar)
              OutlinedButton.icon(
                onPressed: _trabajando ? null : _reasignar,
                icon: const Icon(Icons.swap_horiz),
                label: const Text('Reasignar'),
              ),
          ]),
        ),
        if (_asignaciones.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text('Asignaciones', style: Theme.of(context).textTheme.titleMedium),
          ),
          for (final a in _asignaciones)
            Card(
              child: ExpansionTile(
                leading: Icon(a.activa ? Icons.engineering : Icons.history),
                title: Text(a.activa ? 'Asignación activa' : 'Asignación anterior'),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(children: [EtiquetaEstado(a.estado)]),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(20, 0, 16, 8),
                children: [
                  if (a.solucion != null) Dato('Solución', a.solucion!),
                  for (var i = 0; i < a.seguimiento.length; i++)
                    EntradaHistorial(
                      estado: a.seguimiento[i].estado,
                      fecha: a.seguimiento[i].fecha,
                      comentario: a.seguimiento[i].comentario,
                      ultimo: i == a.seguimiento.length - 1,
                    ),
                ],
              ),
            ),
        ],
      ]),
    );
  }
}
