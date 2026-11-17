/** Acceso a datos del esquema "notificaciones". */
const COLUMNAS = 'id, usuario_id, tipo, titulo, mensaje, incidente_id, leida, creado_en';

function crearRepositorioNotificaciones(db) {
  return {
    async yaProcesado(eventoId) {
      const { rows } = await db.query('SELECT 1 FROM eventos_procesados WHERE evento_id = $1', [eventoId]);
      return rows.length > 0;
    },

    /** Idempotencia: true si es la primera vez que se ve el evento (dentro de la transacción). */
    async marcarProcesado(cx, eventoId) {
      const { rowCount } = await cx.query(
        'INSERT INTO eventos_procesados (evento_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [eventoId],
      );
      return rowCount === 1;
    },

    async insertar(cx, { usuarioId, tipo, titulo, mensaje, incidenteId }) {
      await cx.query(
        `INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, incidente_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [usuarioId, tipo, titulo, mensaje, incidenteId ?? null],
      );
    },

    async listar(usuarioId, { soloNoLeidas = false, limite, offset }) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS}, count(*) OVER()::int AS total_filas
           FROM notificacion
          WHERE usuario_id = $1 AND (NOT $2 OR NOT leida)
          ORDER BY creado_en DESC
          LIMIT $3 OFFSET $4`,
        [usuarioId, soloNoLeidas, limite, offset],
      );
      const total = rows.length ? rows[0].total_filas : 0;
      return { filas: rows.map(({ total_filas, ...r }) => r), total };
    },

    async contarNoLeidas(usuarioId) {
      const { rows } = await db.query(
        'SELECT count(*)::int AS conteo FROM notificacion WHERE usuario_id = $1 AND NOT leida',
        [usuarioId],
      );
      return rows[0].conteo;
    },

    /** Solo el dueño puede marcarla (WHERE usuario_id): una notificación ajena da 0 filas -> 404. */
    async marcarLeida(id, usuarioId) {
      const { rows } = await db.query(
        `UPDATE notificacion SET leida = true WHERE id = $1 AND usuario_id = $2 RETURNING ${COLUMNAS}`,
        [id, usuarioId],
      );
      return rows[0] || null;
    },

    async marcarTodas(usuarioId) {
      const { rowCount } = await db.query(
        'UPDATE notificacion SET leida = true WHERE usuario_id = $1 AND NOT leida',
        [usuarioId],
      );
      return rowCount;
    },
  };
}

module.exports = { crearRepositorioNotificaciones };
