import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../api/cliente_api.dart';
import '../../config.dart';
import '../../estado/sesion.dart';
import '../../modelos/incidente.dart';
import '../../servicios/ubicacion.dart';
import '../../widgets/comunes.dart';
import '../../widgets/mapa_base.dart';
import '../navegacion.dart';

/// Mapa de incidentes (RF-UBI-03, RF-UBI-06): marcadores de color por categoría,
/// filtro por categoría y detalle al tocar un punto.
class PantallaMapa extends StatefulWidget {
  const PantallaMapa({super.key, required this.activa});

  /// true cuando la pestaña está visible (se recarga al entrar).
  final bool activa;

  @override
  State<PantallaMapa> createState() => _PantallaMapaState();
}

class _PantallaMapaState extends State<PantallaMapa> {
  final _mapa = MapController();
  late final ClienteApi _api = context.read<Sesion>().api;
  LatLng _centro = const LatLng(latBogota, lngBogota);
  LatLng? _yo;
  String? _categoria;
  List<PuntoMapa> _puntos = [];
  bool _cargando = false;

  @override
  void initState() {
    super.initState();
    _ubicarme();
  }

  @override
  void didUpdateWidget(PantallaMapa anterior) {
    super.didUpdateWidget(anterior);
    if (widget.activa && !anterior.activa) _cargar();
  }

  Future<void> _ubicarme() async {
    final r = await obtenerUbicacionActual();
    if (!mounted) return;
    if (r.punto != null) {
      setState(() => (_yo = r.punto, _centro = r.punto!));
      try {
        _mapa.move(r.punto!, 15);
      } catch (_) {}
    }
    await _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final r = await _api.get('/api/ubicaciones/mapa', query: {
        'lat': _centro.latitude.toStringAsFixed(6),
        'lng': _centro.longitude.toStringAsFixed(6),
        'radio_m': '20000',
        'categoria': ?_categoria,
      }) as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((p) => PuntoMapa.fromJson(p as Map<String, dynamic>)).toList();
      if (mounted) setState(() => _puntos = lista);
    } catch (e) {
      if (mounted) mostrarError(context, e, reintentar: _cargar);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  void _verPunto(PuntoMapa p) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: AvatarCategoria(p.categoria),
              title: Text(nombresCategoria[p.categoria] ?? p.categoria),
              subtitle: Text('Reportado ${formatoFecha(p.creadoEn)} · área de ${p.radioM} m'),
            ),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                abrirDetalleIncidente(context, p.incidenteId);
              },
              icon: const Icon(Icons.open_in_new),
              label: const Text('Ver detalle'),
            ),
            const SizedBox(height: 4),
            Text('Solo puedes ver el detalle de tus propios reportes (o los asignados a ti).',
                style: Theme.of(ctx).textTheme.bodySmall),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mapa de incidentes'),
        actions: [
          IconButton(tooltip: 'Actualizar', onPressed: _cargando ? null : _cargar, icon: const Icon(Icons.refresh)),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Row(children: [
              ChoiceChip(
                label: const Text('Todas'),
                selected: _categoria == null,
                onSelected: (_) {
                  setState(() => _categoria = null);
                  _cargar();
                },
              ),
              for (final c in nombresCategoria.entries) ...[
                const SizedBox(width: 6),
                ChoiceChip(
                  avatar: Icon(Icons.circle, size: 12, color: colorCategoria(c.key)),
                  label: Text(c.value),
                  selected: _categoria == c.key,
                  onSelected: (_) {
                    setState(() => _categoria = c.key);
                    _cargar();
                  },
                ),
              ],
            ]),
          ),
        ),
      ),
      body: Stack(children: [
        FlutterMap(
          mapController: _mapa,
          options: MapOptions(
            initialCenter: _centro,
            initialZoom: 14,
            onPositionChanged: (camara, _) => _centro = camara.center,
          ),
          children: [
            ...capasBaseMapa(),
            MarkerLayer(markers: [
              for (final p in _puntos)
                pin(LatLng(p.lat, p.lng), colorCategoria(p.categoria), alTocar: () => _verPunto(p), tamano: 36),
              if (_yo != null)
                Marker(
                  point: _yo!,
                  width: 22,
                  height: 22,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.blue,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                    ),
                  ),
                ),
            ]),
          ],
        ),
        Positioned(
          left: 12,
          bottom: 12,
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(_cargando ? 'Cargando...' : '${_puntos.length} incidente(s) en 20 km'),
            ),
          ),
        ),
      ]),
      floatingActionButton: FloatingActionButton.small(
        tooltip: 'Mi ubicación',
        onPressed: _ubicarme,
        child: const Icon(Icons.my_location),
      ),
    );
  }
}
