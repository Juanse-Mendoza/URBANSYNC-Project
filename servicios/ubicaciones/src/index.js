/**
 * Servicio de ubicaciones (puerto 3003, esquema definido en DB_SCHEMA).
 * Fase 1: solo esqueleto con /health. Las rutas de negocio se agregan en las siguientes fases.
 */
const {
  crearLogger, crearDb, crearAppBase, finalizarApp, manejarApagado,
} = require('@urbansync/comun');

const SERVICIO = 'ubicaciones';
const PORT = Number(process.env.PORT) || 3003;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
// Este servicio no usa mensajeria asincrona.

const app = crearAppBase({ servicio: SERVICIO, logger, db });
// TODO fases siguientes: app.use('/api/...', rutas); app.use('/internal/...', rutasInternas);
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();

  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => db.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
