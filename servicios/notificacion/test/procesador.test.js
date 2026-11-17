const { crearLogger } = require('@urbansync/comun');
const { crearProcesador } = require('../src/eventos/procesador');

const logger = crearLogger('notificacion-test');
logger.level = 'silent';

function montar({ procesados = [] } = {}) {
  const vistos = new Set(procesados);
  const insertadas = [];
  const repo = {
    yaProcesado: jest.fn(async (id) => vistos.has(id)),
    marcarProcesado: jest.fn(async (cx, id) => { if (vistos.has(id)) return false; vistos.add(id); return true; }),
    insertar: jest.fn(async (cx, n) => insertadas.push(n)),
  };
  const db = { enTransaccion: async (fn) => fn({}) };
  const clienteUsuario = { idsPorRol: jest.fn(async () => ['sup1', 'sup2']) };
  return { repo, insertadas, clienteUsuario, procesar: crearProcesador({ db, repo, clienteUsuario, logger }) };
}
const sobre = (tipo, datos, eventoId = 'ev1') => ({ eventoId, tipo, incidenteId: 'i1', datos });

describe('Procesador de eventos de Notificación', () => {
  test('RF-NOT-02: incidente de prioridad alta notifica a cada supervisor', async () => {
    const { procesar, insertadas } = montar();
    await procesar(sobre('incidente.creado', { prioridad: 'alta', titulo: 'Inundación', categoria: 'desastre_natural' }));
    expect(insertadas.map((n) => n.usuarioId)).toEqual(['sup1', 'sup2']);
    expect(insertadas[0]).toMatchObject({ titulo: 'Incidente de prioridad alta', incidenteId: 'i1' });
  });

  test('incidente de prioridad baja no genera notificaciones pero el evento queda procesado', async () => {
    const { procesar, insertadas, repo, clienteUsuario } = montar();
    await procesar(sobre('incidente.creado', { prioridad: 'baja', titulo: 'Hueco' }));
    expect(insertadas).toHaveLength(0);
    expect(clienteUsuario.idsPorRol).not.toHaveBeenCalled();
    expect(repo.marcarProcesado).toHaveBeenCalled();
  });

  test('RF-NOT-03 / RF-NOT-01: asignacion.creada avisa al ente y al ciudadano', async () => {
    const { procesar, insertadas } = montar();
    await procesar(sobre('asignacion.creada', { enteId: 'e1', ciudadanoId: 'c1', titulo: 'Hueco' }));
    expect(insertadas.map((n) => n.usuarioId)).toEqual(['e1', 'c1']);
  });

  test('estado resuelto incluye la solución en el mensaje del ciudadano', async () => {
    const { procesar, insertadas } = montar();
    await procesar(sobre('asignacion.estado_actualizado', { estado: 'resuelto', ciudadanoId: 'c1', titulo: 'Hueco', solucion: 'Se tapó el hueco' }));
    expect(insertadas[0]).toMatchObject({ usuarioId: 'c1', titulo: 'Reporte resuelto' });
    expect(insertadas[0].mensaje).toContain('Se tapó el hueco');
  });

  test('idempotencia: el mismo eventoId dos veces genera notificaciones una sola vez', async () => {
    const { procesar, insertadas } = montar();
    const e = sobre('incidente.confirmado', { ciudadanoId: 'c1', titulo: 'Hueco' }, 'ev-dup');
    await procesar(e);
    await procesar(e);
    expect(insertadas).toHaveLength(1);
  });

  test('un evento con datos inválidos lanza error (para que mensajeria reintente y lo mande a la DLQ)', async () => {
    const { procesar } = montar();
    await expect(procesar(sobre('incidente.creado', null))).rejects.toThrow();
  });

  test('un tipo desconocido se ignora sin error', async () => {
    const { procesar, insertadas } = montar();
    await expect(procesar(sobre('evento.raro', {}))).resolves.toBeUndefined();
    expect(insertadas).toHaveLength(0);
  });
});
