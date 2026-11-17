/**
 * Reglas de negocio de Clasificación (RF-CLA-01..07, RF-UBI-01/02).
 */
const { randomUUID } = require('crypto');
const { AppError, crearSobre, agregarAOutbox, ROLES } = require('@urbansync/comun');
const { calcularPrioridad, maxPrioridad } = require('./prioridad');

function crearServicioIncidentes({ db, repo, clienteUbicaciones, logger }) {
  let cacheCategorias = null; // catálogo fijo (seed SQL): se carga una vez

  async function categorias() {
    if (!cacheCategorias) cacheCategorias = await repo.categorias();
    return cacheCategorias;
  }

  async function categoriaPorCodigo(codigo) {
    const cat = (await categorias()).find((c) => c.codigo === codigo);
    if (!cat) throw new AppError(400, 'CATEGORIA_INVALIDA', 'La categoría no existe');
    return cat;
  }

  function validarSubcategoria(cat, subcategoria) {
    if (subcategoria && !cat.subcategorias.some((s) => s.codigo === subcategoria)) {
      throw new AppError(400, 'SUBCATEGORIA_INVALIDA', `La subcategoría no pertenece a la categoría ${cat.nombre}`);
    }
  }

  async function obtener(id) {
    const inc = await repo.buscarPorId(id);
    if (!inc) throw new AppError(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
    return inc;
  }

  return {
    categorias,

    async prioridadBase(codigoCategoria) {
      return (await categoriaPorCodigo(codigoCategoria)).prioridad_base;
    },

    /**
     * Crear incidente (POST /api/incidentes).
     *  1. Idempotencia: si ya existe (ciudadano, Idempotency-Key) -> se devuelve el original (PC-03).
     *  2. Llamada síncrona a Ubicaciones (2 s, sin reintentos, con breaker) -> similares -> prioridad.
     *     Si falla: prioridad base, origen "respaldo" y recalcular_prioridad = true (PT-02).
     *  3. Una sola transacción: incidente + historial inicial + evento en el outbox.
     */
    async crear({ ciudadanoId, idempotencyKey, datos, requestId, log = logger }) {
      const existente = await repo.buscarPorIdempotencia(ciudadanoId, idempotencyKey);
      if (existente) return { incidente: existente, creado: false };

      const cat = await categoriaPorCodigo(datos.categoria);
      validarSubcategoria(cat, datos.subcategoria);

      const id = randomUUID();
      let prioridad = cat.prioridad_base;
      let prioridadOrigen = 'automatica';
      let recalcular = false;
      let similares = null;
      try {
        similares = await clienteUbicaciones.registrar({ incidenteId: id, ...datos }, { requestId });
        prioridad = calcularPrioridad(cat.prioridad_base, similares);
      } catch (err) {
        // Plan B: el reporte NO se pierde aunque Ubicaciones esté caído.
        prioridadOrigen = 'respaldo';
        recalcular = true;
        log.warn({ incidenteId: id, motivo: err.message }, 'Ubicaciones no respondió: se usa prioridad de respaldo');
      }

      try {
        const incidente = await db.enTransaccion(async (cx) => {
          const inc = await repo.insertar(cx, {
            id, ciudadanoId, idempotencyKey, ...datos, prioridad, prioridadOrigen, recalcular,
          });
          await repo.insertarHistorial(cx, {
            incidenteId: id, anterior: null, nuevo: 'pendiente', actorId: ciudadanoId, comentario: 'Reporte creado',
          });
          await agregarAOutbox(cx, crearSobre('incidente.creado', id, {
            ciudadanoId, titulo: inc.titulo, categoria: inc.categoria, prioridad: inc.prioridad,
          }));
          return inc;
        });
        log.info({ incidenteId: id, prioridad, prioridadOrigen, similares }, 'Incidente creado');
        return { incidente, creado: true, similares };
      } catch (err) {
        // Dos peticiones simultáneas con la misma clave: la segunda choca con el UNIQUE.
        if (err.code === '23505' && err.constraint === 'uq_incidente_idempotencia') {
          return { incidente: await repo.buscarPorIdempotencia(ciudadanoId, idempotencyKey), creado: false };
        }
        throw err;
      }
    },

    listarDeCiudadano: (ciudadanoId, pag) => repo.listarDeCiudadano(ciudadanoId, pag),
    listar: (filtros, pag) => repo.listar(filtros, pag),

    /**
     * Detalle con historial. Autorización por propiedad del recurso (OWASP API1 - BOLA):
     * supervisor: todos; ciudadano: solo los suyos; ente: solo si le fue asignado.
     */
    async detalle(id, usuario) {
      const inc = await obtener(id);
      const permitido = usuario.rol === ROLES.SUPERVISOR
        || (usuario.rol === ROLES.CIUDADANO && inc.ciudadano_id === usuario.id)
        || (usuario.rol === ROLES.ENTE && inc.ente_asignado_id === usuario.id);
      if (!permitido) throw new AppError(403, 'PROHIBIDO', 'No tienes acceso a este incidente');
      return { ...inc, historial: await repo.historial(id) };
    },

    obtenerInterno: obtener,

    /**
     * Confirmar / reclasificar (RF-CLA-05) con control optimista por "version".
     * - prioridad enviada -> se fija con origen "supervisor".
     * - cambia la categoría sin prioridad -> la mayor entre la actual y la base de la nueva categoría.
     * - confirmar en estado "pendiente" -> "confirmado" + evento incidente.confirmado.
     */
    async clasificar(id, usuario, cambios) {
      const inc = await obtener(id);
      if (inc.version !== cambios.version) {
        throw new AppError(409, 'VERSION_CONFLICTO',
          'El incidente fue modificado por otra persona. Recarga la información e intenta de nuevo');
      }

      const categoria = cambios.categoria ?? inc.categoria;
      const cat = await categoriaPorCodigo(categoria);
      const cambiaCategoria = categoria !== inc.categoria;

      let subcategoria = inc.subcategoria;
      if (cambios.subcategoria !== undefined) subcategoria = cambios.subcategoria;
      else if (cambiaCategoria) subcategoria = null;
      validarSubcategoria(cat, subcategoria);

      let prioridad = inc.prioridad;
      let prioridadOrigen = inc.prioridad_origen;
      if (cambios.prioridad) {
        prioridad = cambios.prioridad;
        prioridadOrigen = 'supervisor';
      } else if (cambiaCategoria) {
        prioridad = maxPrioridad(inc.prioridad, cat.prioridad_base);
        prioridadOrigen = 'supervisor';
      }

      const confirma = cambios.confirmar && inc.estado === 'pendiente';
      const estado = confirma ? 'confirmado' : inc.estado;

      return db.enTransaccion(async (cx) => {
        const act = await repo.actualizarClasificacion(cx, id, cambios.version, {
          categoria, subcategoria, prioridad, prioridadOrigen, estado,
        });
        if (!act) {
          throw new AppError(409, 'VERSION_CONFLICTO',
            'El incidente fue modificado por otra persona. Recarga la información e intenta de nuevo');
        }
        const resumen = `Clasificación: ${categoria}, prioridad ${prioridad}`;
        await repo.insertarHistorial(cx, {
          incidenteId: id,
          anterior: inc.estado,
          nuevo: estado,
          actorId: usuario.id,
          comentario: cambios.comentario ? `${resumen}. ${cambios.comentario}` : resumen,
        });
        if (confirma) {
          await agregarAOutbox(cx, crearSobre('incidente.confirmado', id, {
            ciudadanoId: act.ciudadano_id, titulo: act.titulo, categoria, prioridad, supervisorId: usuario.id,
          }));
        }
        return act;
      });
    },
  };
}

module.exports = { crearServicioIncidentes };
