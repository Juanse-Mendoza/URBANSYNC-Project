/**
 * Consultas geoespaciales con PostGIS sobre ubicaciones.ubicacion.
 * - punto es geography(Point, 4326): las distancias de ST_DWithin / ST_Distance son en METROS.
 * - ST_MakePoint recibe (longitud, latitud), en ese orden.
 * - El índice GIST sobre "punto" hace que ST_DWithin no recorra toda la tabla.
 */
/** Construye el punto geográfico a partir de los parámetros $iLat y $iLng. */
const punto = (iLat, iLng) => `ST_SetSRID(ST_MakePoint($${iLng}, $${iLat}), 4326)::geography`;
const COLUMNAS = `incidente_id, categoria, ST_Y(punto::geometry) AS lat, ST_X(punto::geometry) AS lng,
                  radio_m, creado_en`;

function crearRepositorioUbicaciones(db) {
  return {
    /**
     * Registra el punto (idempotente: si Clasificación reintenta, no se duplica) y cuenta los
     * reportes de la MISMA categoría a <= radioSimilares metros en los últimos 30 días,
     * incluido el nuevo (RF-UBI-04, regla de prioridad paso 2).
     */
    async registrarYContar({ incidenteId, categoria, lat, lng, radio_m }, radioSimilares) {
      return db.enTransaccion(async (cliente) => {
        await cliente.query(
          `INSERT INTO ubicacion (incidente_id, categoria, punto, radio_m)
           VALUES ($1, $2, ${punto(3, 4)}, $5)
           ON CONFLICT (incidente_id) DO NOTHING`,
          [incidenteId, categoria, lat, lng, radio_m],
        );
        const { rows } = await cliente.query(
          `SELECT count(*)::int AS similares
             FROM ubicacion u, (SELECT punto FROM ubicacion WHERE incidente_id = $1) nuevo
            WHERE u.categoria = $2
              AND u.creado_en >= now() - interval '30 days'
              AND ST_DWithin(u.punto, nuevo.punto, $3)`,
          [incidenteId, categoria, radioSimilares],
        );
        return rows[0].similares;
      });
    },

    /** Puntos para el mapa (RF-UBI-03, 06), máximo 200. Todos los filtros son opcionales. */
    async mapa({ lat, lng, radio_m, categoria, desde, hasta }) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS}
           FROM ubicacion
          WHERE ($1::float8 IS NULL OR ST_DWithin(punto, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography, $3))
            AND ($4::varchar IS NULL OR categoria = $4)
            AND ($5::timestamptz IS NULL OR creado_en >= $5)
            AND ($6::timestamptz IS NULL OR creado_en <= $6)
          ORDER BY creado_en DESC
          LIMIT 200`,
        [lat ?? null, lng ?? null, radio_m, categoria ?? null, desde ?? null, hasta ?? null],
      );
      return rows;
    },

    async buscar(incidenteId) {
      const { rows } = await db.query(`SELECT ${COLUMNAS} FROM ubicacion WHERE incidente_id = $1`, [incidenteId]);
      return rows[0] || null;
    },

    /** Reportes cercanos de la misma categoría dentro del radio del incidente, con su distancia. */
    async similares(incidenteId) {
      const { rows } = await db.query(
        `SELECT u.incidente_id, u.categoria, ST_Y(u.punto::geometry) AS lat, ST_X(u.punto::geometry) AS lng,
                u.radio_m, u.creado_en, round(ST_Distance(u.punto, b.punto))::int AS distancia_m
           FROM ubicacion u, (SELECT punto, categoria, radio_m FROM ubicacion WHERE incidente_id = $1) b
          WHERE u.incidente_id <> $1
            AND u.categoria = b.categoria
            AND u.creado_en >= now() - interval '30 days'
            AND ST_DWithin(u.punto, b.punto, b.radio_m)
          ORDER BY distancia_m
          LIMIT 50`,
        [incidenteId],
      );
      return rows;
    },

    async actualizarRadio(incidenteId, radio) {
      const { rows } = await db.query(
        `UPDATE ubicacion SET radio_m = $2 WHERE incidente_id = $1 RETURNING ${COLUMNAS}`,
        [incidenteId, radio],
      );
      return rows[0] || null;
    },
  };
}

module.exports = { crearRepositorioUbicaciones };
