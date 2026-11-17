/**
 * Servicio de Asignación (puerto 3004, esquema "asignaciones").
 * Asigna incidentes confirmados a entes, registra el seguimiento y publica eventos vía outbox.
 */
const {
  crearLogger, crearDb, Mensajeria, crearAppBase, finalizarApp, manejarApagado, iniciarPublicadorOutbox,
} = require('@urbansync/comun');
const { crearRepositorioAsignaciones } = require('./repositorios/asignaciones');
const { crearClientesInternos } = require('./clientes/internos');
const { crearServicioAsignaciones } = require('./servicios/asignaciones');
const { crearControladorAsignaciones } = require('./controladores/asignaciones');
const { rutasAsignaciones } = require('./rutas/asignaciones');

const SERVICIO = 'asignacion';
const PORT = Number(process.env.PORT) || 3004;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
const mensajeria = new Mensajeria({ url: process.env.RABBITMQ_URL, logger });

const servicio = crearServicioAsignaciones({
  db,
  repo: crearRepositorioAsignaciones(db),
  clientes: crearClientesInternos({ logger }),
  logger,
});

const app = crearAppBase({ servicio: SERVICIO, logger, db, mensajeria });
app.use('/api/asignaciones', rutasAsignaciones(crearControladorAsignaciones(servicio)));
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  await mensajeria.conectar();
  const outbox = iniciarPublicadorOutbox({ db, mensajeria, logger });
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => outbox.detener(), () => mensajeria.cerrar(), () => db.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
