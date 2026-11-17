/**
 * Autenticación interna de los microservicios.
 * El gateway valida el JWT y reenvía la identidad en encabezados:
 *   X-Usuario-Id, X-Usuario-Rol  -> quién hace la petición
 *   X-Gateway-Token              -> prueba de que la petición viene del gateway
 *                                   (o de otro servicio interno) (DECISIONES.md #10)
 * Un cliente que intente llamar directamente a un servicio sin el token recibe 401.
 */
const crypto = require('crypto');
const { AppError } = require('./errores');

const ROLES = Object.freeze({
  CIUDADANO: 'ciudadano',
  SUPERVISOR: 'supervisor',
  ENTE: 'ente_gestion',
  ADMIN: 'admin',
});

/** Comparación en tiempo constante para no filtrar el token por diferencias de tiempo. */
function igualSeguro(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function verificarGateway(tokenEsperado) {
  if (!tokenEsperado) throw new Error('GATEWAY_TOKEN no está definido');
  return (req, res, next) => {
    if (!igualSeguro(req.get('x-gateway-token'), tokenEsperado)) {
      return next(new AppError(401, 'NO_AUTORIZADO', 'Acceso no autorizado'));
    }
    next();
  };
}

/** Deja en req.usuario = { id, rol } la identidad enviada por el gateway (o null). */
function extraerUsuario(req, res, next) {
  const id = req.get('x-usuario-id');
  const rol = req.get('x-usuario-rol');
  req.usuario = id && rol ? { id, rol } : null;
  next();
}

function requiereUsuario(req, res, next) {
  if (!req.usuario) return next(new AppError(401, 'NO_AUTENTICADO', 'Debes iniciar sesión'));
  next();
}

/** Autorización por rol dentro del servicio (segunda capa, además del gateway). */
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return next(new AppError(401, 'NO_AUTENTICADO', 'Debes iniciar sesión'));
    if (!roles.includes(req.usuario.rol)) {
      return next(new AppError(403, 'PROHIBIDO', 'No tienes permisos para realizar esta acción'));
    }
    next();
  };
}

module.exports = { ROLES, igualSeguro, verificarGateway, extraerUsuario, requiereUsuario, requiereRol };
