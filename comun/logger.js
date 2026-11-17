/**
 * Logs estructurados en JSON con pino.
 * Cada línea incluye: fecha, servicio, nivel, requestId (en peticiones HTTP) y mensaje.
 * Los campos sensibles (contraseñas, tokens, Authorization) se ocultan con "redact".
 */
const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');

const RUTAS_SENSIBLES = [
  'req.headers.authorization',
  'req.headers["x-gateway-token"]',
  'contrasena', 'nuevaContrasena', 'hash_contrasena', 'token', 'jwt',
  '*.contrasena', '*.nuevaContrasena', '*.hash_contrasena', '*.token', '*.jwt',
];

function crearLogger(servicio) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { servicio },
    messageKey: 'mensaje',
    timestamp: () => `,"fecha":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ nivel: label }) },
    redact: { paths: RUTAS_SENSIBLES, censor: '[OCULTO]' },
  });
}

const REQUEST_ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Middleware de log por petición. Propaga el X-Request-Id recibido (o genera uno)
 * para poder seguir una petición a través del gateway y de los servicios.
 */
function crearLoggerHttp(logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const recibido = req.headers['x-request-id'];
      const id = recibido && REQUEST_ID_VALIDO.test(recibido) ? recibido : randomUUID();
      req.headers['x-request-id'] = id;
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customAttributeKeys: { reqId: 'requestId', responseTime: 'duracionMs' },
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: {
      req: (req) => ({ metodo: req.method, url: req.url }),
      res: (res) => ({ estado: res.statusCode }),
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}

module.exports = { crearLogger, crearLoggerHttp };
