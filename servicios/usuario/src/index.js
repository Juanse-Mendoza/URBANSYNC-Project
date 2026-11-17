/**
 * Servicio de Usuario (puerto 3001, esquema "usuarios").
 * Registro, login con JWT, perfil, recuperación simulada, entes y cuentas institucionales.
 */
const {
  crearLogger, crearDb, crearAppBase, finalizarApp, manejarApagado,
} = require('@urbansync/comun');
const { crearRepositorioUsuarios } = require('./repositorios/usuarios');
const { crearServicioUsuarios } = require('./servicios/usuarios');
const { crearControladorUsuarios } = require('./controladores/usuarios');
const { rutasUsuarios, rutasInternas } = require('./rutas/usuarios');

const SERVICIO = 'usuario';
const PORT = Number(process.env.PORT) || 3001;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
// Este servicio no usa mensajería asíncrona.

const repo = crearRepositorioUsuarios(db);
const servicio = crearServicioUsuarios({
  repo,
  logger,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
});
const controlador = crearControladorUsuarios(servicio);

const app = crearAppBase({ servicio: SERVICIO, logger, db });
app.use('/api/usuarios', rutasUsuarios(controlador));
app.use('/internal/usuarios', rutasInternas(controlador));
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  if (process.env.SEED === 'true') await servicio.sembrar();
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => db.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
