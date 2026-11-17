/**
 * Cliente HTTP resiliente para llamadas síncronas entre servicios.
 * - Timeout (HTTP_TIMEOUT_MS, 2 s por defecto).
 * - Reintentos opcionales con backoff exponencial + jitter (200/400/800 ms) SOLO ante
 *   errores de red, timeouts o respuestas 5xx. Nunca se reintenta un 4xx.
 * - Todo envuelto en un circuit breaker.
 * - Si falla, lanza AppError(503, 'SERVICIO_NO_DISPONIBLE').
 *
 * Las respuestas 4xx NO son errores para este cliente: se devuelven tal cual para que el
 * servicio que llama decida (por ejemplo, 404 = "el incidente no existe").
 */
const axios = require('axios');
const { CircuitBreaker } = require('./breaker');
const { AppError } = require('./errores');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERAS_BASE_MS = [200, 400, 800];

function crearClienteHttp({
  nombre,                       // nombre legible del destino, p. ej. 'ubicaciones'
  baseURL,
  gatewayToken = process.env.GATEWAY_TOKEN,
  timeoutMs = Number(process.env.HTTP_TIMEOUT_MS) || 2000,
  reintentos = 0,               // reintentos por defecto del cliente (0..3)
  logger,
  breaker,
}) {
  const instancia = axios.create({
    baseURL,
    timeout: timeoutMs,
    // < 500 se considera respuesta válida (incluye 4xx); 5xx y errores de red lanzan excepción.
    validateStatus: (status) => status < 500,
    headers: { 'X-Gateway-Token': gatewayToken },
  });
  const cb = breaker || new CircuitBreaker({ nombre, logger });

  async function peticion(config, opciones = {}) {
    const maxReintentos = Math.min(opciones.reintentos ?? reintentos, ESPERAS_BASE_MS.length);
    const headers = { ...(config.headers || {}) };
    if (opciones.requestId) headers['X-Request-Id'] = opciones.requestId;
    if (opciones.usuario) {
      headers['X-Usuario-Id'] = opciones.usuario.id;
      headers['X-Usuario-Rol'] = opciones.usuario.rol;
    }

    try {
      return await cb.ejecutar(async () => {
        for (let intento = 0; ; intento++) {
          try {
            return await instancia.request({ ...config, headers });
          } catch (err) {
            if (intento >= maxReintentos) throw err;
            const espera = ESPERAS_BASE_MS[intento] + Math.floor(Math.random() * 100); // jitter
            logger?.warn(
              { destino: nombre, intento: intento + 1, esperaMs: espera, motivo: err.code || err.message },
              'Llamada fallida, reintentando',
            );
            await dormir(espera);
          }
        }
      });
    } catch (err) {
      if (err.name === 'AppError') throw err; // breaker abierto
      logger?.warn({ destino: nombre, motivo: err.code || err.message }, 'Servicio destino no disponible');
      throw new AppError(
        503,
        'SERVICIO_NO_DISPONIBLE',
        `El servicio de ${nombre} no está disponible en este momento, intenta más tarde`,
      );
    }
  }

  return {
    breaker: cb,
    get: (url, opciones = {}) => peticion({ method: 'get', url, params: opciones.params }, opciones),
    post: (url, data, opciones = {}) => peticion({ method: 'post', url, data }, opciones),
    patch: (url, data, opciones = {}) => peticion({ method: 'patch', url, data }, opciones),
  };
}

module.exports = { crearClienteHttp };
