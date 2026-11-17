/**
 * Servicio de asignacion (puerto 3004, esquema definido en DB_SCHEMA).
 * Fase 1: solo esqueleto con /health. Las rutas de negocio se agregan en las siguientes fases.
 */
const {
  crearLogger, crearDb, Mensajeria, crearAppBase, finalizarApp, manejarApagado,
} = require('@urbansync/comun');

const SERVICIO = 'asignacion';
const PORT = Number(process.env.PORT) || 3004;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
const mensajeria = new Mensajeria({ url: process.env.RABBITMQ_URL, logger });

const app = crearAppBase({ servicio: SERVICIO, logger, db, mensajeria });
// TODO fases siguientes: app.use('/api/...', rutas); app.use('/internal/...', rutasInternas);
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  await mensajeria.conectar();
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => db.cerrar(), () => mensajeria.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
