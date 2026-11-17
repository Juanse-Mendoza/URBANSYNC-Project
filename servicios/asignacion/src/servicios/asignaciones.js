/**
 * Reglas de negocio de Asignación (RF-ASG-01..06).
 * Cada cambio se guarda junto con su evento en el outbox (misma transacción).
 */
const { AppError, crearSobre, agregarAOutbox } = require('@urbansync/comun');

// Máquina de estados de una asignación: recibido -> en_atencion -> resuelto
const TRANSICIONES = Object.freeze({
  recibido: ['en_atencion'],
  en_atencion: ['resuelto'],
});

const conflictoVersion = () => new AppError(409, 'VERSION_CONFLICTO',
  'La asignación fue modificada por otra persona. Recarga la información e intenta de nuevo');

function crearServicioAsignaciones({ db, repo, clientes, logger }) {
  async function validarEnte(enteId, opciones) {
    const ente = await clientes.usuario(enteId, opciones);
    if (!ente) throw new AppError(400, 'ENTE_INVALIDO', 'El ente de gestión no existe');
    if (ente.rol !== 'ente_gestion') throw new AppError(400, 'ENTE_INVALIDO', 'El usuario seleccionado no es un ente de gestión');
    return ente;
  }

  async function obtener(id) {
    const a = await repo.buscarPorId(id);
    if (!a) throw new AppError(404, 'ASIGNACION_NO_ENCONTRADA', 'La asignación no existe');
    return a;
  }

  return {
    TRANSICIONES,

    /**
     * RF-ASG-01. Verifica (síncrono) que el incidente esté confirmado y que el destinatario
     * sea un ente. La garantía de "una sola asignación activa" la da el índice único parcial:
     * si llegan dos peticiones simultáneas (PC-02), la segunda falla con 23505 -> 409.
     */
    async crear({ incidenteId, enteId }, usuario, opciones = {}) {
      const inc = await clientes.incidente(incidenteId, opciones);
      if (!inc) throw new AppError(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
      if (inc.estado !== 'confirmado') {
        throw new AppError(409, 'INCIDENTE_NO_ASIGNABLE',
          `Solo se pueden asignar incidentes confirmados (estado actual: ${inc.estado})`);
      }
      await validarEnte(enteId, opciones);

      try {
        return await db.enTransaccion(async (cx) => {
          const a = await repo.insertar(cx, {
            incidenteId, ciudadanoId: inc.ciudadano_id, enteId, supervisorId: usuario.id,
            titulo: inc.titulo, categoria: inc.categoria,
          });
          await repo.insertarSeguimiento(cx, { asignacionId: a.id, estado: 'recibido', comentario: 'Asignación creada', actorId: usuario.id });
          await agregarAOutbox(cx, crearSobre('asignacion.creada', incidenteId, {
            asignacionId: a.id, enteId, ciudadanoId: a.ciudadano_id, titulo: a.titulo, supervisorId: usuario.id,
          }));
          logger.info({ asignacionId: a.id, incidenteId, enteId }, 'Asignación creada');
          return a;
        });
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'uq_asignacion_activa') {
          throw new AppError(409, 'ASIGNACION_ACTIVA', 'El incidente ya tiene una asignación activa');
        }
        throw err;
      }
    },

    async mias(usuario, estado, pag) {
      return repo.listarDeEnte(usuario.id, estado, pag);
    },

    /** RF-ASG-03/04: el ente dueño avanza el estado (en_atencion, resuelto con solución). */
    async actualizarEstado(id, usuario, { estado, comentario, solucion, version }) {
      const a = await obtener(id);
      if (a.ente_id !== usuario.id) throw new AppError(403, 'PROHIBIDO', 'Esta asignación no te pertenece');
      if (!a.activa) throw new AppError(409, 'ASIGNACION_INACTIVA', 'La asignación ya no está activa (fue reasignada)');
      if (!(TRANSICIONES[a.estado] || []).includes(estado)) {
        throw new AppError(409, 'TRANSICION_INVALIDA', `No se puede pasar de "${a.estado}" a "${estado}"`);
      }
      if (estado === 'resuelto' && !solucion) {
        throw new AppError(400, 'SOLUCION_REQUERIDA', 'Para marcar como resuelto debes describir la solución');
      }
      if (a.version !== version) throw conflictoVersion();

      return db.enTransaccion(async (cx) => {
        const act = await repo.actualizarEstado(cx, id, version, estado, solucion);
        if (!act) throw conflictoVersion();
        await repo.insertarSeguimiento(cx, { asignacionId: id, estado, comentario, actorId: usuario.id });
        await agregarAOutbox(cx, crearSobre('asignacion.estado_actualizado', act.incidente_id, {
          asignacionId: id, estado, comentario, solucion: act.solucion, ciudadanoId: act.ciudadano_id,
          actorId: usuario.id, titulo: act.titulo,
        }));
        return act;
      });
    },

    /** RF-ASG-06: desactiva la asignación actual (estado "reasignado") y crea otra para el nuevo ente. */
    async reasignar(id, usuario, { enteId, comentario }, opciones = {}) {
      const a = await obtener(id);
      if (!a.activa) throw new AppError(409, 'ASIGNACION_INACTIVA', 'La asignación ya no está activa');
      if (a.estado === 'resuelto') throw new AppError(409, 'TRANSICION_INVALIDA', 'No se puede reasignar un incidente resuelto');
      if (a.ente_id === enteId) throw new AppError(400, 'MISMO_ENTE', 'El incidente ya está asignado a ese ente');
      await validarEnte(enteId, opciones);

      return db.enTransaccion(async (cx) => {
        const anterior = await repo.desactivar(cx, id);
        if (!anterior) throw conflictoVersion();
        await repo.insertarSeguimiento(cx, {
          asignacionId: id, estado: 'reasignado', comentario: comentario || 'Reasignado a otro ente', actorId: usuario.id,
        });
        const nueva = await repo.insertar(cx, {
          incidenteId: a.incidente_id, ciudadanoId: a.ciudadano_id, enteId, supervisorId: usuario.id,
          titulo: a.titulo, categoria: a.categoria,
        });
        await repo.insertarSeguimiento(cx, {
          asignacionId: nueva.id, estado: 'recibido', comentario: 'Asignación creada por reasignación', actorId: usuario.id,
        });
        await agregarAOutbox(cx, crearSobre('asignacion.reasignada', a.incidente_id, {
          asignacionAnterior: id, nuevaAsignacionId: nueva.id, enteAnterior: a.ente_id, enteNuevo: enteId,
          ciudadanoId: a.ciudadano_id, titulo: a.titulo, supervisorId: usuario.id,
        }));
        return { anterior, nueva };
      });
    },

    historialIncidente: (incidenteId) => repo.historialIncidente(incidenteId),
  };
}

module.exports = { crearServicioAsignaciones, TRANSICIONES };
