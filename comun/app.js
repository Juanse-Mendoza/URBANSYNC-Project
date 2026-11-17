/**
 * Arma la aplicación Express base que comparten los cinco servicios, en este orden:
 *   1. log por petición (requestId)
 *   2. parser JSON (100 kb)
 *   3. GET /health (público, lo usa el healthcheck de Docker)
 *   4. verificación de X-Gateway-Token (todo lo demás exige venir del gateway)
 *   5. identidad del usuario desde X-Usuario-Id / X-Usuario-Rol
 * Luego cada servicio monta sus rutas y llama a finalizarApp().
 */
const express = require('express');
const { crearLoggerHttp } = require('./logger');
const { rutaSalud } = require('./salud');
const { verificarGateway, extraerUsuario } = require('./auth');
const { noEncontrado, manejadorErrores } = require('./errores');

function crearAppBase({ servicio, logger, db, mensajeria = null, gatewayToken = process.env.GATEWAY_TOKEN }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(crearLoggerHttp(logger));
  app.use(express.json({ limit: '100kb' }));
  app.use(rutaSalud({ servicio, db, mensajeria }));
  app.use(verificarGateway(gatewayToken));
  app.use(extraerUsuario);
  return app;
}

function finalizarApp(app, logger) {
  app.use(noEncontrado);
  app.use(manejadorErrores(logger));
  return app;
}

/** Cierre ordenado al recibir SIGTERM/SIGINT (docker stop). */
function manejarApagado({ servidor, logger, recursos = [] }) {
  const apagar = async (senal) => {
    logger.info({ senal }, 'Apagando servicio');
    servidor.close();
    for (const r of recursos) await Promise.resolve(r()).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

module.exports = { crearAppBase, finalizarApp, manejarApagado };
