/**
 * API Gateway de URBANSYNC (puerto 8080): único punto de entrada para la app y Postman.
 * Fase 1: seguridad básica (helmet, límite de body), logs y GET /health agregado.
 * Fase 2 agrega: validación de JWT, roles, rate limit y proxy hacia los servicios.
 */
const express = require('express');
const helmet = require('helmet');
const axios = require('axios');
const { crearLogger, crearLoggerHttp, noEncontrado, manejadorErrores } = require('@urbansync/comun');

const PORT = Number(process.env.PORT) || 8080;
const logger = crearLogger('gateway');

const SERVICIOS = {
  usuario: process.env.URL_SERVICIO_USUARIO,
  clasificacion: process.env.URL_SERVICIO_CLASIFICACION,
  ubicaciones: process.env.URL_SERVICIO_UBICACIONES,
  asignacion: process.env.URL_SERVICIO_ASIGNACION,
  notificacion: process.env.URL_SERVICIO_NOTIFICACION,
};

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(crearLoggerHttp(logger));

/** Consulta el /health de un servicio con timeout de 2 s. */
async function saludDe(nombre, url) {
  try {
    const r = await axios.get(`${url}/health`, { timeout: 2000, validateStatus: () => true });
    return [nombre, { disponible: r.status === 200, ...r.data }];
  } catch (err) {
    return [nombre, { disponible: false, estado: 'caido', motivo: err.code || 'SIN_RESPUESTA' }];
  }
}

/**
 * GET /health: estado del gateway y de los cinco servicios (en paralelo).
 * Responde 200 aunque algún servicio esté caído (estado "degradado"): el gateway sigue vivo.
 */
app.get('/health', async (req, res) => {
  const resultados = await Promise.all(Object.entries(SERVICIOS).map(([n, u]) => saludDe(n, u)));
  const servicios = Object.fromEntries(resultados);
  const todosOk = Object.values(servicios).every((s) => s.disponible);
  res.json({ estado: todosOk ? 'ok' : 'degradado', servicio: 'gateway', servicios });
});

app.use(noEncontrado);
app.use(manejadorErrores(logger));

const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Gateway iniciado'));
process.on('SIGTERM', () => servidor.close(() => process.exit(0)));

module.exports = { app };
