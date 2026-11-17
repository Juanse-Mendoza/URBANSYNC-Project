import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Capa de teselas de OpenStreetMap con la atribución obligatoria.
List<Widget> capasBaseMapa() => [
      TileLayer(
        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        userAgentPackageName: 'co.edu.umb.urbansync',
      ),
      const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
    ];

/// Círculo del radio afectado (en metros reales).
CircleLayer capaRadio(LatLng punto, double radioM, Color color) => CircleLayer(circles: [
      CircleMarker(
        point: punto,
        radius: radioM,
        useRadiusInMeter: true,
        color: color.withValues(alpha: 0.18),
        borderColor: color,
        borderStrokeWidth: 2,
      ),
    ]);

/// Marcador en forma de pin.
Marker pin(LatLng punto, Color color, {VoidCallback? alTocar, double tamano = 40}) => Marker(
      point: punto,
      width: tamano,
      height: tamano,
      alignment: Alignment.topCenter,
      child: GestureDetector(
        onTap: alTocar,
        child: Icon(Icons.location_on, color: color, size: tamano),
      ),
    );
