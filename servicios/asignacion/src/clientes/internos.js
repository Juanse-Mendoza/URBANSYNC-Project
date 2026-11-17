/**
 * Llamadas síncronas a otros servicios (con timeout, 2 reintentos y circuit breaker):
 *  - Clasificación: estado del incidente (debe estar "confirmado" para asignarlo).
 *  - Usuario: el destinatario debe existir y tener rol ente_gestion.
 * Devuelven null si el recurso no existe (404).
 */
const { crearClienteHttp, AppError } = require('@urbansync/comun');

function crearClientesInternos({ logger, env = process.env }) {
  const clasificacion = crearClienteHttp({ nombre: 'clasificacion', baseURL: env.URL_SERVICIO_CLASIFICACION, logger, reintentos: 2 });
  const usuario = crearClienteHttp({ nombre: 'usuario', baseURL: env.URL_SERVICIO_USUARIO, logger, reintentos: 2 });

  async function obtener(cliente, ruta, opciones) {
    const r = await cliente.get(ruta, opciones);
    if (r.status === 404 || r.status === 400) return null;
    if (r.status !== 200) throw new AppError(502, 'RESPUESTA_INVALIDA', 'Respuesta inesperada de un servicio interno');
    return r.data;
  }

  return {
    incidente: (id, opciones) => obtener(clasificacion, `/internal/incidentes/${id}`, opciones),
    usuario: (id, opciones) => obtener(usuario, `/internal/usuarios/${id}`, opciones),
  };
}

module.exports = { crearClientesInternos };
