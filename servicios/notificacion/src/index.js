/**
 * Servicio de Notificación (puerto 3005, esquema "notificaciones").
 * Consume eventos de RabbitMQ, genera notificaciones y las expone a la app (polling).
 */
const {
  crearLogger, crearDb, Mensajeria, crearAppBase, finalizarApp, manejarApagado, crearClienteHttp, AppError,
} = require('@urbansync/comun');
const { crearRepositorioNotificaciones } = require('./repositorios/notificaciones');
const { crearProcesador } = require('./eventos/procesador');
const { crearControladorNotificaciones } = require('./controladores/notificaciones');
const { rutasNotificaciones } = require('./rutas/notificaciones');

const SERVICIO = 'notificacion';
const PORT = Number(process.env.PORT) || 3005;
const logger = crearLogger(SERVICIO);

const db = crearDb({ connectionString: process.env.DATABASE_URL, esquema: process.env.DB_SCHEMA, logger });
const mensajeria = new Mensajeria({ url: process.env.RABBITMQ_URL, logger });
const repo = crearRepositorioNotificaciones(db);

// Cliente hacia Usuario para obtener los supervisores (RF-NOT-02).
const httpUsuario = crearClienteHttp({ nombre: 'usuario', baseURL: process.env.URL_SERVICIO_USUARIO, logger, reintentos: 2 });
const clienteUsuario = {
  async idsPorRol(rol) {
    const r = await httpUsuario.get('/internal/usuarios', { params: { rol } });
    if (r.status !== 200) throw new AppError(502, 'RESPUESTA_INVALIDA', 'Usuario respondió con error');
    return r.data.datos.map((u) => u.id);
  },
};

const app = crearAppBase({ servicio: SERVICIO, logger, db, mensajeria });
app.use('/api/notificaciones', rutasNotificaciones(crearControladorNotificaciones(repo)));
finalizarApp(app, logger);

async function iniciar() {
  await db.conectar();
  await mensajeria.consumir('notificacion.eventos', crearProcesador({ db, repo, clienteUsuario, logger }));
  await mensajeria.conectar();
  const servidor = app.listen(PORT, () => logger.info({ puerto: PORT }, 'Servicio iniciado'));
  manejarApagado({ servidor, logger, recursos: [() => mensajeria.cerrar(), () => db.cerrar()] });
}

iniciar().catch((err) => {
  logger.fatal({ motivo: err.message }, 'No fue posible iniciar el servicio');
  process.exit(1);
});

module.exports = { app };
