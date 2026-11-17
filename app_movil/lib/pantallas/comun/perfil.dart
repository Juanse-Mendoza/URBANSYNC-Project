import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config.dart';
import '../../estado/sesion.dart';
import '../../modelos/usuario.dart';
import '../../widgets/comunes.dart';

const _nombresRol = {
  'ciudadano': 'Ciudadano',
  'supervisor': 'Supervisor',
  'ente_gestion': 'Ente de gestión',
  'admin': 'Administrador',
};

/// Perfil propio. El ciudadano puede editar nombre, teléfono y barrio (el rol no se cambia).
class PantallaPerfil extends StatefulWidget {
  const PantallaPerfil({super.key});

  @override
  State<PantallaPerfil> createState() => _PantallaPerfilState();
}

class _PantallaPerfilState extends State<PantallaPerfil> {
  Usuario? _perfil;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await context.read<Sesion>().api.get('/api/usuarios/me') as Map<String, dynamic>;
      if (mounted) setState(() => (_perfil = Usuario.fromJson(r), _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _editar() async {
    final p = _perfil!;
    final nombre = TextEditingController(text: p.nombre);
    final telefono = TextEditingController(text: p.telefono ?? '');
    final barrio = TextEditingController(text: p.barrio ?? '');
    final guardar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Editar perfil'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nombre, decoration: const InputDecoration(labelText: 'Nombre')),
            const SizedBox(height: 12),
            TextField(
              controller: telefono,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Teléfono'),
            ),
            const SizedBox(height: 12),
            TextField(controller: barrio, decoration: const InputDecoration(labelText: 'Barrio')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Guardar')),
        ],
      ),
    );
    final datos = {
      'nombre': nombre.text.trim(),
      if (telefono.text.trim().isNotEmpty) 'telefono': telefono.text.trim(),
      'barrio': barrio.text.trim().isEmpty ? null : barrio.text.trim(),
    };
    nombre.dispose();
    telefono.dispose();
    barrio.dispose();
    if (guardar != true || !mounted) return;
    try {
      final r = await context.read<Sesion>().api.put('/api/usuarios/me', datos) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _perfil = Usuario.fromJson(r));
      mostrarMensaje(context, 'Perfil actualizado');
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }

  Future<void> _salir() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text('¿Quieres cerrar tu sesión en este dispositivo?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cerrar sesión')),
        ],
      ),
    );
    if (ok == true && mounted) await context.read<Sesion>().cerrarSesion();
  }

  @override
  Widget build(BuildContext context) {
    final p = _perfil;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi perfil'),
        actions: [
          if (p != null && p.esCiudadano) IconButton(tooltip: 'Editar', onPressed: _editar, icon: const Icon(Icons.edit)),
        ],
      ),
      body: p == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : VistaError(mensaje: mensajeDe(_error!), alReintentar: () {
                  setState(() => _error = null);
                  _cargar();
                }))
          : RefreshIndicator(
              onRefresh: _cargar,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                CircleAvatar(
                  radius: 36,
                  child: Text(p.nombre.isNotEmpty ? p.nombre[0].toUpperCase() : '?', style: const TextStyle(fontSize: 28)),
                ),
                const SizedBox(height: 12),
                Text(p.nombre, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
                Center(child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Etiqueta(_nombresRol[p.rol] ?? p.rol, Theme.of(context).colorScheme.primary),
                )),
                const SizedBox(height: 16),
                Card(
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(children: [
                      Dato('Correo', p.correo ?? '-'),
                      Dato('Teléfono', p.telefono ?? '-'),
                      if (p.esCiudadano) Dato('Barrio', p.barrio ?? '-'),
                      if (p.categoriaAtencion != null)
                        Dato('Atiende', nombresCategoria[p.categoriaAtencion] ?? p.categoriaAtencion!),
                    ]),
                  ),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(onPressed: _salir, icon: const Icon(Icons.logout), label: const Text('Cerrar sesión')),
                const SizedBox(height: 16),
                Text('Servidor: $apiUrl', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
    );
  }
}
