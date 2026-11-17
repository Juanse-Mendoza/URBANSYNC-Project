import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/cliente_api.dart';
import 'estado/sesion.dart';
import 'pantallas/inicio.dart';
import 'pantallas/login.dart';

/// Permite cerrar las pantallas abiertas cuando la sesión termina o expira.
final navegador = GlobalKey<NavigatorState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = Sesion(ClienteApi())..cargar();
  sesion.addListener(() {
    if (!sesion.cargando && !sesion.autenticado) {
      navegador.currentState?.popUntil((ruta) => ruta.isFirst);
    }
  });
  runApp(ChangeNotifierProvider<Sesion>.value(value: sesion, child: const UrbanSyncApp()));
}

class UrbanSyncApp extends StatelessWidget {
  const UrbanSyncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'URBANSYNC',
      navigatorKey: navegador,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1F5F8B)), // azul sobrio
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
        cardTheme: const CardThemeData(margin: EdgeInsets.symmetric(horizontal: 12, vertical: 6)),
      ),
      home: const _Raiz(),
    );
  }
}

/// Decide entre login e inicio según el estado de la sesión.
class _Raiz extends StatelessWidget {
  const _Raiz();

  @override
  Widget build(BuildContext context) {
    final sesion = context.watch<Sesion>();
    if (sesion.cargando) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    // La clave por usuario reinicia el estado de Inicio al cambiar de cuenta.
    return sesion.autenticado ? Inicio(key: ValueKey(sesion.usuario!.id)) : const Login();
  }
}
