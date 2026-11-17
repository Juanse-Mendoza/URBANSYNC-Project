/**
 * GET /health de cada servicio: { estado, servicio, db, broker }.
 * - 503 si la BD no responde (Docker marca el contenedor como unhealthy).
 * - Si el broker está caído responde 200 con estado "degradado": el servicio sigue
 *   atendiendo peticiones y el outbox guarda los eventos hasta que RabbitMQ vuelva (PT-03).
 * - broker = "no_aplica" en servicios que no usan mensajería (usuario, ubicaciones).
 */
const express = require('express');

function rutaSalud({ servicio, db, mensajeria = null }) {
  const router = express.Router();
  router.get('/health', async (req, res) => {
    const dbOk = await db.ping();
    const broker = mensajeria ? mensajeria.estaConectado() : 'no_aplica';
    let estado = 'ok';
    if (!dbOk) estado = 'caido';
    else if (broker === false) estado = 'degradado';
    res.status(dbOk ? 200 : 503).json({ estado, servicio, db: dbOk, broker });
  });
  return router;
}

module.exports = { rutaSalud };
