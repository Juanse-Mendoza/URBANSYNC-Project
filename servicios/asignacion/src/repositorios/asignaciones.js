/** Acceso a datos del esquema "asignaciones". "cx" = cliente de la transacción en curso. */
const COLUMNAS = `id, incidente_id, ciudadano_id, ente_id, supervisor_id, titulo, categoria,
  estado, activa, solucion, version, creado_en, actualizado_en`;

function crearRepositorioAsignaciones(db) {
  return {
    async insertar(cx, d) {
      const { rows } = await cx.query(
        `INSERT INTO asignacion (incidente_id, ciudadano_id, ente_id, supervisor_id, titulo, categoria)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNAS}`,
        [d.incidenteId, d.ciudadanoId, d.enteId, d.supervisorId, d.titulo, d.categoria],
      );
      return rows[0];
    },

    async insertarSeguimiento(cx, { asignacionId, estado, comentario, actorId }) {
      await cx.query(
        'INSERT INTO seguimiento (asignacion_id, estado, comentario, actor_id) VALUES ($1, $2, $3, $4)',
        [asignacionId, estado, comentario ?? null, actorId ?? null],
      );
    },

    async buscarPorId(id) {
      const { rows } = await db.query(`SELECT ${COLUMNAS} FROM asignacion WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async listarDeEnte(enteId, estado, { limite, offset }) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS}, count(*) OVER()::int AS total_filas
           FROM asignacion
          WHERE ente_id = $1 AND activa AND ($2::asignaciones.estado_asignacion IS NULL OR estado = $2)
          ORDER BY (estado = 'resuelto'), creado_en DESC
          LIMIT $3 OFFSET $4`,
        [enteId, estado ?? null, limite, offset],
      );
      const total = rows.length ? rows[0].total_filas : 0;
      return { filas: rows.map(({ total_filas, ...r }) => r), total };
    },

    /** Control optimista: solo actualiza si la versión coincide y la asignación sigue activa. */
    async actualizarEstado(cx, id, version, estado, solucion) {
      const { rows } = await cx.query(
        `UPDATE asignacion
            SET estado = $3, solucion = COALESCE($4, solucion), version = version + 1, actualizado_en = now()
          WHERE id = $1 AND version = $2 AND activa
          RETURNING ${COLUMNAS}`,
        [id, version, estado, solucion ?? null],
      );
      return rows[0] || null;
    },

    /** Desactiva la asignación para reasignar (libera el índice único parcial). */
    async desactivar(cx, id) {
      const { rows } = await cx.query(
        `UPDATE asignacion
            SET activa = false, estado = 'reasignado', version = version + 1, actualizado_en = now()
          WHERE id = $1 AND activa AND estado <> 'resuelto'
          RETURNING ${COLUMNAS}`,
        [id],
      );
      return rows[0] || null;
    },

    /** RF-ASG-05: todas las asignaciones de un incidente con su seguimiento. */
    async historialIncidente(incidenteId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS.split(',').map((c) => `a.${c.trim()}`).join(', ')},
                COALESCE(json_agg(json_build_object(
                  'estado', s.estado, 'comentario', s.comentario, 'actor_id', s.actor_id, 'creado_en', s.creado_en)
                  ORDER BY s.creado_en) FILTER (WHERE s.id IS NOT NULL), '[]') AS seguimiento
           FROM asignacion a LEFT JOIN seguimiento s ON s.asignacion_id = a.id
          WHERE a.incidente_id = $1
          GROUP BY a.id
          ORDER BY a.creado_en`,
        [incidenteId],
      );
      return rows;
    },
  };
}

module.exports = { crearRepositorioAsignaciones };
