DateTime _fecha(dynamic v) => DateTime.parse(v as String).toLocal();

class Seguimiento {
  const Seguimiento({required this.estado, this.comentario, required this.fecha});

  factory Seguimiento.fromJson(Map<String, dynamic> j) => Seguimiento(
        estado: j['estado'] as String,
        comentario: j['comentario'] as String?,
        fecha: _fecha(j['creado_en']),
      );

  final String estado;
  final String? comentario;
  final DateTime fecha;
}

class Asignacion {
  const Asignacion({
    required this.id,
    required this.incidenteId,
    required this.enteId,
    required this.titulo,
    required this.categoria,
    required this.estado,
    required this.activa,
    this.solucion,
    required this.version,
    required this.creadoEn,
    this.seguimiento = const [],
  });

  factory Asignacion.fromJson(Map<String, dynamic> j) => Asignacion(
        id: j['id'] as String,
        incidenteId: j['incidente_id'] as String,
        enteId: j['ente_id'] as String,
        titulo: j['titulo'] as String,
        categoria: j['categoria'] as String,
        estado: j['estado'] as String,
        activa: j['activa'] as bool,
        solucion: j['solucion'] as String?,
        version: (j['version'] as num).toInt(),
        creadoEn: _fecha(j['creado_en']),
        seguimiento: ((j['seguimiento'] as List<dynamic>?) ?? [])
            .map((s) => Seguimiento.fromJson(s as Map<String, dynamic>))
            .toList(),
      );

  final String id;
  final String incidenteId;
  final String enteId;
  final String titulo;
  final String categoria;

  /// recibido | en_atencion | resuelto | reasignado
  final String estado;
  final bool activa;
  final String? solucion;
  final int version;
  final DateTime creadoEn;
  final List<Seguimiento> seguimiento;
}
