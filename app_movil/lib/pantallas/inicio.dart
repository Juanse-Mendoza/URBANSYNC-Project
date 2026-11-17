import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../estado/sesion.dart';
import '../servicios/alertas.dart';
import 'ciudadano/mis_reportes.dart';
import 'comun/mapa.dart';
import 'comun/notificaciones.dart';
import 'comun/perfil.dart';
import 'ente/mis_asignaciones.dart';
import 'supervisor/bandeja.dart';

/// Contenedor principal con navegación inferior.
/// Todos los roles ven las pestañas en el MISMO orden (RNF-USA-03):
///   1. Principal del rol  2. Mapa  3. Alertas (con badge)  4. Perfil
class Inicio extends StatefulWidget {
  const Inicio({super.key});

  @override
  State<Inicio> createState() => _InicioState();
}

class _InicioState extends State<Inicio> {
  static const _pestanaAlertas = 2;
  int _indice = 0;

  @override
  void initState() {
    super.initState();
    final sesion = context.read<Sesion>();
    // Tocar una notificación del sistema abre la pestaña de alertas.
    Alertas.instancia.alTocarNotificacion = () {
      if (mounted) setState(() => _indice = _pestanaAlertas);
    };
    Alertas.instancia.iniciar(sesion.api, sesion.usuario!.id);
  }

  @override
  void dispose() {
    Alertas.instancia.detener();
    Alertas.instancia.alTocarNotificacion = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final usuario = context.watch<Sesion>().usuario!;
    final (Widget principal, String etiqueta, IconData icono) = switch (usuario.rol) {
      'ciudadano' => (const MisReportes(), 'Reportes', Icons.assignment_outlined),
      'supervisor' => (const Bandeja(), 'Bandeja', Icons.inbox_outlined),
      'ente_gestion' => (const MisAsignaciones(), 'Asignaciones', Icons.engineering_outlined),
      _ => (const _SinPanel(), 'Inicio', Icons.home_outlined),
    };

    return Scaffold(
      body: IndexedStack(index: _indice, children: [
        principal,
        PantallaMapa(activa: _indice == 1),
        PantallaNotificaciones(activa: _indice == _pestanaAlertas),
        const PantallaPerfil(),
      ]),
      bottomNavigationBar: ValueListenableBuilder<int>(
        valueListenable: Alertas.instancia.conteo,
        builder: (context, conteo, _) => NavigationBar(
          selectedIndex: _indice,
          onDestinationSelected: (i) => setState(() => _indice = i),
          destinations: [
            NavigationDestination(icon: Icon(icono), label: etiqueta),
            const NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Mapa'),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: conteo > 0,
                label: Text(conteo > 99 ? '99+' : '$conteo'),
                child: const Icon(Icons.notifications_outlined),
              ),
              label: 'Alertas',
            ),
            const NavigationDestination(icon: Icon(Icons.person_outline), label: 'Perfil'),
          ],
        ),
      ),
    );
  }
}

/// El administrador gestiona cuentas por la API (POST /api/usuarios); la app no tiene panel.
class _SinPanel extends StatelessWidget {
  const _SinPanel();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('URBANSYNC')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text('La administración de cuentas se realiza desde la API.', textAlign: TextAlign.center),
          ),
        ),
      );
}
