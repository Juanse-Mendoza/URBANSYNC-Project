import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/cliente_api.dart';
import '../modelos/usuario.dart';

/// Estado de la sesión (provider). El JWT se guarda cifrado con flutter_secure_storage,
/// así la sesión sobrevive al cierre de la app hasta que el token expire (45 min).
class Sesion extends ChangeNotifier {
  Sesion(this.api) {
    // Si el backend responde 401 con un token guardado, la sesión expiró.
    api.alExpirarSesion = () => cerrarSesion(expirada: true);
  }

  final ClienteApi api;
  static const _almacen = FlutterSecureStorage();

  Usuario? usuario;
  bool cargando = true;

  /// Mensaje para mostrar en el login (por ejemplo, "tu sesión expiró").
  String? aviso;

  bool get autenticado => usuario != null;

  /// Restaura la sesión guardada al abrir la app.
  Future<void> cargar() async {
    try {
      final token = await _almacen.read(key: 'token');
      final datos = await _almacen.read(key: 'usuario');
      if (token != null && datos != null) {
        api.token = token;
        usuario = Usuario.fromJson(jsonDecode(datos) as Map<String, dynamic>);
      }
    } catch (_) {
      await _almacen.deleteAll();
    }
    cargando = false;
    notifyListeners();
  }

  Future<void> iniciarSesion(String correo, String contrasena) async {
    final r = await api.post('/api/usuarios/login', {'correo': correo.trim(), 'contrasena': contrasena})
        as Map<String, dynamic>;
    api.token = r['token'] as String;
    usuario = Usuario.fromJson(r['usuario'] as Map<String, dynamic>);
    aviso = null;
    await _almacen.write(key: 'token', value: api.token);
    await _almacen.write(key: 'usuario', value: jsonEncode(usuario!.toJson()));
    notifyListeners();
  }

  Future<void> cerrarSesion({bool expirada = false}) async {
    if (usuario == null) return;
    api.token = null;
    usuario = null;
    aviso = expirada ? 'Tu sesión expiró. Inicia sesión de nuevo.' : null;
    await _almacen.delete(key: 'token');
    await _almacen.delete(key: 'usuario');
    notifyListeners();
  }
}
