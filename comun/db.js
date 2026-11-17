/**
 * Acceso a PostgreSQL.
 * - Una sola instancia con un esquema por servicio (DECISIONES.md #1): cada pool fija
 *   search_path a su esquema, así las consultas usan nombres cortos (incidente, outbox...)
 *   y un servicio nunca consulta tablas de otro.
 * - Reintento de conexión al arrancar (hasta 10 intentos con backoff).
 */
const { Pool } = require('pg');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function crearDb({ connectionString, esquema, logger, max = Number(process.env.DB_POOL_MAX) || 10 }) {
  if (!/^[a-z_]+$/.test(esquema || '')) throw new Error('DB_SCHEMA inválido o no definido');

  const pool = new Pool({
    connectionString,
    max,
    // "public" se mantiene en el path para los tipos y funciones de PostGIS.
    options: `-c search_path=${esquema},public`,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => logger.error({ motivo: err.message }, 'Error en una conexión inactiva de la BD'));

  /** Espera a que la BD responda; útil al arrancar los contenedores. */
  async function conectar(intentosMax = 10) {
    for (let intento = 1; intento <= intentosMax; intento++) {
      try {
        await pool.query('SELECT 1');
        logger.info({ esquema }, 'Conectado a PostgreSQL');
        return;
      } catch (err) {
        const espera = Math.min(500 * 2 ** (intento - 1), 10000);
        logger.warn({ intento, esperaMs: espera, motivo: err.message }, 'BD no disponible, reintentando');
        if (intento === intentosMax) throw new Error('No fue posible conectar con la base de datos');
        await dormir(espera);
      }
    }
  }

  /** true si la BD responde en menos de 2 s (usado por /health). */
  async function ping() {
    try {
      await Promise.race([
        pool.query('SELECT 1'),
        dormir(2000).then(() => { throw new Error('timeout'); }),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ejecuta fn(cliente) dentro de BEGIN/COMMIT; si algo falla hace ROLLBACK.
   * Se usa para guardar el cambio de negocio y la fila del outbox de forma atómica.
   */
  async function enTransaccion(fn) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      cliente.release();
    }
  }

  return {
    pool,
    esquema,
    query: (texto, parametros) => pool.query(texto, parametros),
    conectar,
    ping,
    enTransaccion,
    cerrar: () => pool.end(),
  };
}

module.exports = { crearDb };
