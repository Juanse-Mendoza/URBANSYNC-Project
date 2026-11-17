import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/cliente_api.dart';
import '../../estado/sesion.dart';
import '../../modelos/notificacion.dart';
import '../../servicios/alertas.dart';
import '../../widgets/comunes.dart';
import '../navegacion.dart';

/// Historial de notificaciones (RF-NOT-04). Se recarga al entrar a la pestaña y cada vez
/// que el polling detecta un cambio en el conteo de no leídas.
class PantallaNotificaciones extends StatefulWidget {
  const PantallaNotificaciones({super.key, required this.activa});

  final bool activa;

  @override
  State<PantallaNotificaciones> createState() => _PantallaNotificacionesState();
}

class _PantallaNotificacionesState extends State<PantallaNotificaciones> {
  late final ClienteApi _api = context.read<Sesion>().api;
  List<Notificacion>? _lista;
  Object? _error;

  @override
  void initState() {
    super.initState();
    Alertas.instancia.conteo.addListener(_cargar);
    _cargar();
  }

  @override
  void didUpdateWidget(PantallaNotificaciones anterior) {
    super.didUpdateWidget(anterior);
    if (widget.activa && !anterior.activa) _cargar();
  }

  @override
  void dispose() {
    Alertas.instancia.conteo.removeListener(_cargar);
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final r = await _api.get('/api/notificaciones', query: {'limite': '50'}) as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((n) => Notificacion.fromJson(n as Map<String, dynamic>)).toList();
      if (mounted) setState(() => (_lista = lista, _error = null));
    } catch (e) {
      if (mounted && _lista == null) setState(() => _error = e);
    }
  }

  Future<void> _abrir(Notificacion n) async {
    if (!n.leida) {
      try {
        await _api.patch('/api/notificaciones/${n.id}/leida');
        await Alertas.instancia.consultar(); // actualiza el badge
      } catch (_) {}
    }
    if (!mounted) return;
    if (n.incidenteId != null) await abrirDetalleIncidente(context, n.incidenteId!);
    _cargar();
  }

  Future<void> _leerTodas() async {
    try {
      await _api.patch('/api/notificaciones/leer-todas');
      await Alertas.instancia.consultar();
      await _cargar();
    } catch (e) {
      if (mounted) mostrarError(context, e, reintentar: _leerTodas);
    }
  }

  IconData _icono(String tipo) => switch (tipo) {
        'incidente.creado' => Icons.priority_high,
        'incidente.confirmado' => Icons.verified_outlined,
        'asignacion.creada' || 'asignacion.reasignada' => Icons.assignment_ind_outlined,
        'asignacion.estado_actualizado' => Icons.update,
        _ => Icons.notifications_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final hayNoLeidas = _lista?.any((n) => !n.leida) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alertas'),
        actions: [
          if (hayNoLeidas)
            TextButton.icon(onPressed: _leerTodas, icon: const Icon(Icons.done_all), label: const Text('Leer todas')),
        ],
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_error != null && _lista == null) {
      return VistaError(mensaje: mensajeDe(_error!), alReintentar: () {
        setState(() => _error = null);
        _cargar();
      });
    }
    final lista = _lista;
    if (lista == null) return const Center(child: CircularProgressIndicator());
    final tema = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _cargar,
      child: lista.isEmpty
          ? const VistaVacia(icono: Icons.notifications_none, mensaje: 'No tienes notificaciones todavía.')
          : ListView.separated(
              itemCount: lista.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final n = lista[i];
                return ListTile(
                  tileColor: n.leida ? null : tema.colorScheme.primaryContainer.withValues(alpha: 0.35),
                  leading: Icon(_icono(n.tipo), color: n.leida ? tema.colorScheme.outline : tema.colorScheme.primary),
                  title: Text(n.titulo, style: TextStyle(fontWeight: n.leida ? FontWeight.normal : FontWeight.bold)),
                  subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(n.mensaje),
                    const SizedBox(height: 2),
                    Text(formatoFecha(n.creadoEn), style: tema.textTheme.bodySmall),
                  ]),
                  isThreeLine: true,
                  onTap: () => _abrir(n),
                );
              },
            ),
    );
  }
}
