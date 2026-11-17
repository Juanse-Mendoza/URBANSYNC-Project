/**
 * Servicio de Clasificación (puerto 3002, esquema "incidentes").
 * Crea y clasifica incidentes, calcula la prioridad, publica eventos vía outbox
 * y recalcula prioridades pendientes.
 */
const {
  crearLogger, crearDb, Mensajeria, crearAppBase, finalizarApp, manejarApagado, iniciarPublicadorOutbox,
} = require('@urbansync/comun');
const { crearRepositorioIncidentes } = require('./repositorios/incidentes');
const { crearClienteUbicaciones } = require('./clientes/ubicaciones');
const { crearServicioIncidentes } = require('./servicios/incidentes');
const { iniciarRecalculo } = require('./servicios/recalculo');
const { crearControladorIncidentes } = require('./controladores/incidentes');
const { rutasCategorias, rutasIncidentes, rutasInternas } = require('./rutas/incidentes');

const SERVICIO = 'clasificacion';
const PORT = Number(process.env.PORT) || 3002;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
const mensajeria = new Mensajeria({ url: process.env.RABBITMQ_URL, logger });

const repo = crearRepositorioIncidentes(db);
// Dos clientes (dos breakers): el de las peticiones protege la latencia del usuario (<= 3 s);
// el de la tarea de recálculo usa reintentos y no se ve afectado si el otro breaker está abierto.
const clienteUbicaciones = crearClienteUbicaciones({ logger });
const clienteRecalculo = crearClienteUbicaciones({ logger, nombre: 'ubicaciones-recalculo' });
const servicio = crearServicioIncidentes({ db, repo, clienteUbicaciones, logger });
const controlador = crearControladorIncidentes(servicio);

const app = crearAppBase({ servicio: SERVICIO, logger, db, mensajeria });
app.use('/api/categorias', rutasCategorias(controlador));
app.use('/api/incidentes', rutasIncidentes(controlador));
app.use('/internal/incidentes', rutasInternas(controlador));
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  await mensajeria.conectar();
  // Consumidor de eventos de asignación: se agrega en la Fase 4.
  const outbox = iniciarPublicadorOutbox({ db, mensajeria, logger });
  const recalculo = iniciarRecalculo({
    repo, servicio, clienteUbicaciones: clienteRecalculo, logger,
    intervaloMs: Number(process.env.RECALCULO_INTERVALO_MS) || 60000,
  });
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({
    servidor, logger,
    recursos: [() => outbox.detener(), () => recalculo.detener(), () => mensajeria.cerrar(), () => db.cerrar()],
  });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
