import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// Resultado de pedir la ubicación: el punto, o un mensaje de por qué no se pudo.
typedef ResultadoUbicacion = ({LatLng? punto, String? motivo});

/// Obtiene la ubicación actual con geolocator. Si no hay permiso o GPS (por ejemplo, en un
/// emulador), devuelve el motivo para que el usuario elija el punto tocando el mapa.
Future<ResultadoUbicacion> obtenerUbicacionActual() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return (punto: null, motivo: 'El GPS está apagado. Toca el mapa para elegir el punto.');
    }
    var permiso = await Geolocator.checkPermission();
    if (permiso == LocationPermission.denied) permiso = await Geolocator.requestPermission();
    if (permiso == LocationPermission.denied || permiso == LocationPermission.deniedForever) {
      return (punto: null, motivo: 'Sin permiso de ubicación. Toca el mapa para elegir el punto.');
    }
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
    return (punto: LatLng(p.latitude, p.longitude), motivo: null);
  } catch (_) {
    return (punto: null, motivo: 'No se pudo obtener la ubicación. Toca el mapa para elegir el punto.');
  }
}
