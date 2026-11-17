class Usuario {
  const Usuario({
    required this.id,
    required this.nombre,
    required this.rol,
    this.correo,
    this.telefono,
    this.barrio,
    this.categoriaAtencion,
  });

  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(
        id: j['id'] as String,
        nombre: j['nombre'] as String,
        rol: j['rol'] as String,
        correo: j['correo'] as String?,
        telefono: j['telefono'] as String?,
        barrio: j['barrio'] as String?,
        categoriaAtencion: j['categoria_atencion'] as String?,
      );

  final String id;
  final String nombre;

  /// ciudadano | supervisor | ente_gestion | admin
  final String rol;
  final String? correo;
  final String? telefono;
  final String? barrio;
  final String? categoriaAtencion;

  Map<String, dynamic> toJson() => {'id': id, 'nombre': nombre, 'rol': rol};

  bool get esCiudadano => rol == 'ciudadano';
  bool get esSupervisor => rol == 'supervisor';
  bool get esEnte => rol == 'ente_gestion';
}
