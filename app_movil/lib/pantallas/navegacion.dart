import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../estado/sesion.dart';
import 'ciudadano/detalle_reporte.dart';
import 'supervisor/detalle_supervisor.dart';

/// Abre el detalle de un incidente con la pantalla adecuada según el rol.
Future<void> abrirDetalleIncidente(BuildContext context, String incidenteId) {
  final esSupervisor = context.read<Sesion>().usuario?.esSupervisor ?? false;
  return Navigator.of(context).push(MaterialPageRoute<void>(
    builder: (_) => esSupervisor
        ? DetalleSupervisor(incidenteId: incidenteId)
        : DetalleReporte(incidenteId: incidenteId),
  ));
}
