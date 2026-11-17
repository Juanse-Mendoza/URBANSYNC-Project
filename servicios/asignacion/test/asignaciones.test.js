const { crearLogger } = require('@urbansync/comun');
const { crearServicioAsignaciones } = require('../src/servicios/asignaciones');

const logger = crearLogger('asignacion-test');
logger.level = 'silent';
const SUPERVISOR = { id: 's1', rol: 'supervisor' };
const ENTE = { id: 'e1', rol: 'ente_gestion' };

function montar({ incidente = { id: 'i1', estado: 'confirmado', ciudadano_id: 'c1', titulo: 'Hueco', categoria: 'infraestructura' },
  usuario = { id: 'e1', rol: 'ente_gestion' }, asignacion = null, insertarFalla = null } = {}) {
  const cx = { consultas: [], query: jest.fn(async (sql, params) => { cx.consultas.push({ sql, params }); return { rows: [] }; }) };
  const db = { enTransaccion: async (fn) => fn(cx) };
  const repo = {
    insertar: jest.fn(async (c, d) => {
      if (insertarFalla) throw insertarFalla;
      return { id: 'a-nueva', incidente_id: d.incidenteId, ciudadano_id: d.ciudadanoId, ente_id: d.enteId, titulo: d.titulo };
    }),
    insertarSeguimiento: jest.fn(async () => {}),
    buscarPorId: jest.fn(async () => asignacion),
    actualizarEstado: jest.fn(async (c, id, version, estado, solucion) => ({ ...asignacion, estado, solucion, version: version + 1 })),
    desactivar: jest.fn(async () => ({ ...asignacion, activa: false, estado: 'reasignado' })),
  };
  const clientes = { incidente: jest.fn(async () => incidente), usuario: jest.fn(async () => usuario) };
  return { cx, repo, clientes, servicio: crearServicioAsignaciones({ db, repo, clientes, logger }) };
}
const eventosOutbox = (cx) => cx.consultas.filter((c) => c.sql.includes('INSERT INTO outbox')).map((c) => c.params[1]);

describe('Crear asignación (RF-ASG-01)', () => {
  test('incidente confirmado + ente válido -> asignación y evento asignacion.creada', async () => {
    const { servicio, cx } = montar();
    const a = await servicio.crear({ incidenteId: 'i1', enteId: 'e1' }, SUPERVISOR);
    expect(a.id).toBe('a-nueva');
    expect(eventosOutbox(cx)).toEqual(['asignacion.creada']);
  });

  test('incidente no confirmado -> 409', async () => {
    const { servicio } = montar({ incidente: { id: 'i1', estado: 'pendiente' } });
    await expect(servicio.crear({ incidenteId: 'i1', enteId: 'e1' }, SUPERVISOR)).rejects.toMatchObject({ status: 409, codigo: 'INCIDENTE_NO_ASIGNABLE' });
  });

  test('el destinatario no es un ente -> 400', async () => {
    const { servicio } = montar({ usuario: { id: 'c9', rol: 'ciudadano' } });
    await expect(servicio.crear({ incidenteId: 'i1', enteId: 'c9' }, SUPERVISOR)).rejects.toMatchObject({ status: 400, codigo: 'ENTE_INVALIDO' });
  });

  test('PC-02: violación del índice único parcial -> 409 ASIGNACION_ACTIVA', async () => {
    const error = Object.assign(new Error('duplicado'), { code: '23505', constraint: 'uq_asignacion_activa' });
    const { servicio } = montar({ insertarFalla: error });
    await expect(servicio.crear({ incidenteId: 'i1', enteId: 'e1' }, SUPERVISOR)).rejects.toMatchObject({ status: 409, codigo: 'ASIGNACION_ACTIVA' });
  });
});

describe('Actualizar estado (RF-ASG-03/04)', () => {
  const base = { id: 'a1', incidente_id: 'i1', ente_id: 'e1', ciudadano_id: 'c1', activa: true, estado: 'recibido', version: 1, titulo: 'Hueco' };

  test('solo el ente dueño puede actualizar -> 403', async () => {
    const { servicio } = montar({ asignacion: base });
    await expect(servicio.actualizarEstado('a1', { id: 'e2', rol: 'ente_gestion' }, { estado: 'en_atencion', comentario: 'Voy', version: 1 }))
      .rejects.toMatchObject({ status: 403 });
  });

  test('no se puede saltar de recibido a resuelto -> 409', async () => {
    const { servicio } = montar({ asignacion: base });
    await expect(servicio.actualizarEstado('a1', ENTE, { estado: 'resuelto', comentario: 'Listo', solucion: 'Arreglado', version: 1 }))
      .rejects.toMatchObject({ status: 409, codigo: 'TRANSICION_INVALIDA' });
  });

  test('resuelto exige la descripción de la solución -> 400', async () => {
    const { servicio } = montar({ asignacion: { ...base, estado: 'en_atencion', version: 2 } });
    await expect(servicio.actualizarEstado('a1', ENTE, { estado: 'resuelto', comentario: 'Listo', version: 2 }))
      .rejects.toMatchObject({ status: 400, codigo: 'SOLUCION_REQUERIDA' });
  });

  test('cambio válido -> seguimiento + evento asignacion.estado_actualizado', async () => {
    const { servicio, cx, repo } = montar({ asignacion: base });
    const r = await servicio.actualizarEstado('a1', ENTE, { estado: 'en_atencion', comentario: 'Cuadrilla en camino', version: 1 });
    expect(r.estado).toBe('en_atencion');
    expect(repo.insertarSeguimiento).toHaveBeenCalled();
    expect(eventosOutbox(cx)).toEqual(['asignacion.estado_actualizado']);
  });
});

describe('Reasignar (RF-ASG-06)', () => {
  const base = { id: 'a1', incidente_id: 'i1', ente_id: 'e1', ciudadano_id: 'c1', activa: true, estado: 'en_atencion', titulo: 'Hueco', categoria: 'infraestructura' };

  test('desactiva la actual, crea otra y emite asignacion.reasignada', async () => {
    const { servicio, cx, repo } = montar({ asignacion: base, usuario: { id: 'e2', rol: 'ente_gestion' } });
    const r = await servicio.reasignar('a1', SUPERVISOR, { enteId: 'e2' });
    expect(repo.desactivar).toHaveBeenCalled();
    expect(r.nueva.ente_id).toBe('e2');
    expect(eventosOutbox(cx)).toEqual(['asignacion.reasignada']);
  });

  test('no se reasigna un incidente resuelto', async () => {
    const { servicio } = montar({ asignacion: { ...base, estado: 'resuelto' } });
    await expect(servicio.reasignar('a1', SUPERVISOR, { enteId: 'e2' })).rejects.toMatchObject({ status: 409 });
  });
});
