import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/cliente_api.dart';

// ---------------- Textos y colores del dominio ----------------

const nombresCategoria = {
  'infraestructura': 'Infraestructura',
  'seguridad': 'Seguridad',
  'desastre_natural': 'Desastre natural',
};

const nombresEstado = {
  'pendiente': 'Pendiente',
  'confirmado': 'Confirmado',
  'asignado': 'Asignado',
  'en_atencion': 'En atención',
  'resuelto': 'Resuelto',
  'recibido': 'Recibido',
  'reasignado': 'Reasignado',
};

const nombresPrioridad = {'baja': 'Baja', 'media': 'Media', 'alta': 'Alta'};

const nombresOrigen = {
  'automatica': 'calculada automáticamente',
  'respaldo': 'de respaldo (se recalculará)',
  'supervisor': 'fijada por el supervisor',
};

Color colorCategoria(String categoria) => switch (categoria) {
      'infraestructura' => const Color(0xFFE08A00),
      'seguridad' => const Color(0xFF5E35B1),
      'desastre_natural' => const Color(0xFFC62828),
      _ => Colors.blueGrey,
    };

IconData iconoCategoria(String categoria) => switch (categoria) {
      'infraestructura' => Icons.construction,
      'seguridad' => Icons.shield_outlined,
      'desastre_natural' => Icons.flood_outlined,
      _ => Icons.report_outlined,
    };

Color colorPrioridad(String prioridad) => switch (prioridad) {
      'alta' => const Color(0xFFC62828),
      'media' => const Color(0xFFEF6C00),
      _ => const Color(0xFF2E7D32),
    };

Color colorEstado(String estado) => switch (estado) {
      'pendiente' => Colors.blueGrey,
      'confirmado' => const Color(0xFF1565C0),
      'asignado' || 'recibido' => const Color(0xFF6A1B9A),
      'en_atencion' => const Color(0xFFEF6C00),
      'resuelto' => const Color(0xFF2E7D32),
      _ => Colors.grey,
    };

String formatoFecha(DateTime f) => DateFormat('dd/MM/yyyy HH:mm').format(f);

// ---------------- Widgets ----------------

/// Etiqueta pequeña de color (estado, prioridad...).
class Etiqueta extends StatelessWidget {
  const Etiqueta(this.texto, this.color, {super.key, this.icono});

  final String texto;
  final Color color;
  final IconData? icono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icono != null) ...[Icon(icono, size: 14, color: color), const SizedBox(width: 4)],
        Text(texto, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class EtiquetaEstado extends StatelessWidget {
  const EtiquetaEstado(this.estado, {super.key});
  final String estado;

  @override
  Widget build(BuildContext context) => Etiqueta(nombresEstado[estado] ?? estado, colorEstado(estado));
}

class EtiquetaPrioridad extends StatelessWidget {
  const EtiquetaPrioridad(this.prioridad, {super.key});
  final String prioridad;

  @override
  Widget build(BuildContext context) => Etiqueta(
        'Prioridad ${nombresPrioridad[prioridad] ?? prioridad}',
        colorPrioridad(prioridad),
        icono: Icons.flag_outlined,
      );
}

/// Avatar con el icono y color de la categoría.
class AvatarCategoria extends StatelessWidget {
  const AvatarCategoria(this.categoria, {super.key});
  final String categoria;

  @override
  Widget build(BuildContext context) => CircleAvatar(
        backgroundColor: colorCategoria(categoria).withValues(alpha: 0.15),
        child: Icon(iconoCategoria(categoria), color: colorCategoria(categoria)),
      );
}

/// Pantalla de error con botón "Reintentar" (RNF-DIS-02: la app nunca se cierra).
class VistaError extends StatelessWidget {
  const VistaError({super.key, required this.mensaje, required this.alReintentar});

  final String mensaje;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.cloud_off, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: alReintentar, icon: const Icon(Icons.refresh), label: const Text('Reintentar')),
        ]),
      ),
    );
  }
}

/// Mensaje cuando una lista está vacía.
class VistaVacia extends StatelessWidget {
  const VistaVacia({super.key, required this.icono, required this.mensaje});

  final IconData icono;
  final String mensaje;

  @override
  Widget build(BuildContext context) {
    // ListView para que el RefreshIndicator funcione aunque no haya elementos.
    return ListView(children: [
      const SizedBox(height: 120),
      Icon(icono, size: 56, color: Theme.of(context).colorScheme.outline),
      const SizedBox(height: 12),
      Text(mensaje, textAlign: TextAlign.center),
    ]);
  }
}

String mensajeDe(Object error) =>
    error is ApiException ? error.mensaje : 'Ocurrió un error inesperado. Intenta de nuevo.';

/// SnackBar de error en español; si se pasa [reintentar], muestra el botón "Reintentar".
void mostrarError(BuildContext context, Object error, {VoidCallback? reintentar}) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(mensajeDe(error)),
    behavior: SnackBarBehavior.floating,
    duration: const Duration(seconds: 6),
    action: reintentar == null ? null : SnackBarAction(label: 'Reintentar', onPressed: reintentar),
  ));
}

void mostrarMensaje(BuildContext context, String texto) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(content: Text(texto), behavior: SnackBarBehavior.floating));
}

/// Fila "etiqueta: valor" para fichas de detalle.
class Dato extends StatelessWidget {
  const Dato(this.etiqueta, this.valor, {super.key});

  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 110,
          child: Text(etiqueta, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ),
        Expanded(child: Text(valor)),
      ]),
    );
  }
}

/// Línea de tiempo simple para historiales.
class EntradaHistorial extends StatelessWidget {
  const EntradaHistorial({super.key, required this.estado, required this.fecha, this.comentario, this.ultimo = false});

  final String estado;
  final DateTime fecha;
  final String? comentario;
  final bool ultimo;

  @override
  Widget build(BuildContext context) {
    final color = colorEstado(estado);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Column(children: [
          Icon(Icons.circle, size: 14, color: color),
          if (!ultimo) Expanded(child: Container(width: 2, color: color.withValues(alpha: 0.3))),
        ]),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(nombresEstado[estado] ?? estado, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
              Text(formatoFecha(fecha), style: Theme.of(context).textTheme.bodySmall),
              if (comentario != null && comentario!.isNotEmpty) Text(comentario!),
            ]),
          ),
        ),
      ]),
    );
  }
}
