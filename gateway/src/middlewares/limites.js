/**
 * Limitación de tasa (express-rate-limit), por IP y ventana de 1 minuto:
 *  - general: 100 peticiones/min
 *  - login:   10 peticiones/min (frena ataques de fuerza bruta de contraseñas)
 * Los valores se pueden ajustar con RATE_LIMIT_GENERAL / RATE_LIMIT_LOGIN (p. ej. en pruebas de carga).
 */
const rateLimit = require('express-rate-limit');
const { enviarError } = require('@urbansync/comun');

function crearLimitador(limite, mensaje) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: limite,
    standardHeaders: 'draft-7', // encabezado RateLimit con cupo restante
    legacyHeaders: false,
    handler: (req, res) => enviarError(res, 429, 'DEMASIADAS_PETICIONES', mensaje),
  });
}

const limiteGeneral = crearLimitador(
  Number(process.env.RATE_LIMIT_GENERAL) || 100,
  'Has realizado demasiadas peticiones. Espera un minuto e intenta de nuevo',
);

const limiteLogin = crearLimitador(
  Number(process.env.RATE_LIMIT_LOGIN) || 10,
  'Demasiados intentos de inicio de sesión. Espera un minuto e intenta de nuevo',
);

module.exports = { limiteGeneral, limiteLogin };
