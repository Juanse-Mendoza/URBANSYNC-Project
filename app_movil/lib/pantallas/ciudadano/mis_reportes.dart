import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../estado/sesion.dart';
import '../../modelos/incidente.dart';
import '../../widgets/comunes.dart';
import 'detalle_reporte.dart';
import 'nuevo_reporte.dart';

/// Mis reportes (RF-CLA-07).
class MisReportes extends StatefulWidget {
  const MisReportes({super.key});

  @override
  State<MisReportes> createState() => _MisReportesState();
}

class _MisReportesState extends State<MisReportes> {
  List<Incidente>? _reportes;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await context.read<Sesion>().api.get('/api/incidentes/mios', query: {'limite': '50'})
          as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((e) => Incidente.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) setState(() => (_reportes = lista, _error = null));
    } catch (e) {
      if (!mounted) return;
      if (_reportes == null) {
        setState(() => _error = e);
      } else {
        mostrarError(context, e, reintentar: _cargar);
      }
    }
  }

  Future<void> _nuevo() async {
    final creado = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NuevoReporte()));
    if (creado == true) _cargar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis reportes')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _nuevo,
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Nuevo reporte'),
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_error != null && _reportes == null) {
      return VistaError(mensaje: mensajeDe(_error!), alReintentar: () => setState(() => (_error = null, _cargar())));
    }
    final reportes = _reportes;
    if (reportes == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _cargar,
      child: reportes.isEmpty
          ? const VistaVacia(icono: Icons.assignment_outlined, mensaje: 'Aún no has hecho reportes.\nToca "Nuevo reporte" para empezar.')
          : ListView.builder(
              padding: const EdgeInsets.only(top: 8, bottom: 88),
              itemCount: reportes.length,
              itemBuilder: (context, i) {
                final r = reportes[i];
                return Card(
                  child: ListTile(
                    leading: AvatarCategoria(r.categoria),
                    title: Text(r.titulo, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(spacing: 6, runSpacing: 4, children: [
                        EtiquetaEstado(r.estado),
                        EtiquetaPrioridad(r.prioridad),
                        Text(formatoFecha(r.creadoEn), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                    ),
                    onTap: () async {
                      await Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => DetalleReporte(incidenteId: r.id)));
                      _cargar();
                    },
                  ),
                );
              },
            ),
    );
  }
}
