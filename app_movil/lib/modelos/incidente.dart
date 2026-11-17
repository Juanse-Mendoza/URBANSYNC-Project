double _num(dynamic v) => (v as num).toDouble();
DateTime _fecha(dynamic v) => DateTime.parse(v as String).toLocal();

/// Un cambio de estado del incidente (historial).
class CambioEstado {
  const CambioEstado({this.anterior, required this.nuevo, this.comentario, required this.fecha});

  factory CambioEstado.fromJson(Map<String, dynamic> j) => CambioEstado(
        anterior: j['estado_anterior'] as String?,
        nuevo: j['estado_nuevo'] as String,
        comentario: j['comentario'] as String?,
        fecha: _fecha(j['creado_en']),
      );

  final String? anterior;
  final String nuevo;
  final String? comentario;
  final DateTime fecha;
}

class Incidente {
  const Incidente({
    required this.id,
    required this.ciudadanoId,
    required this.titulo,
    this.descripcion,
    required this.categoria,
    this.subcategoria,
    required this.prioridad,
    required this.prioridadOrigen,
    required this.recalcular,
    required this.estado,
    this.enteAsignadoId,
    required this.lat,
    required this.lng,
    required this.radioM,
    required this.version,
    required this.creadoEn,
    this.historial = const [],
  });

  factory Incidente.fromJson(Map<String, dynamic> j) => Incidente(
        id: j['id'] as String,
        ciudadanoId: j['ciudadano_id'] as String,
        titulo: j['titulo'] as String,
        descripcion: j['descripcion'] as String?,
        categoria: j['categoria'] as String,
        subcategoria: j['subcategoria'] as String?,
        prioridad: j['prioridad'] as String,
        prioridadOrigen: j['prioridad_origen'] as String,
        recalcular: j['recalcular_prioridad'] as bool? ?? false,
        estado: j['estado'] as String,
        enteAsignadoId: j['ente_asignado_id'] as String?,
        lat: _num(j['lat']),
        lng: _num(j['lng']),
        radioM: (j['radio_m'] as num).toInt(),
        version: (j['version'] as num).toInt(),
        creadoEn: _fecha(j['creado_en']),
        historial: ((j['historial'] as List<dynamic>?) ?? [])
            .map((h) => CambioEstado.fromJson(h as Map<String, dynamic>))
            .toList(),
      );

  final String id;
  final String ciudadanoId;
  final String titulo;
  final String? descripcion;
  final String categoria;
  final String? subcategoria;

  /// baja | media | alta
  final String prioridad;

  /// automatica | respaldo | supervisor
  final String prioridadOrigen;
  final bool recalcular;

  /// pendiente | confirmado | asignado | en_atencion | resuelto
  final String estado;
  final String? enteAsignadoId;
  final double lat;
  final double lng;
  final int radioM;

  /// Versión para el control de concurrencia optimista (PATCH ... version).
  final int version;
  final DateTime creadoEn;
  final List<CambioEstado> historial;
}

/// Punto del mapa (GET /api/ubicaciones/mapa).
class PuntoMapa {
  const PuntoMapa({
    required this.incidenteId,
    required this.categoria,
    required this.lat,
    required this.lng,
    required this.radioM,
    required this.creadoEn,
  });

  factory PuntoMapa.fromJson(Map<String, dynamic> j) => PuntoMapa(
        incidenteId: j['incidente_id'] as String,
        categoria: j['categoria'] as String,
        lat: _num(j['lat']),
        lng: _num(j['lng']),
        radioM: (j['radio_m'] as num).toInt(),
        creadoEn: _fecha(j['creado_en']),
      );

  final String incidenteId;
  final String categoria;
  final double lat;
  final double lng;
  final int radioM;
  final DateTime creadoEn;
}
