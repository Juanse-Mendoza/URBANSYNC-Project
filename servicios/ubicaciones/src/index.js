/**
 * Servicio de Ubicaciones (puerto 3003, esquema "ubicaciones").
 * Guarda el punto de cada incidente (PostGIS), detecta reportes similares cercanos y sirve el mapa.
 */
const {
  crearLogger, crearDb, crearAppBase, finalizarApp, manejarApagado,
} = require('@urbansync/comun');
const { crearRepositorioUbicaciones } = require('./repositorios/ubicaciones');
const { crearControladorUbicaciones } = require('./controladores/ubicaciones');
const { rutasUbicaciones, rutasInternas } = require('./rutas/ubicaciones');

const SERVICIO = 'ubicaciones';
const PORT = Number(process.env.PORT) || 3003;
const RADIO_SIMILARES_M = Number(process.env.RADIO_SIMILARES_M) || 50;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
// Este servicio no usa mensajería asíncrona.

const controlador = crearControladorUbicaciones({
  repo: crearRepositorioUbicaciones(db),
  radioSimilares: RADIO_SIMILARES_M,
});

const app = crearAppBase({ servicio: SERVICIO, logger, db });
app.use('/api/ubicaciones', rutasUbicaciones(controlador));
app.use('/internal/ubicaciones', rutasInternas(controlador));
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT, radioSimilaresM: RADIO_SIMILARES_M }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => db.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
