const { crearLogger, AppError } = require('@urbansync/comun');
const { crearServicioIncidentes } = require('../src/servicios/incidentes');
const { crearConsumidorAsignaciones } = require('../src/eventos/consumidorAsignaciones');

const logger = crearLogger('clasificacion-test');
logger.level = 'silent';

const CATEGORIAS = [
  { codigo: 'infraestructura', nombre: 'Infraestructura', prioridad_base: 'baja', subcategorias: [{ codigo: 'hueco_via' }] },
  { codigo: 'seguridad', nombre: 'Seguridad', prioridad_base: 'media', subcategorias: [{ codigo: 'robo' }] },
];
const DATOS = { titulo: 'Hueco grande', categoria: 'infraestructura', subcategoria: 'hueco_via', lat: 4.6, lng: -74.08, radio_m: 50 };

/** Transacción falsa: registra todas las consultas que se ejecutan dentro. */
function crearDbFalsa() {
  const cx = { consultas: [], query: jest.fn(async (sql, params) => { cx.consultas.push({ sql, params }); return { rows: [], rowCount: 1 }; }) };
  return { cx, enTransaccion: async (fn) => fn(cx) };
}

function crearRepoFalso(inicial = []) {
  const incidentes = [...inicial];
  return {
    incidentes,
    categorias: async () => CATEGORIAS,
    buscarPorIdempotencia: jest.fn(async (c, k) => incidentes.find((i) => i.ciudadano_id === c && i.idempotency_key === k) || null),
    insertar: jest.fn(async (cx, d) => {
      const inc = { id: d.id, ciudadano_id: d.ciudadanoId, idempotency_key: d.idempotencyKey, titulo: d.titulo, categoria: d.categoria,
        prioridad: d.prioridad, prioridad_origen: d.prioridadOrigen, recalcular_prioridad: d.recalcular, estado: 'pendiente', version: 1 };
      incidentes.push(inc);
      return inc;
    }),
    insertarHistorial: jest.fn(async () => {}),
    buscarPorId: async (id) => incidentes.find((i) => i.id === id) || null,
    historial: async () => [],
    actualizarClasificacion: jest.fn(async () => null),
  };
}

function montar({ similares = 1, ubicacionesFalla = false, inicial } = {}) {
  const db = crearDbFalsa();
  const repo = crearRepoFalso(inicial);
  const clienteUbicaciones = {
    registrar: jest.fn(async () => {
      if (ubicacionesFalla) throw new AppError(503, 'SERVICIO_NO_DISPONIBLE', 'caído');
      return similares;
    }),
  };
  const servicio = crearServicioIncidentes({ db, repo, clienteUbicaciones, logger });
  return { db, repo, clienteUbicaciones, servicio };
}

describe('Crear incidente', () => {
  test('con 5 similares la prioridad es alta y el evento va al outbox en la misma transacción', async () => {
    const { servicio, db } = montar({ similares: 5 });
    const { incidente, creado } = await servicio.crear({ ciudadanoId: 'c1', idempotencyKey: 'clave-0001', datos: DATOS });
    expect(creado).toBe(true);
    expect(incidente).toMatchObject({ prioridad: 'alta', prioridad_origen: 'automatica', recalcular_prioridad: false });
    const outbox = db.cx.consultas.find((c) => c.sql.includes('INSERT INTO outbox'));
    expect(outbox.params[1]).toBe('incidente.creado');
    expect(outbox.params[2].datos).toMatchObject({ ciudadanoId: 'c1', prioridad: 'alta', categoria: 'infraestructura' });
  });

  test('PT-02: si Ubicaciones falla se guarda igual con prioridad de respaldo', async () => {
    const { servicio } = montar({ ubicacionesFalla: true });
    const { incidente, creado } = await servicio.crear({ ciudadanoId: 'c1', idempotencyKey: 'clave-0002', datos: DATOS });
    expect(creado).toBe(true);
    expect(incidente).toMatchObject({ prioridad: 'baja', prioridad_origen: 'respaldo', recalcular_prioridad: true });
  });

  test('PC-03: la misma Idempotency-Key devuelve el original sin llamar a Ubicaciones', async () => {
    const original = { id: 'i1', ciudadano_id: 'c1', idempotency_key: 'clave-0003', estado: 'pendiente' };
    const { servicio, clienteUbicaciones, repo } = montar({ inicial: [original] });
    const r = await servicio.crear({ ciudadanoId: 'c1', idempotencyKey: 'clave-0003', datos: DATOS });
    expect(r).toEqual({ incidente: original, creado: false });
    expect(clienteUbicaciones.registrar).not.toHaveBeenCalled();
    expect(repo.insertar).not.toHaveBeenCalled();
  });

  test('subcategoría de otra categoría -> 400', async () => {
    const { servicio } = montar();
    await expect(servicio.crear({ ciudadanoId: 'c1', idempotencyKey: 'clave-0004', datos: { ...DATOS, subcategoria: 'robo' } }))
      .rejects.toMatchObject({ status: 400, codigo: 'SUBCATEGORIA_INVALIDA' });
  });
});

describe('Detalle y clasificación', () => {
  const inc = { id: 'i1', ciudadano_id: 'c1', ente_asignado_id: 'e1', estado: 'pendiente', version: 3, categoria: 'seguridad', prioridad: 'media' };

  test('OWASP API1: un ciudadano no puede ver incidentes ajenos', async () => {
    const { servicio } = montar({ inicial: [inc] });
    await expect(servicio.detalle('i1', { id: 'c2', rol: 'ciudadano' })).rejects.toMatchObject({ status: 403 });
    await expect(servicio.detalle('i1', { id: 'c1', rol: 'ciudadano' })).resolves.toMatchObject({ id: 'i1' });
    await expect(servicio.detalle('i1', { id: 'e1', rol: 'ente_gestion' })).resolves.toMatchObject({ id: 'i1' });
    await expect(servicio.detalle('i1', { id: 'e2', rol: 'ente_gestion' })).rejects.toMatchObject({ status: 403 });
  });

  test('RF-CLA-05: una versión desactualizada -> 409 sin tocar la BD', async () => {
    const { servicio, repo } = montar({ inicial: [inc] });
    await expect(servicio.clasificar('i1', { id: 's1', rol: 'supervisor' }, { confirmar: true, version: 2 }))
      .rejects.toMatchObject({ status: 409, codigo: 'VERSION_CONFLICTO' });
    expect(repo.actualizarClasificacion).not.toHaveBeenCalled();
  });
});

describe('Consumidor de eventos de asignación', () => {
  function montarConsumidor(estado, yaProcesado = false) {
    const fila = { id: 'i1', estado, ente_asignado_id: null };
    const repo = {
      marcarEventoProcesado: jest.fn(async () => !yaProcesado),
      bloquearPorId: jest.fn(async () => fila),
      aplicarEstadoEvento: jest.fn(async () => {}),
      insertarHistorial: jest.fn(async () => {}),
    };
    const db = { enTransaccion: async (fn) => fn({}) };
    return { repo, procesar: crearConsumidorAsignaciones({ db, repo, logger }) };
  }
  const evento = (tipo, datos) => ({ eventoId: 'ev1', tipo, incidenteId: 'i1', datos });

  test('asignacion.creada pasa el incidente a "asignado" con el ente', async () => {
    const { repo, procesar } = montarConsumidor('confirmado');
    await procesar(evento('asignacion.creada', { enteId: 'e1', supervisorId: 's1' }));
    expect(repo.aplicarEstadoEvento).toHaveBeenCalledWith({}, 'i1', 'asignado', 'e1');
    expect(repo.insertarHistorial).toHaveBeenCalled();
  });

  test('evento duplicado no aplica cambios (idempotencia)', async () => {
    const { repo, procesar } = montarConsumidor('confirmado', true);
    await procesar(evento('asignacion.creada', { enteId: 'e1' }));
    expect(repo.aplicarEstadoEvento).not.toHaveBeenCalled();
  });

  test('evento atrasado no hace retroceder el estado', async () => {
    const { repo, procesar } = montarConsumidor('resuelto');
    await procesar(evento('asignacion.estado_actualizado', { estado: 'en_atencion' }));
    expect(repo.aplicarEstadoEvento).not.toHaveBeenCalled();
  });
});
