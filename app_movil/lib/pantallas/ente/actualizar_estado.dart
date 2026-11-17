import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/cliente_api.dart';
import '../../estado/sesion.dart';
import '../../modelos/asignacion.dart';
import '../../widgets/comunes.dart';
import '../ciudadano/detalle_reporte.dart';

/// El ente avanza el estado de su asignación (RF-ASG-03/04):
///   recibido -> en_atencion -> resuelto (con descripción de la solución).
class ActualizarEstado extends StatefulWidget {
  const ActualizarEstado({super.key, required this.asignacion});

  final Asignacion asignacion;

  @override
  State<ActualizarEstado> createState() => _ActualizarEstadoState();
}

class _ActualizarEstadoState extends State<ActualizarEstado> {
  final _form = GlobalKey<FormState>();
  final _comentario = TextEditingController();
  final _solucion = TextEditingController();
  bool _enviando = false;

  @override
  void dispose() {
    _comentario.dispose();
    _solucion.dispose();
    super.dispose();
  }

  /// Siguiente estado permitido por la máquina de estados del backend.
  String? get _siguiente => switch (widget.asignacion.estado) {
        'recibido' => 'en_atencion',
        'en_atencion' => 'resuelto',
        _ => null,
      };

  Future<void> _guardar() async {
    if (!_form.currentState!.validate()) return;
    final siguiente = _siguiente!;
    setState(() => _enviando = true);
    try {
      await context.read<Sesion>().api.patch('/api/asignaciones/${widget.asignacion.id}/estado', {
        'estado': siguiente,
        'comentario': _comentario.text.trim(),
        if (siguiente == 'resuelto') 'solucion': _solucion.text.trim(),
        'version': widget.asignacion.version,
      });
      if (!mounted) return;
      mostrarMensaje(context, 'Estado actualizado: ${nombresEstado[siguiente]}. El ciudadano será notificado.');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final esRed = e is ApiException && e.esDeRed;
      mostrarError(context, e, reintentar: esRed ? _guardar : null);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.asignacion;
    final siguiente = _siguiente;
    return Scaffold(
      appBar: AppBar(title: const Text('Atender incidente')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: AvatarCategoria(a.categoria),
              title: Text(a.titulo),
              subtitle: Text(nombresCategoria[a.categoria] ?? a.categoria),
            ),
            Row(children: [const Text('Estado actual: '), EtiquetaEstado(a.estado)]),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => DetalleReporte(incidenteId: a.incidenteId))),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Ver ubicación y detalle del incidente'),
            ),
            const Divider(height: 32),
            if (siguiente == null)
              Text(
                a.estado == 'resuelto'
                    ? 'Este incidente ya está resuelto.${a.solucion != null ? '\nSolución: ${a.solucion}' : ''}'
                    : 'Esta asignación ya no admite cambios.',
              )
            else ...[
              Text('Pasar a: ${nombresEstado[siguiente]}', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _comentario,
                maxLength: 1000,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Comentario',
                  hintText: siguiente == 'en_atencion' ? 'Ej.: La cuadrilla va en camino' : 'Ej.: Trabajo terminado',
                ),
                validator: (v) => (v == null || v.trim().length < 3) ? 'Escribe al menos 3 caracteres' : null,
              ),
              if (siguiente == 'resuelto') ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _solucion,
                  maxLength: 1000,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Solución aplicada'),
                  validator: (v) => (v == null || v.trim().length < 3) ? 'Describe la solución' : null,
                ),
              ],
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _enviando ? null : _guardar,
                icon: _enviando
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(siguiente == 'resuelto' ? Icons.task_alt : Icons.play_arrow),
                label: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(siguiente == 'resuelto' ? 'Marcar como resuelto' : 'Iniciar atención'),
                ),
              ),
            ],
            if (a.seguimiento.isNotEmpty) ...[
              const Divider(height: 32),
              Text('Seguimiento', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (var i = 0; i < a.seguimiento.length; i++)
                EntradaHistorial(
                  estado: a.seguimiento[i].estado,
                  fecha: a.seguimiento[i].fecha,
                  comentario: a.seguimiento[i].comentario,
                  ultimo: i == a.seguimiento.length - 1,
                ),
            ],
          ]),
        ),
      ),
    );
  }
}
