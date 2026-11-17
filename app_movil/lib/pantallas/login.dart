import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../estado/sesion.dart';
import '../widgets/comunes.dart';
import 'registro.dart';

class Login extends StatefulWidget {
  const Login({super.key});

  @override
  State<Login> createState() => _LoginState();
}

class _LoginState extends State<Login> {
  final _form = GlobalKey<FormState>();
  final _correo = TextEditingController();
  final _contrasena = TextEditingController();
  bool _ocultar = true;
  bool _enviando = false;

  static const _cuentasDemo = {
    'Ciudadano': 'ciudadano@urbansync.co',
    'Supervisor': 'supervisor@urbansync.co',
    'Ente infraestructura': 'ente.infra@urbansync.co',
    'Ente seguridad': 'ente.seguridad@urbansync.co',
    'Ente emergencias': 'ente.emergencias@urbansync.co',
  };

  @override
  void initState() {
    super.initState();
    final aviso = context.read<Sesion>().aviso;
    if (aviso != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) mostrarMensaje(context, aviso);
      });
    }
  }

  @override
  void dispose() {
    _correo.dispose();
    _contrasena.dispose();
    super.dispose();
  }

  Future<void> _ingresar() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _enviando = true);
    try {
      await context.read<Sesion>().iniciarSesion(_correo.text, _contrasena.text);
    } catch (e) {
      if (mounted) mostrarError(context, e, reintentar: _ingresar);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _form,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Icon(Icons.location_city, size: 64, color: tema.colorScheme.primary),
                const SizedBox(height: 8),
                Text('URBANSYNC', textAlign: TextAlign.center, style: tema.textTheme.headlineMedium),
                Text('Reporta y sigue los incidentes de tu barrio',
                    textAlign: TextAlign.center, style: tema.textTheme.bodyMedium),
                const SizedBox(height: 32),
                TextFormField(
                  controller: _correo,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Correo', prefixIcon: Icon(Icons.email_outlined)),
                  validator: (v) => (v == null || !v.contains('@')) ? 'Escribe un correo válido' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _contrasena,
                  obscureText: _ocultar,
                  decoration: InputDecoration(
                    labelText: 'Contraseña',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      tooltip: _ocultar ? 'Mostrar' : 'Ocultar',
                      icon: Icon(_ocultar ? Icons.visibility : Icons.visibility_off),
                      onPressed: () => setState(() => _ocultar = !_ocultar),
                    ),
                  ),
                  validator: (v) => (v == null || v.isEmpty) ? 'Escribe tu contraseña' : null,
                  onFieldSubmitted: (_) => _ingresar(),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _enviando ? null : _ingresar,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: _enviando
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Ingresar'),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const Registro())),
                  child: const Text('¿No tienes cuenta? Regístrate'),
                ),
                const SizedBox(height: 16),
                ExpansionTile(
                  title: const Text('Cuentas de demostración'),
                  subtitle: Text('Contraseña: Urbansync2026*', style: tema.textTheme.bodySmall),
                  children: [
                    for (final c in _cuentasDemo.entries)
                      ListTile(
                        dense: true,
                        title: Text(c.key),
                        subtitle: Text(c.value),
                        onTap: () => setState(() {
                          _correo.text = c.value;
                          _contrasena.text = 'Urbansync2026*';
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('Servidor: $apiUrl', textAlign: TextAlign.center, style: tema.textTheme.bodySmall),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
