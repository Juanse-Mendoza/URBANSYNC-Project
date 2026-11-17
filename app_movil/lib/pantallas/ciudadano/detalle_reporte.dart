import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../estado/sesion.dart';
import '../../modelos/incidente.dart';
import '../../widgets/comunes.dart';
import '../../widgets/mapa_base.dart';

/// Detalle de un incidente con su historial de estados.
/// Lo usan el ciudadano dueño y el ente asignado (el backend responde 403 a los demás).
class DetalleReporte extends StatefulWidget {
  const DetalleReporte({super.key, required this.incidenteId});

  final String incidenteId;

  @override
  State<DetalleReporte> createState() => _DetalleReporteState();
}

class _DetalleReporteState extends State<DetalleReporte> {
  Incidente? _incidente;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await context.read<Sesion>().api.get('/api/incidentes/${widget.incidenteId}') as Map<String, dynamic>;
      if (mounted) setState(() => (_incidente = Incidente.fromJson(r), _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Detalle del reporte')),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    final inc = _incidente;
    if (inc == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : VistaError(mensaje: mensajeDe(_error!), alReintentar: () => setState(() => (_error = null, _cargar())));
    }
    return RefreshIndicator(onRefresh: _cargar, child: VistaIncidente(incidente: inc));
  }
}

/// Ficha reutilizable de un incidente: datos, mapa e historial.
class VistaIncidente extends StatelessWidget {
  const VistaIncidente({super.key, required this.incidente, this.acciones = const []});

  final Incidente incidente;

  /// Widgets extra (botones del supervisor, asignaciones...).
  final List<Widget> acciones;

  @override
  Widget build(BuildContext context) {
    final inc = incidente;
    final punto = LatLng(inc.lat, inc.lng);
    final tema = Theme.of(context);
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      ListTile(
        leading: AvatarCategoria(inc.categoria),
        title: Text(inc.titulo, style: tema.textTheme.titleMedium),
        subtitle: Text(nombresCategoria[inc.categoria] ?? inc.categoria),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Wrap(spacing: 8, runSpacing: 6, children: [
          EtiquetaEstado(inc.estado),
          EtiquetaPrioridad(inc.prioridad),
        ]),
      ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (inc.descripcion != null && inc.descripcion!.isNotEmpty) Dato('Descripción', inc.descripcion!),
            if (inc.subcategoria != null) Dato('Subcategoría', inc.subcategoria!.replaceAll('_', ' ')),
            Dato('Prioridad', '${nombresPrioridad[inc.prioridad]} (${nombresOrigen[inc.prioridadOrigen] ?? inc.prioridadOrigen})'),
            Dato('Área', '${inc.radioM} m alrededor del punto'),
            Dato('Reportado', formatoFecha(inc.creadoEn)),
          ]),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            height: 180,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: punto,
                initialZoom: 16,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag),
              ),
              children: [
                ...capasBaseMapa(),
                capaRadio(punto, inc.radioM.toDouble(), colorCategoria(inc.categoria)),
                MarkerLayer(markers: [pin(punto, colorCategoria(inc.categoria))]),
              ],
            ),
          ),
        ),
      ),
      ...acciones,
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text('Historial', style: tema.textTheme.titleMedium),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(children: [
          for (var i = 0; i < inc.historial.length; i++)
            EntradaHistorial(
              estado: inc.historial[i].nuevo,
              fecha: inc.historial[i].fecha,
              comentario: inc.historial[i].comentario,
              ultimo: i == inc.historial.length - 1,
            ),
        ]),
      ),
    ]);
  }
}
