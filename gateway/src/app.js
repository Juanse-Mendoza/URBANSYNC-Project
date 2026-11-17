/**
 * Aplicación Express del gateway (separada de index.js para poder probarla con supertest).
 *
 * Cadena de cada petición:
 *  helmet -> log(requestId) -> CORS(dev) -> /health -> rate limit -> limpiar X-Usuario-* ->
 *  límite de body -> resolver servicio -> validar JWT (401) -> validar rol (403) -> proxy
 */
const express = require('express');
const helmet = require('helmet');
const axios = require('axios');
const { crearLoggerHttp, noEncontrado, manejadorErrores } = require('@urbansync/comun');
const { servicios } = require('./config/rutas');
const {
  limpiarEncabezados, resolverDestino, autenticar, autorizar, limiteCuerpo, corsDesarrollo,
} = require('./middlewares/seguridad');
const { limiteGeneral, limiteLogin } = require('./middlewares/limites');
const { crearProxy } = require('./proxy');

/** Consulta el /health de un servicio con timeout de 2 s. */
async function saludDe(nombre, url) {
  try {
    const r = await axios.get(`${url}/health`, { timeout: 2000, validateStatus: () => true });
    return [nombre, { disponible: r.status === 200, ...r.data }];
  } catch (err) {
    return [nombre, { disponible: false, estado: 'caido', motivo: err.code || 'SIN_RESPUESTA' }];
  }
}

function crearApp({ logger, env = process.env }) {
  const listaServicios = servicios(env);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(crearLoggerHttp(logger));
  app.use(corsDesarrollo(env.CORS_DESARROLLO === 'true'));

  /**
   * GET /health: estado del gateway y de los cinco servicios (en paralelo).
   * Responde 200 aunque algún servicio esté caído (estado "degradado"): el gateway sigue vivo.
   */
  app.get('/health', async (req, res) => {
    const resultados = await Promise.all(listaServicios.map((s) => saludDe(s.nombre, s.url)));
    const detalle = Object.fromEntries(resultados);
    const todosOk = Object.values(detalle).every((s) => s.disponible);
    res.json({ estado: todosOk ? 'ok' : 'degradado', servicio: 'gateway', servicios: detalle });
  });

  app.use(limiteGeneral);
  app.use('/api/usuarios/login', limiteLogin);
  app.use(limpiarEncabezados);
  app.use(limiteCuerpo());
  // Montados en la raíz (no en '/api') para que req.url conserve la ruta completa al reenviar.
  app.use(resolverDestino(listaServicios), autenticar(env.JWT_SECRET), autorizar);
  app.use(crearProxy({ gatewayToken: env.GATEWAY_TOKEN, logger }));

  app.use(noEncontrado);
  app.use(manejadorErrores(logger));
  return app;
}

module.exports = { crearApp };
