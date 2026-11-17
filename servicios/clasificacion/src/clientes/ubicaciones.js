/**
 * Cliente síncrono hacia el servicio de Ubicaciones, usando comun/httpResiliente
 * (timeout 2 s + circuit breaker). Por defecto SIN reintentos, para que la creación de un
 * incidente responda en <= 3 s aunque Ubicaciones esté caído (RNF-REN-01).
 * La tarea de recálculo sí pide reintentos (opciones.reintentos = 3).
 */
const { crearClienteHttp, AppError } = require('@urbansync/comun');

function crearClienteUbicaciones({ baseURL = process.env.URL_SERVICIO_UBICACIONES, logger, nombre = 'ubicaciones' }) {
  const http = crearClienteHttp({ nombre, baseURL, logger, reintentos: 0 });

  return {
    breaker: http.breaker,

    /** Registra el punto y devuelve cuántos reportes similares hay (incluido este). */
    async registrar({ incidenteId, categoria, lat, lng, radio_m }, opciones = {}) {
      const r = await http.post('/internal/ubicaciones', { incidenteId, categoria, lat, lng, radio_m }, opciones);
      if (r.status !== 201) {
        throw new AppError(502, 'RESPUESTA_INVALIDA', `Ubicaciones respondió ${r.status}`);
      }
      return r.data.similares;
    },
  };
}

module.exports = { crearClienteUbicaciones };
