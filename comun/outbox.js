/**
 * Patrón Transactional Outbox (Clasificación y Asignación).
 *
 * Problema: si un servicio guarda en su BD y luego publica en RabbitMQ, y el broker está
 * caído, el evento se pierde (o al revés: se publica algo que no se guardó).
 *
 * Solución:
 *  1. El cambio de negocio y la fila en la tabla "outbox" se guardan en la MISMA transacción
 *     (agregarAOutbox). O se guardan ambos o ninguno.
 *  2. Un publicador periódico (cada 2 s) toma hasta 50 filas sin publicar con
 *     FOR UPDATE SKIP LOCKED (dos réplicas no toman la misma fila), las publica esperando la
 *     confirmación del broker y marca publicado_en.
 *  3. Si el broker está caído, las filas quedan pendientes y se reintentan en el siguiente ciclo (PT-03).
 *
 * Entrega "al menos una vez": por eso los consumidores son idempotentes (eventos_procesados).
 */

/** Inserta el evento en el outbox usando el cliente de la transacción en curso. */
function agregarAOutbox(cliente, sobre) {
  return cliente.query(
    'INSERT INTO outbox (id, tipo, payload) VALUES ($1, $2, $3)',
    [sobre.eventoId, sobre.tipo, sobre],
  );
}

function iniciarPublicadorOutbox({ db, mensajeria, logger, intervaloMs = 2000, lote = 50 }) {
  let enCurso = false;

  async function ciclo() {
    if (enCurso || !mensajeria.estaConectado()) return 0;
    enCurso = true;
    let cliente;
    let publicados = 0;
    try {
      cliente = await db.pool.connect();
      await cliente.query('BEGIN');
      const { rows } = await cliente.query(
        `SELECT id, tipo, payload FROM outbox
          WHERE publicado_en IS NULL
          ORDER BY creado_en
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [lote],
      );
      for (const fila of rows) {
        try {
          await mensajeria.publicar(fila.payload);
          await cliente.query('UPDATE outbox SET publicado_en = now(), intentos = intentos + 1 WHERE id = $1', [fila.id]);
          publicados += 1;
        } catch (err) {
          await cliente.query('UPDATE outbox SET intentos = intentos + 1 WHERE id = $1', [fila.id]);
          logger.warn({ eventoId: fila.id, tipo: fila.tipo, motivo: err.message }, 'No se pudo publicar desde el outbox; se reintentará');
          break; // se conserva el orden: se reintenta en el siguiente ciclo
        }
      }
      await cliente.query('COMMIT');
      if (publicados > 0) logger.info({ publicados }, 'Eventos publicados desde el outbox');
    } catch (err) {
      if (cliente) await cliente.query('ROLLBACK').catch(() => {});
      logger.error({ motivo: err.message }, 'Error en el ciclo del outbox');
    } finally {
      if (cliente) cliente.release();
      enCurso = false;
    }
    return publicados;
  }

  const temporizador = setInterval(ciclo, intervaloMs);
  logger.info({ intervaloMs, lote }, 'Publicador de outbox iniciado');
  return { ciclo, detener: () => clearInterval(temporizador) };
}

module.exports = { agregarAOutbox, iniciarPublicadorOutbox };
