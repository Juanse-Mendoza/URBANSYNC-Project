/**
 * Manejo de errores estándar de URBANSYNC (RNF-USA-02).
 * Toda respuesta de error tiene la forma:
 *   { "error": { "codigo": "TEXTO_CORTO", "mensaje": "Mensaje claro en español" } }
 * Nunca se envían trazas internas al cliente; solo se registran en el log.
 */

class AppError extends Error {
  /**
   * @param {number} status  Código HTTP (400, 401, 403, 404, 409, 503...)
   * @param {string} codigo  Código corto en mayúsculas (p. ej. 'VERSION_CONFLICTO')
   * @param {string} mensaje Mensaje para el usuario final, en español
   */
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
  }
}

function enviarError(res, status, codigo, mensaje) {
  return res.status(status).json({ error: { codigo, mensaje } });
}

/** Traduce un "issue" de zod a un mensaje en español. */
function mensajeZod(issue) {
  const campo = issue.path.length ? issue.path.join('.') : 'cuerpo';
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined'
        ? `El campo "${campo}" es obligatorio`
        : `El campo "${campo}" tiene un tipo inválido`;
    case 'too_small':
      return issue.type === 'string'
        ? `El campo "${campo}" debe tener al menos ${issue.minimum} caracteres`
        : `El campo "${campo}" debe ser mayor o igual a ${issue.minimum}`;
    case 'too_big':
      return issue.type === 'string'
        ? `El campo "${campo}" debe tener máximo ${issue.maximum} caracteres`
        : `El campo "${campo}" debe ser menor o igual a ${issue.maximum}`;
    case 'invalid_string':
      return `El campo "${campo}" no tiene un formato válido`;
    case 'invalid_enum_value':
      return `El campo "${campo}" debe ser uno de: ${issue.options.join(', ')}`;
    case 'unrecognized_keys':
      return `Campos no permitidos: ${issue.keys.join(', ')}`;
    default:
      // Mensajes personalizados definidos en los esquemas (ya en español).
      return issue.message || `El campo "${campo}" no es válido`;
  }
}

/** Middleware 404 para rutas inexistentes. */
function noEncontrado(req, res) {
  enviarError(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe');
}

/**
 * Middleware final de errores. Convierte cualquier error en el formato estándar.
 * Se compara por nombre (no instanceof) porque cada servicio puede tener su propia copia de zod.
 */
function manejadorErrores(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const log = req.log || logger;

    if (err.name === 'AppError') {
      if (err.status >= 500) log.warn({ codigo: err.codigo }, err.message);
      return enviarError(res, err.status, err.codigo, err.message);
    }
    if (err.name === 'ZodError' && Array.isArray(err.issues)) {
      return enviarError(res, 400, 'DATOS_INVALIDOS', mensajeZod(err.issues[0]));
    }
    if (err.type === 'entity.parse.failed') {
      return enviarError(res, 400, 'JSON_INVALIDO', 'El cuerpo de la petición no es un JSON válido');
    }
    if (err.type === 'entity.too.large') {
      return enviarError(res, 413, 'CUERPO_MUY_GRANDE', 'El cuerpo de la petición supera el tamaño permitido');
    }

    log.error({ err }, 'Error no controlado');
    return enviarError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error inesperado, intenta más tarde');
  };
}

/** Envuelve un controlador async para que sus errores lleguen a manejadorErrores. */
const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valida datos con un esquema zod; si fallan, lanza el ZodError (lo atrapa manejadorErrores). */
function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) throw resultado.error;
  return resultado.data;
}

module.exports = { AppError, enviarError, mensajeZod, noEncontrado, manejadorErrores, asincrono, validar };
