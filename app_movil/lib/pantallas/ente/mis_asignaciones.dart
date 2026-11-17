import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../estado/sesion.dart';
import '../../modelos/asignacion.dart';
import '../../widgets/comunes.dart';
import 'actualizar_estado.dart';

/// Bandeja del ente de gestión (RF-ASG-02): sus asignaciones activas, primero las pendientes.
class MisAsignaciones extends StatefulWidget {
  const MisAsignaciones({super.key});

  @override
  State<MisAsignaciones> createState() => _MisAsignacionesState();
}

class _MisAsignacionesState extends State<MisAsignaciones> {
  List<Asignacion>? _asignaciones;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await context.read<Sesion>().api.get('/api/asignaciones/mias', query: {'limite': '50'})
          as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((e) => Asignacion.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) setState(() => (_asignaciones = lista, _error = null));
    } catch (e) {
      if (!mounted) return;
      if (_asignaciones == null) {
        setState(() => _error = e);
      } else {
        mostrarError(context, e, reintentar: _cargar);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('Mis asignaciones')), body: _cuerpo());
  }

  Widget _cuerpo() {
    if (_error != null && _asignaciones == null) {
      return VistaError(mensaje: mensajeDe(_error!), alReintentar: () {
        setState(() => _error = null);
        _cargar();
      });
    }
    final lista = _asignaciones;
    if (lista == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _cargar,
      child: lista.isEmpty
          ? const VistaVacia(icono: Icons.engineering_outlined, mensaje: 'No tienes incidentes asignados.')
          : ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: lista.length,
              itemBuilder: (context, i) {
                final a = lista[i];
                return Card(
                  child: ListTile(
                    leading: AvatarCategoria(a.categoria),
                    title: Text(a.titulo, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(spacing: 6, runSpacing: 4, children: [
                        EtiquetaEstado(a.estado),
                        Text('Asignado ${formatoFecha(a.creadoEn)}', style: Theme.of(context).textTheme.bodySmall),
                      ]),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await Navigator.of(context)
                          .push(MaterialPageRoute<void>(builder: (_) => ActualizarEstado(asignacion: a)));
                      _cargar();
                    },
                  ),
                );
              },
            ),
    );
  }
}
