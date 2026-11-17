/**
 * CONSUMIDOR DE EVENTOS de Notificación (cola notificacion.eventos).
 *
 * Para cada evento:
 *  1. Si ya se procesó (eventoId en eventos_procesados) -> se ignora (entrega "al menos una vez").
 *  2. Se construyen las notificaciones según el tipo (PLANTILLAS).
 *  3. En UNA transacción: se marca el evento como procesado + se insertan las notificaciones.
 *     Si dos copias del mismo evento llegan a la vez, solo una logra insertar eventoId.
 * Si algo falla, el error sube a comun/mensajeria.js, que reintenta (200/400/800 ms) y al
 * cuarto fallo envía el mensaje a la DLQ.
 */

function crearProcesador({ db, repo, clienteUsuario, logger }) {
  const n = (usuarioId, tipo, titulo, mensaje) => ({ usuarioId, tipo, titulo, mensaje });

  const PLANTILLAS = {
    // RF-NOT-02: incidente de prioridad alta -> todos los supervisores
    'incidente.creado': async ({ tipo, datos }) => {
      if (datos.prioridad !== 'alta') return [];
      const supervisores = await clienteUsuario.idsPorRol('supervisor');
      return supervisores.map((id) => n(id, tipo, 'Incidente de prioridad alta',
        `Nuevo reporte «${datos.titulo}» (${datos.categoria}) requiere atención prioritaria`));
    },
    'incidente.confirmado': async ({ tipo, datos }) => [
      n(datos.ciudadanoId, tipo, 'Reporte confirmado',
        `Tu reporte «${datos.titulo}» fue revisado y confirmado por un supervisor`),
    ],
    // RF-NOT-03: al ente cuando se le asigna; RF-NOT-01: al ciudadano por el cambio de estado
    'asignacion.creada': async ({ tipo, datos }) => [
      n(datos.enteId, tipo, 'Nuevo incidente asignado', `Se te asignó el incidente «${datos.titulo}»`),
      n(datos.ciudadanoId, tipo, 'Reporte asignado', `Tu reporte «${datos.titulo}» fue asignado a un ente de gestión`),
    ],
    'asignacion.estado_actualizado': async ({ tipo, datos }) => {
      const resuelto = datos.estado === 'resuelto';
      const titulo = resuelto ? 'Reporte resuelto' : 'Reporte en atención';
      const detalle = resuelto && datos.solucion ? ` Solución: ${datos.solucion}` : ` ${datos.comentario || ''}`;
      return [n(datos.ciudadanoId, tipo, titulo,
        `Tu reporte «${datos.titulo}» está ${resuelto ? 'resuelto' : 'en atención'}.${detalle}`.trim())];
    },
    'asignacion.reasignada': async ({ tipo, datos }) => [
      n(datos.enteNuevo, tipo, 'Nuevo incidente asignado', `Se te reasignó el incidente «${datos.titulo}»`),
    ],
  };

  return async function procesar(sobre) {
    const generar = PLANTILLAS[sobre.tipo];
    const log = logger.child({ eventoId: sobre.eventoId, tipo: sobre.tipo });
    if (!generar) {
      log.warn('Tipo de evento sin plantilla, se ignora');
      return;
    }
    if (await repo.yaProcesado(sobre.eventoId)) {
      log.info('Evento duplicado ignorado (idempotencia)');
      return;
    }
    const notificaciones = await generar(sobre); // puede llamar a Usuario (fuera de la transacción)

    const creadas = await db.enTransaccion(async (cx) => {
      if (!(await repo.marcarProcesado(cx, sobre.eventoId))) return -1;
      for (const x of notificaciones) await repo.insertar(cx, { ...x, incidenteId: sobre.incidenteId });
      return notificaciones.length;
    });
    if (creadas === -1) log.info('Evento duplicado ignorado (idempotencia)');
    else log.info({ notificaciones: creadas }, 'Evento procesado');
  };
}

module.exports = { crearProcesador };
