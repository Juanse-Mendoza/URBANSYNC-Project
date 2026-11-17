import 'package:flutter_test/flutter_test.dart';
import 'package:urbansync/modelos/incidente.dart';
import 'package:urbansync/modelos/notificacion.dart';

void main() {
  test('Incidente.fromJson interpreta la respuesta del backend', () {
    final inc = Incidente.fromJson({
      'id': 'i1',
      'ciudadano_id': 'c1',
      'titulo': 'Hueco',
      'descripcion': null,
      'categoria': 'infraestructura',
      'subcategoria': 'hueco_via',
      'prioridad': 'alta',
      'prioridad_origen': 'automatica',
      'recalcular_prioridad': false,
      'estado': 'pendiente',
      'ente_asignado_id': null,
      'lat': 4,
      'lng': -74.08,
      'radio_m': 50,
      'version': 1,
      'creado_en': '2026-11-17T02:00:00.000Z',
      'historial': [
        {'estado_anterior': null, 'estado_nuevo': 'pendiente', 'comentario': 'Reporte creado', 'creado_en': '2026-11-17T02:00:00.000Z'},
      ],
    });
    expect(inc.lat, 4.0); // un entero en el JSON se convierte en double
    expect(inc.historial.single.nuevo, 'pendiente');
    expect(inc.version, 1);
  });

  test('Notificacion.fromJson', () {
    final n = Notificacion.fromJson({
      'id': 'n1',
      'tipo': 'asignacion.creada',
      'titulo': 'Nuevo incidente asignado',
      'mensaje': 'Se te asignó el incidente «Hueco»',
      'incidente_id': 'i1',
      'leida': false,
      'creado_en': '2026-11-17T02:00:00.000Z',
    });
    expect(n.leida, isFalse);
    expect(n.incidenteId, 'i1');
  });
}
