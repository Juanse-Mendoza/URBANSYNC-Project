/// Configuración de la app.
///
/// URL del gateway según dónde corra la app:
///  - Emulador Android:               http://10.0.2.2:8080   (valor por defecto)
///  - Celular por USB + adb reverse:  http://127.0.0.1:8080
///  - Celular por Wi-Fi:              `http://IP_DEL_PC:8080`
///
/// Se cambia sin tocar el código:  flutter run --dart-define=API_URL=http://127.0.0.1:8080
library;

const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');

/// Tiempo máximo de espera de cada petición HTTP.
const Duration timeoutHttp = Duration(seconds: 10);

/// Cada cuánto se consulta el conteo de notificaciones no leídas (DECISIONES.md #5).
const Duration intervaloAlertas = Duration(seconds: 30);

/// Centro por defecto del mapa (Bogotá).
const double latBogota = 4.6097;
const double lngBogota = -74.0817;
