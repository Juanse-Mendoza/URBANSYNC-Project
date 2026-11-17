import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../estado/sesion.dart';
import '../../modelos/incidente.dart';
import '../../widgets/comunes.dart';
import 'detalle_supervisor.dart';

/// Bandeja del supervisor con filtros por estado, prioridad y categoría (RF-CLA-04).
/// El backend ordena primero por prioridad y luego por fecha.
class Bandeja extends StatefulWidget {
  const Bandeja({super.key});

  @override
  State<Bandeja> createState() => _BandejaState();
}

class _BandejaState extends State<Bandeja> {
  String? _estado = 'pendiente';
  String? _prioridad;
  String? _categoria;
  List<Incidente>? _incidentes;
  int _total = 0;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final r = await context.read<Sesion>().api.get('/api/incidentes', query: {
        'limite': '50',
        'estado': ?_estado,
        'prioridad': ?_prioridad,
        'categoria': ?_categoria,
      }) as Map<String, dynamic>;
      final lista = (r['datos'] as List<dynamic>).map((e) => Incidente.fromJson(e as Map<String, dynamic>)).toList();
      if (mounted) {
        setState(() {
          _incidentes = lista;
          _total = (r['paginacion']['total'] as num).toInt();
          _error = null;
        });
      }
    } catch (e) {
      if (!mounted) return;
      if (_incidentes == null) {
        setState(() => _error = e);
      } else {
        mostrarError(context, e, reintentar: _cargar);
      }
    }
  }

  Widget _filtro(String etiqueta, String? valor, Map<String, String> opciones, ValueChanged<String?> alCambiar) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: DropdownButton<String?>(
        value: valor,
        hint: Text(etiqueta),
        underline: const SizedBox.shrink(),
        items: [
          DropdownMenuItem<String?>(value: null, child: Text('$etiqueta: todos')),
          for (final o in opciones.entries) DropdownMenuItem<String?>(value: o.key, child: Text(o.value)),
        ],
        onChanged: (v) {
          alCambiar(v);
          _cargar();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const estados = {
      'pendiente': 'Pendiente',
      'confirmado': 'Confirmado',
      'asignado': 'Asignado',
      'en_atencion': 'En atención',
      'resuelto': 'Resuelto',
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bandeja de incidentes'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              _filtro('Estado', _estado, estados, (v) => setState(() => _estado = v)),
              _filtro('Prioridad', _prioridad, nombresPrioridad, (v) => setState(() => _prioridad = v)),
              _filtro('Categoría', _categoria, nombresCategoria, (v) => setState(() => _categoria = v)),
            ]),
          ),
        ),
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_error != null && _incidentes == null) {
      return VistaError(mensaje: mensajeDe(_error!), alReintentar: () {
        setState(() => _error = null);
        _cargar();
      });
    }
    final lista = _incidentes;
    if (lista == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _cargar,
      child: lista.isEmpty
          ? const VistaVacia(icono: Icons.inbox_outlined, mensaje: 'No hay incidentes con estos filtros.')
          : ListView.builder(
              padding: const EdgeInsets.only(top: 4, bottom: 16),
              itemCount: lista.length + 1,
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: Text('$_total incidente(s)', style: Theme.of(context).textTheme.bodySmall),
                  );
                }
                final inc = lista[i - 1];
                return Card(
                  child: ListTile(
                    leading: AvatarCategoria(inc.categoria),
                    title: Text(inc.titulo, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(spacing: 6, runSpacing: 4, children: [
                        EtiquetaPrioridad(inc.prioridad),
                        EtiquetaEstado(inc.estado),
                        if (inc.recalcular) const Etiqueta('Recalculando', Colors.grey, icono: Icons.sync),
                        Text(formatoFecha(inc.creadoEn), style: Theme.of(context).textTheme.bodySmall),
                      ]),
                    ),
                    onTap: () async {
                      await Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => DetalleSupervisor(incidenteId: inc.id)));
                      _cargar();
                    },
                  ),
                );
              },
            ),
    );
  }
}
