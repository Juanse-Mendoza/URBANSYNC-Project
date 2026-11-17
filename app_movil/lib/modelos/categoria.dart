class Subcategoria {
  const Subcategoria({required this.codigo, required this.nombre});

  factory Subcategoria.fromJson(Map<String, dynamic> j) =>
      Subcategoria(codigo: j['codigo'] as String, nombre: j['nombre'] as String);

  final String codigo;
  final String nombre;
}

class Categoria {
  const Categoria({
    required this.codigo,
    required this.nombre,
    required this.prioridadBase,
    required this.subcategorias,
  });

  factory Categoria.fromJson(Map<String, dynamic> j) => Categoria(
        codigo: j['codigo'] as String,
        nombre: j['nombre'] as String,
        prioridadBase: j['prioridad_base'] as String,
        subcategorias: (j['subcategorias'] as List<dynamic>)
            .map((s) => Subcategoria.fromJson(s as Map<String, dynamic>))
            .toList(),
      );

  final String codigo;
  final String nombre;
  final String prioridadBase;
  final List<Subcategoria> subcategorias;
}
