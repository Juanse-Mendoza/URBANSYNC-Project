/**
 * API Gateway de URBANSYNC (puerto 8080): único punto de entrada para la app y Postman.
 */
const { crearLogger } = require('@urbansync/comun');
const { crearApp } = require('./app');

const PORT = Number(process.env.PORT) || 8080;
const logger = crearLogger('gateway');
const app = crearApp({ logger });

const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Gateway iniciado'));
process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
