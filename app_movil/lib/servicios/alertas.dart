import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/cliente_api.dart';
import '../config.dart';
import '../modelos/notificacion.dart';

/// Alertas por POLLING + notificaciones locales del sistema (DECISIONES.md #5, sin FCM).
///
/// Cada 30 s consulta GET /api/notificaciones/no-leidas/conteo. Si el conteo aumenta, trae
/// las últimas no leídas y muestra una notificación de Android por cada una que no se
/// haya mostrado antes (los ids mostrados se guardan para no repetirlas).
/// Funciona con la app abierta o en segundo plano reciente.
class Alertas {
  Alertas._();
  static final Alertas instancia = Alertas._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static const _almacen = FlutterSecureStorage();

  /// Conteo de no leídas: lo escucha el badge de la pestaña "Alertas".
  final ValueNotifier<int> conteo = ValueNotifier<int>(0);

  /// Se invoca al tocar una notificación del sistema (abre la pestaña de alertas).
  VoidCallback? alTocarNotificacion;

  final Set<String> _mostradas = <String>{};
  Timer? _temporizador;
  ClienteApi? _api;
  String _claveMostradas = 'mostradas';
  bool _inicializado = false;
  bool _consultando = false;

  static const _detalles = NotificationDetails(
    android: AndroidNotificationDetails(
      'urbansync_alertas',
      'Alertas de URBANSYNC',
      channelDescription: 'Cambios en tus reportes y asignaciones',
      importance: Importance.high,
      priority: Priority.high,
    ),
  );

  Future<void> _inicializar() async {
    if (_inicializado) return;
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (_) => alTocarNotificacion?.call(),
    );
    // Android 13+ exige pedir el permiso POST_NOTIFICATIONS en tiempo de ejecución.
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    _inicializado = true;
  }

  /// Empieza el polling para el usuario que inició sesión.
  Future<void> iniciar(ClienteApi api, String usuarioId) async {
    detener();
    _api = api;
    _claveMostradas = 'mostradas_$usuarioId';
    _mostradas.clear();
    try {
      final guardadas = await _almacen.read(key: _claveMostradas);
      if (guardadas != null) _mostradas.addAll((jsonDecode(guardadas) as List<dynamic>).cast<String>());
      await _inicializar();
    } catch (e) {
      debugPrint('No se pudieron preparar las notificaciones: $e');
    }
    await consultar();
    _temporizador = Timer.periodic(intervaloAlertas, (_) => consultar());
  }

  void detener() {
    _temporizador?.cancel();
    _temporizador = null;
    _api = null;
    conteo.value = 0;
  }

  /// Consulta el conteo y muestra las notificaciones nuevas. Los errores se ignoran:
  /// se reintenta en el siguiente ciclo.
  Future<void> consultar() async {
    final api = _api;
    if (api == null || api.token == null || _consultando) return;
    _consultando = true;
    try {
      final r = await api.get('/api/notificaciones/no-leidas/conteo') as Map<String, dynamic>;
      final nuevo = (r['conteo'] as num).toInt();
      final anterior = conteo.value;
      conteo.value = nuevo;
      if (nuevo > anterior) await _mostrarNuevas(api);
    } catch (_) {
      // Sin red o servicio caído: no se interrumpe la app (RNF-DIS-02).
    } finally {
      _consultando = false;
    }
  }

  Future<void> _mostrarNuevas(ClienteApi api) async {
    final r = await api.get('/api/notificaciones', query: {'noLeidas': 'true', 'limite': '10'})
        as Map<String, dynamic>;
    final lista = (r['datos'] as List<dynamic>)
        .map((n) => Notificacion.fromJson(n as Map<String, dynamic>))
        .where((n) => !_mostradas.contains(n.id))
        .toList()
        .reversed; // de la más antigua a la más reciente
    for (final n in lista) {
      if (_inicializado) {
        await _plugin.show(
          id: n.id.hashCode & 0x7fffffff,
          title: n.titulo,
          body: n.mensaje,
          notificationDetails: _detalles,
          payload: n.incidenteId,
        );
      }
      _mostradas.add(n.id);
    }
    final ultimas = _mostradas.toList();
    await _almacen.write(
      key: _claveMostradas,
      value: jsonEncode(ultimas.sublist(ultimas.length > 200 ? ultimas.length - 200 : 0)),
    );
  }
}
