/**
 * Acceso a datos del esquema "incidentes". Consultas parametrizadas.
 * Las funciones que reciben "cx" aceptan el cliente de una transacción en curso.
 */
const COLUMNAS = `id, ciudadano_id, titulo, descripcion, categoria, subcategoria, foto_url,
  prioridad, prioridad_origen, recalcular_prioridad, estado, ente_asignado_id,
  lat, lng, radio_m, version, creado_en, actualizado_en`;

function crearRepositorioIncidentes(db) {
  return {
    async categorias() {
      const { rows } = await db.query(
        `SELECT c.codigo, c.nombre, c.prioridad_base,
                COALESCE(json_agg(json_build_object('codigo', s.codigo, 'nombre', s.nombre) ORDER BY s.nombre)
                         FILTER (WHERE s.codigo IS NOT NULL), '[]') AS subcategorias
           FROM categoria c LEFT JOIN subcategoria s ON s.categoria = c.codigo
          GROUP BY c.codigo, c.nombre, c.prioridad_base
          ORDER BY c.prioridad_base DESC, c.nombre`,
      );
      return rows;
    },

    async buscarPorIdempotencia(ciudadanoId, clave) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS} FROM incidente WHERE ciudadano_id = $1 AND idempotency_key = $2`,
        [ciudadanoId, clave],
      );
      return rows[0] || null;
    },

    async insertar(cx, d) {
      const { rows } = await cx.query(
        `INSERT INTO incidente (id, ciudadano_id, titulo, descripcion, categoria, subcategoria, prioridad,
                                prioridad_origen, recalcular_prioridad, lat, lng, radio_m, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${COLUMNAS}`,
        [d.id, d.ciudadanoId, d.titulo, d.descripcion ?? null, d.categoria, d.subcategoria ?? null, d.prioridad,
          d.prioridadOrigen, d.recalcular, d.lat, d.lng, d.radio_m, d.idempotencyKey],
      );
      return rows[0];
    },

    async insertarHistorial(cx, { incidenteId, anterior, nuevo, actorId, comentario }) {
      await cx.query(
        `INSERT INTO historial_estado (incidente_id, estado_anterior, estado_nuevo, actor_id, comentario)
         VALUES ($1, $2, $3, $4, $5)`,
        [incidenteId, anterior, nuevo, actorId ?? null, comentario ?? null],
      );
    },

    async buscarPorId(id) {
      const { rows } = await db.query(`SELECT ${COLUMNAS} FROM incidente WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async historial(id) {
      const { rows } = await db.query(
        `SELECT estado_anterior, estado_nuevo, actor_id, comentario, creado_en
           FROM historial_estado WHERE incidente_id = $1 ORDER BY creado_en, id`,
        [id],
      );
      return rows;
    },

    async listarDeCiudadano(ciudadanoId, { limite, offset }) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS}, count(*) OVER()::int AS total_filas
           FROM incidente WHERE ciudadano_id = $1
          ORDER BY creado_en DESC LIMIT $2 OFFSET $3`,
        [ciudadanoId, limite, offset],
      );
      return separarTotal(rows);
    },

    /** Bandeja del supervisor (RF-CLA-04): primero lo más prioritario y lo más reciente. */
    async listar({ categoria, prioridad, estado }, { limite, offset }) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS}, count(*) OVER()::int AS total_filas
           FROM incidente
          WHERE ($1::varchar IS NULL OR categoria = $1)
            AND ($2::incidentes.nivel_prioridad IS NULL OR prioridad = $2)
            AND ($3::incidentes.estado_incidente IS NULL OR estado = $3)
          ORDER BY prioridad DESC, creado_en DESC
          LIMIT $4 OFFSET $5`,
        [categoria ?? null, prioridad ?? null, estado ?? null, limite, offset],
      );
      return separarTotal(rows);
    },

    /**
     * CONTROL OPTIMISTA DE CONCURRENCIA (RF-CLA-05):
     * el UPDATE solo se aplica si la versión sigue siendo la que leyó el supervisor.
     * Si otro supervisor modificó antes, la versión cambió -> 0 filas -> 409.
     */
    async actualizarClasificacion(cx, id, version, c) {
      const { rows } = await cx.query(
        `UPDATE incidente
            SET categoria = $3, subcategoria = $4, prioridad = $5, prioridad_origen = $6,
                estado = $7, version = version + 1, actualizado_en = now()
          WHERE id = $1 AND version = $2
          RETURNING ${COLUMNAS}`,
        [id, version, c.categoria, c.subcategoria, c.prioridad, c.prioridadOrigen, c.estado],
      );
      return rows[0] || null;
    },

    /** Idempotencia del consumidor: true si el evento no se había procesado. */
    async marcarEventoProcesado(cx, eventoId) {
      const { rowCount } = await cx.query(
        'INSERT INTO eventos_procesados (evento_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [eventoId],
      );
      return rowCount === 1;
    },

    /** Bloquea la fila (FOR UPDATE) para aplicar el evento sin carreras. */
    async bloquearPorId(cx, id) {
      const { rows } = await cx.query(`SELECT ${COLUMNAS} FROM incidente WHERE id = $1 FOR UPDATE`, [id]);
      return rows[0] || null;
    },

    async aplicarEstadoEvento(cx, id, estado, enteAsignadoId) {
      await cx.query(
        `UPDATE incidente SET estado = $2, ente_asignado_id = $3, version = version + 1, actualizado_en = now()
          WHERE id = $1`,
        [id, estado, enteAsignadoId],
      );
    },

    async pendientesRecalculo(limite) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS} FROM incidente WHERE recalcular_prioridad ORDER BY creado_en LIMIT $1`,
        [limite],
      );
      return rows;
    },

    async aplicarRecalculo(id, prioridad, origen) {
      const { rows } = await db.query(
        `UPDATE incidente
            SET prioridad = $2, prioridad_origen = $3, recalcular_prioridad = false,
                version = version + 1, actualizado_en = now()
          WHERE id = $1 AND recalcular_prioridad
          RETURNING ${COLUMNAS}`,
        [id, prioridad, origen],
      );
      return rows[0] || null;
    },
  };
}

function separarTotal(rows) {
  const total = rows.length ? rows[0].total_filas : 0;
  return { filas: rows.map(({ total_filas, ...r }) => r), total };
}

module.exports = { crearRepositorioIncidentes };
