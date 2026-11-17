import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../../config.dart';
import '../../estado/sesion.dart';
import '../../modelos/categoria.dart';
import '../../servicios/ubicacion.dart';
import '../../widgets/comunes.dart';
import '../../widgets/mapa_base.dart';

/// Nuevo reporte en 5 pasos (RNF-USA-01):
///   1. Título  2. Categoría/subcategoría  3. Descripción (opcional)  4. Radio  5. Ubicación
///
/// La Idempotency-Key se genera UNA vez al abrir el formulario y se reutiliza en cada
/// reintento: si la red falla después de que el servidor guardó el reporte, reenviar no
/// lo duplica (PC-03).
class NuevoReporte extends StatefulWidget {
  const NuevoReporte({super.key});

  @override
  State<NuevoReporte> createState() => _NuevoReporteState();
}

class _NuevoReporteState extends State<NuevoReporte> {
  final _form = GlobalKey<FormState>();
  final _titulo = TextEditingController();
  final _descripcion = TextEditingController();
  final _mapa = MapController();
  late final String _idempotencyKey = const Uuid().v4();

  List<Categoria>? _categorias;
  Object? _errorCategorias;
  Categoria? _categoria;
  String? _subcategoria;
  double _radio = 50;
  LatLng? _punto;
  String? _avisoUbicacion;
  bool _buscandoUbicacion = false;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _cargarCategorias();
    _usarMiUbicacion();
  }

  @override
  void dispose() {
    _titulo.dispose();
    _descripcion.dispose();
    super.dispose();
  }

  Future<void> _cargarCategorias() async {
    setState(() => _errorCategorias = null);
    try {
      final r = await context.read<Sesion>().api.get('/api/categorias') as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((c) => Categoria.fromJson(c as Map<String, dynamic>)).toList();
      if (mounted) setState(() => _categorias = lista);
    } catch (e) {
      if (mounted) setState(() => _errorCategorias = e);
    }
  }

  Future<void> _usarMiUbicacion() async {
    setState(() => (_buscandoUbicacion = true, _avisoUbicacion = null));
    final r = await obtenerUbicacionActual();
    if (!mounted) return;
    setState(() {
      _buscandoUbicacion = false;
      _avisoUbicacion = r.motivo;
      if (r.punto != null) _punto = r.punto;
    });
    if (r.punto != null) {
      try {
        _mapa.move(r.punto!, 17);
      } catch (_) {/* el mapa aún no está listo */}
    }
  }

  Future<void> _enviar() async {
    if (!_form.currentState!.validate()) return;
    if (_punto == null) {
      mostrarMensaje(context, 'Elige la ubicación tocando el mapa.');
      return;
    }
    setState(() => _enviando = true);
    try {
      final r = await context.read<Sesion>().api.post(
        '/api/incidentes',
        {
          'titulo': _titulo.text.trim(),
          if (_descripcion.text.trim().isNotEmpty) 'descripcion': _descripcion.text.trim(),
          'categoria': _categoria!.codigo,
          if (_subcategoria != null) 'subcategoria': _subcategoria,
          'lat': _punto!.latitude,
          'lng': _punto!.longitude,
          'radio_m': _radio.round(),
        },
        encabezados: {'Idempotency-Key': _idempotencyKey},
      ) as Map<String, dynamic>;
      if (!mounted) return;
      mostrarMensaje(context, 'Reporte enviado. Prioridad ${nombresPrioridad[r['prioridad']] ?? r['prioridad']}.');
      Navigator.of(context).pop(true);
    } catch (e) {
      // Reintentar usa la MISMA Idempotency-Key.
      if (mounted) mostrarError(context, e, reintentar: _enviar);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Widget _titulo1(String n, String texto) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Row(children: [
          CircleAvatar(radius: 12, child: Text(n, style: const TextStyle(fontSize: 12))),
          const SizedBox(width: 8),
          Text(texto, style: Theme.of(context).textTheme.titleMedium),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final color = _categoria == null ? Theme.of(context).colorScheme.primary : colorCategoria(_categoria!.codigo);
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo reporte')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
            _titulo1('1', '¿Qué está pasando?'),
            TextFormField(
              controller: _titulo,
              maxLength: 120,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Título', hintText: 'Ej.: Hueco grande frente al colegio'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Escribe al menos 3 caracteres' : null,
            ),
            _titulo1('2', 'Categoría'),
            if (_errorCategorias != null)
              ListTile(
                leading: const Icon(Icons.error_outline),
                title: Text(mensajeDe(_errorCategorias!)),
                trailing: TextButton(onPressed: _cargarCategorias, child: const Text('Reintentar')),
              )
            else if (_categorias == null)
              const LinearProgressIndicator()
            else ...[
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final c in _categorias!)
                  ChoiceChip(
                    avatar: Icon(iconoCategoria(c.codigo), color: colorCategoria(c.codigo), size: 18),
                    label: Text(c.nombre),
                    selected: _categoria?.codigo == c.codigo,
                    onSelected: (_) => setState(() => (_categoria = c, _subcategoria = null)),
                  ),
              ]),
              if (_categoria != null) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: ValueKey(_categoria!.codigo),
                  initialValue: _subcategoria,
                  decoration: const InputDecoration(labelText: 'Subcategoría (opcional)'),
                  items: [
                    for (final s in _categoria!.subcategorias) DropdownMenuItem(value: s.codigo, child: Text(s.nombre)),
                  ],
                  onChanged: (v) => setState(() => _subcategoria = v),
                ),
              ],
              FormField<Categoria>(
                validator: (_) => _categoria == null ? 'Elige una categoría' : null,
                builder: (estado) => estado.hasError
                    ? Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(estado.errorText!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      )
                    : const SizedBox.shrink(),
              ),
            ],
            _titulo1('3', 'Descripción (opcional)'),
            TextFormField(
              controller: _descripcion,
              maxLength: 1000,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Detalles que ayuden a atender el incidente'),
            ),
            _titulo1('4', 'Área afectada: ${_radio.round()} m'),
            Slider(
              value: _radio,
              min: 25,
              max: 200,
              divisions: 35,
              label: '${_radio.round()} m',
              onChanged: (v) => setState(() => _radio = v),
            ),
            _titulo1('5', 'Ubicación'),
            Text(
              _avisoUbicacion ??
                  (_punto == null ? 'Buscando tu ubicación...' : 'Toca el mapa si quieres mover el punto.'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                height: 240,
                child: FlutterMap(
                  mapController: _mapa,
                  options: MapOptions(
                    initialCenter: _punto ?? const LatLng(latBogota, lngBogota),
                    initialZoom: 16,
                    onTap: (_, p) => setState(() => (_punto = p, _avisoUbicacion = null)),
                  ),
                  children: [
                    ...capasBaseMapa(),
                    if (_punto != null) capaRadio(_punto!, _radio, color),
                    if (_punto != null) MarkerLayer(markers: [pin(_punto!, color)]),
                  ],
                ),
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _buscandoUbicacion ? null : _usarMiUbicacion,
                icon: _buscandoUbicacion
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location),
                label: const Text('Usar mi ubicación'),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _enviando ? null : _enviar,
              icon: _enviando
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Enviar reporte')),
            ),
          ]),
        ),
      ),
    );
  }
}
