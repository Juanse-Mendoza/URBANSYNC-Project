import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config.dart';

/// Error de la API ya traducido a un mensaje en español para el usuario.
class ApiException implements Exception {
  const ApiException(this.mensaje, {this.codigo = 'ERROR', this.status});

  final String mensaje;
  final String codigo;

  /// null cuando no hubo respuesta del servidor (error de red o timeout).
  final int? status;

  bool get esDeRed => status == null;

  @override
  String toString() => mensaje;
}

/// Cliente HTTP de la app: agrega el JWT, aplica timeout de 10 s y convierte cualquier
/// error en [ApiException]. Si el servidor responde 401 con sesión activa, avisa para
/// cerrar la sesión (token vencido).
class ClienteApi {
  ClienteApi({http.Client? cliente}) : _http = cliente ?? http.Client();

  final http.Client _http;

  /// JWT de la sesión actual (null si no hay sesión).
  String? token;

  /// Se invoca cuando el token ya no es válido (401).
  void Function()? alExpirarSesion;

  Future<dynamic> get(String ruta, {Map<String, String>? query}) =>
      _enviar('GET', ruta, query: query);

  Future<dynamic> post(String ruta, Object? cuerpo, {Map<String, String>? encabezados}) =>
      _enviar('POST', ruta, cuerpo: cuerpo, encabezados: encabezados);

  Future<dynamic> put(String ruta, Object? cuerpo) => _enviar('PUT', ruta, cuerpo: cuerpo);

  Future<dynamic> patch(String ruta, [Object? cuerpo]) => _enviar('PATCH', ruta, cuerpo: cuerpo);

  Future<dynamic> _enviar(
    String metodo,
    String ruta, {
    Object? cuerpo,
    Map<String, String>? query,
    Map<String, String>? encabezados,
  }) async {
    final base = Uri.parse('$apiUrl$ruta');
    final uri = (query == null || query.isEmpty) ? base : base.replace(queryParameters: query);
    final peticion = http.Request(metodo, uri)
      ..headers['Content-Type'] = 'application/json'
      ..headers['Accept'] = 'application/json';
    if (token != null) peticion.headers['Authorization'] = 'Bearer $token';
    if (encabezados != null) peticion.headers.addAll(encabezados);
    if (cuerpo != null) peticion.body = jsonEncode(cuerpo);

    final http.Response respuesta;
    try {
      respuesta = await () async {
        final flujo = await _http.send(peticion);
        return http.Response.fromStream(flujo);
      }().timeout(timeoutHttp);
    } on TimeoutException {
      throw const ApiException('El servidor tardó demasiado en responder. Revisa tu conexión e intenta de nuevo.');
    } on SocketException {
      throw const ApiException('No hay conexión con el servidor. Verifica tu red e intenta de nuevo.');
    } on http.ClientException {
      throw const ApiException('No hay conexión con el servidor. Verifica tu red e intenta de nuevo.');
    }

    final texto = utf8.decode(respuesta.bodyBytes);
    final dynamic datos = texto.isEmpty ? null : _decodificar(texto);
    final codigo = respuesta.statusCode;
    if (codigo >= 200 && codigo < 300) return datos;

    // Formato estándar del backend: {"error": {"codigo": "...", "mensaje": "..."}}
    final error = (datos is Map && datos['error'] is Map) ? datos['error'] as Map : null;
    if (codigo == 401 && token != null) alExpirarSesion?.call();
    throw ApiException(
      (error?['mensaje'] as String?) ?? _mensajePorEstado(codigo),
      codigo: (error?['codigo'] as String?) ?? 'HTTP_$codigo',
      status: codigo,
    );
  }

  dynamic _decodificar(String texto) {
    try {
      return jsonDecode(texto);
    } on FormatException {
      return null;
    }
  }

  String _mensajePorEstado(int codigo) {
    if (codigo == 401) return 'Debes iniciar sesión de nuevo.';
    if (codigo == 403) return 'No tienes permisos para realizar esta acción.';
    if (codigo == 404) return 'El recurso solicitado no existe.';
    if (codigo == 429) return 'Demasiadas peticiones. Espera un momento e intenta de nuevo.';
    if (codigo >= 500) return 'El servicio no está disponible en este momento, intenta más tarde.';
    return 'Ocurrió un error inesperado ($codigo).';
  }
}
