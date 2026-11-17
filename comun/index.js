/** Punto de entrada de @urbansync/comun. */
module.exports = {
  ...require('./errores'),
  ...require('./logger'),
  ...require('./db'),
  ...require('./auth'),
  ...require('./breaker'),
  ...require('./httpResiliente'),
  ...require('./mensajeria'),
  ...require('./outbox'),
  ...require('./salud'),
  ...require('./app'),
  ...require('./paginacion'),
};
