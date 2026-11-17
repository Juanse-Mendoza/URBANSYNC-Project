class Notificacion {
  const Notificacion({
    required this.id,
    required this.tipo,
    required this.titulo,
    required this.mensaje,
    this.incidenteId,
    required this.leida,
    required this.creadoEn,
  });

  factory Notificacion.fromJson(Map<String, dynamic> j) => Notificacion(
        id: j['id'] as String,
        tipo: j['tipo'] as String,
        titulo: j['titulo'] as String,
        mensaje: j['mensaje'] as String,
        incidenteId: j['incidente_id'] as String?,
        leida: j['leida'] as bool,
        creadoEn: DateTime.parse(j['creado_en'] as String).toLocal(),
      );

  final String id;
  final String tipo;
  final String titulo;
  final String mensaje;
  final String? incidenteId;
  final bool leida;
  final DateTime creadoEn;
}
