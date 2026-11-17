/**
 * Middlewares de seguridad del gateway, en el orden en que se aplican:
 *   limpiarEncabezados -> resolverDestino -> autenticar (JWT) -> autorizar (rol)
 */
const jwt = require('jsonwebtoken');
const { AppError } = require('@urbansync/comun');
const { normalizar, buscarServicio, esPublica, rolesPermitidos } = require('../config/rutas');

/**
 * Elimina encabezados de identidad que envíe el cliente (DECISIONES.md #10).
 * Sin esto, un atacante podría mandar "X-Usuario-Rol: supervisor" y hacerse pasar por otro.
 */
function limpiarEncabezados(req, res, next) {
  delete req.headers['x-usuario-id'];
  delete req.headers['x-usuario-rol'];
  delete req.headers['x-gateway-token'];
  next();
}

/** Decide a qué microservicio va la petición; si no hay ninguno -> 404. */
function resolverDestino(listaServicios) {
  return (req, res, next) => {
    req.rutaNormalizada = normalizar(req.path);
    req.servicioDestino = buscarServicio(listaServicios, req.rutaNormalizada);
    if (!req.servicioDestino) return next(new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe'));
    next();
  };
}

/** Valida el JWT (HS256) del encabezado Authorization: Bearer <token>. */
function autenticar(jwtSecret) {
  if (!jwtSecret) throw new Error('JWT_SECRET no está definido');
  return (req, res, next) => {
    if (req.method === 'OPTIONS' || esPublica(req.method, req.rutaNormalizada)) return next();

    const [tipo, token] = (req.get('authorization') || '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      return next(new AppError(401, 'TOKEN_REQUERIDO', 'Debes iniciar sesión para acceder a este recurso'));
    }
    try {
      const datos = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: 'urbansync' });
      req.usuario = { id: datos.sub, rol: datos.rol, nombre: datos.nombre };
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError(401, 'TOKEN_EXPIRADO', 'Tu sesión expiró, inicia sesión de nuevo'));
      }
      return next(new AppError(401, 'TOKEN_INVALIDO', 'El token de sesión no es válido'));
    }
  };
}

/** Verifica que el rol del usuario esté permitido para el método + ruta (tabla REGLAS_ROLES). */
function autorizar(req, res, next) {
  if (!req.usuario) return next(); // ruta pública
  const roles = rolesPermitidos(req.method, req.rutaNormalizada);
  if (roles && !roles.includes(req.usuario.rol)) {
    req.log?.warn({ usuarioId: req.usuario.id, rol: req.usuario.rol, ruta: req.rutaNormalizada }, 'Acceso denegado por rol');
    return next(new AppError(403, 'PROHIBIDO', 'No tienes permisos para realizar esta acción'));
  }
  next();
}

/** Rechaza cuerpos mayores a 100 kb sin leerlos (el gateway no parsea el body: lo reenvía tal cual). */
function limiteCuerpo(maxBytes = 100 * 1024) {
  return (req, res, next) => {
    const largo = Number(req.get('content-length') || 0);
    if (largo > maxBytes) {
      return next(new AppError(413, 'CUERPO_MUY_GRANDE', 'El cuerpo de la petición supera el tamaño permitido (100 kb)'));
    }
    next();
  };
}

/** CORS abierto solo en desarrollo (la app Android no lo necesita; sirve para pruebas desde navegador). */
function corsDesarrollo(habilitado) {
  return (req, res, next) => {
    if (!habilitado) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key,X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

module.exports = { limpiarEncabezados, resolverDestino, autenticar, autorizar, limiteCuerpo, corsDesarrollo };
