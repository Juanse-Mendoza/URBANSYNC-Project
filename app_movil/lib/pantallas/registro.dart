import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../estado/sesion.dart';
import '../widgets/comunes.dart';

/// Registro de ciudadano (RF-USU-01). Al terminar inicia sesión automáticamente.
class Registro extends StatefulWidget {
  const Registro({super.key});

  @override
  State<Registro> createState() => _RegistroState();
}

class _RegistroState extends State<Registro> {
  final _form = GlobalKey<FormState>();
  final _nombre = TextEditingController();
  final _correo = TextEditingController();
  final _contrasena = TextEditingController();
  final _telefono = TextEditingController();
  final _barrio = TextEditingController();
  bool _enviando = false;

  @override
  void dispose() {
    for (final c in [_nombre, _correo, _contrasena, _telefono, _barrio]) {
      c.dispose();
    }
    super.dispose();
  }

  // Mismas reglas que el backend (zod), para avisar antes de enviar.
  String? _validarContrasena(String? v) {
    if (v == null || v.length < 8) return 'Mínimo 8 caracteres';
    if (!RegExp('[A-Za-z]').hasMatch(v)) return 'Debe contener al menos una letra';
    if (!RegExp('[0-9]').hasMatch(v)) return 'Debe contener al menos un número';
    return null;
  }

  Future<void> _registrar() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _enviando = true);
    final sesion = context.read<Sesion>();
    try {
      await sesion.api.post('/api/usuarios/registro', {
        'nombre': _nombre.text.trim(),
        'correo': _correo.text.trim(),
        'contrasena': _contrasena.text,
        'telefono': _telefono.text.trim(),
        if (_barrio.text.trim().isNotEmpty) 'barrio': _barrio.text.trim(),
      });
      await sesion.iniciarSesion(_correo.text, _contrasena.text);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) mostrarError(context, e, reintentar: _registrar);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear cuenta')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextFormField(
              controller: _nombre,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nombre completo', prefixIcon: Icon(Icons.person_outline)),
              validator: (v) => (v == null || v.trim().length < 2) ? 'Escribe tu nombre' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _correo,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Correo', prefixIcon: Icon(Icons.email_outlined)),
              validator: (v) => (v == null || !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim()))
                  ? 'Escribe un correo válido'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _contrasena,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Contraseña',
                helperText: 'Mínimo 8 caracteres, con letras y números',
                prefixIcon: Icon(Icons.lock_outline),
              ),
              validator: _validarContrasena,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _telefono,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Teléfono', prefixIcon: Icon(Icons.phone_outlined)),
              validator: (v) => (v == null || !RegExp(r'^\+?[0-9 ]{7,20}$').hasMatch(v.trim()))
                  ? 'Escribe un teléfono válido (7 a 20 dígitos)'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _barrio,
              decoration: const InputDecoration(labelText: 'Barrio (opcional)', prefixIcon: Icon(Icons.home_outlined)),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _enviando ? null : _registrar,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: _enviando
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Crear cuenta'),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
