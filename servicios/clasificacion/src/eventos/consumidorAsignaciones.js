/**
 * CONSUMIDOR DE EVENTOS de Clasificación (cola clasificacion.eventos, DECISIONES.md #8).
 * Mantiene el estado del incidente sincronizado con lo que pasa en Asignación:
 *   asignacion.creada              -> estado "asignado" + ente_asignado_id
 *   asignacion.estado_actualizado  -> estado "en_atencion" o "resuelto"
 *   asignacion.reasignada          -> estado "asignado" + nuevo ente_asignado_id
 *
 * - Idempotente: eventoId se inserta en eventos_procesados en la misma transacción del cambio.
 * - Tolerante al desorden: el estado nunca retrocede (salvo la reasignación, que vuelve a "asignado").
 */
const ORDEN_ESTADOS = ['pendiente', 'confirmado', 'asignado', 'en_atencion', 'resuelto'];

function interpretar({ tipo, datos }) {
  switch (tipo) {
    case 'asignacion.creada':
      return { estado: 'asignado', enteId: datos.enteId, actorId: datos.supervisorId, comentario: 'Asignado a un ente de gestión' };
    case 'asignacion.estado_actualizado':
      return { estado: datos.estado, actorId: datos.actorId, comentario: datos.comentario || `Estado: ${datos.estado}` };
    case 'asignacion.reasignada':
      return { estado: 'asignado', enteId: datos.enteNuevo, actorId: datos.supervisorId, comentario: 'Reasignado a otro ente de gestión', forzar: true };
    default:
      return null;
  }
}

function crearConsumidorAsignaciones({ db, repo, logger }) {
  return async function procesar(sobre) {
    const log = logger.child({ eventoId: sobre.eventoId, tipo: sobre.tipo, incidenteId: sobre.incidenteId });
    const cambio = interpretar(sobre);
    if (!cambio) {
      log.warn('Tipo de evento no esperado, se ignora');
      return;
    }
    if (!ORDEN_ESTADOS.includes(cambio.estado)) throw new Error(`Estado inválido en el evento: ${cambio.estado}`);

    await db.enTransaccion(async (cx) => {
      if (!(await repo.marcarEventoProcesado(cx, sobre.eventoId))) {
        log.info('Evento duplicado ignorado (idempotencia)');
        return;
      }
      const inc = await repo.bloquearPorId(cx, sobre.incidenteId);
      if (!inc) {
        log.warn('El incidente del evento no existe, se ignora');
        return;
      }
      const avanza = cambio.forzar || ORDEN_ESTADOS.indexOf(cambio.estado) > ORDEN_ESTADOS.indexOf(inc.estado);
      if (!avanza) {
        log.info({ estadoActual: inc.estado, estadoEvento: cambio.estado }, 'Evento fuera de orden: el estado no retrocede');
        return;
      }
      await repo.aplicarEstadoEvento(cx, inc.id, cambio.estado, cambio.enteId ?? inc.ente_asignado_id);
      await repo.insertarHistorial(cx, {
        incidenteId: inc.id, anterior: inc.estado, nuevo: cambio.estado, actorId: cambio.actorId, comentario: cambio.comentario,
      });
      log.info({ de: inc.estado, a: cambio.estado }, 'Estado del incidente actualizado por evento');
    });
  };
}

module.exports = { crearConsumidorAsignaciones, ORDEN_ESTADOS };
