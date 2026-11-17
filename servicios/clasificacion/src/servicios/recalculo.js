/**
 * Tarea periódica de recálculo de prioridad (sección 10, paso 5; prueba PT-02).
 *
 * Cada 60 s busca incidentes con recalcular_prioridad = true (creados mientras Ubicaciones
 * estaba caído), reintenta registrarlos en Ubicaciones (3 reintentos con backoff) y actualiza
 * la prioridad. Si el supervisor ya fijó la prioridad, nunca la baja.
 */
const { calcularPrioridad, maxPrioridad } = require('./prioridad');

function iniciarRecalculo({ repo, servicio, clienteUbicaciones, logger, intervaloMs = 60000, lote = 20 }) {
  let enCurso = false;

  async function ciclo() {
    if (enCurso) return 0;
    enCurso = true;
    let actualizados = 0;
    try {
      const pendientes = await repo.pendientesRecalculo(lote);
      for (const inc of pendientes) {
        try {
          const similares = await clienteUbicaciones.registrar(
            { incidenteId: inc.id, categoria: inc.categoria, lat: inc.lat, lng: inc.lng, radio_m: inc.radio_m },
            { reintentos: 3 },
          );
          const base = await servicio.prioridadBase(inc.categoria);
          let nueva = calcularPrioridad(base, similares);
          let origen = 'automatica';
          if (inc.prioridad_origen === 'supervisor') {
            nueva = maxPrioridad(inc.prioridad, nueva); // no se baja lo que fijó el supervisor
            origen = 'supervisor';
          }
          if (await repo.aplicarRecalculo(inc.id, nueva, origen)) {
            actualizados += 1;
            logger.info({ incidenteId: inc.id, de: inc.prioridad, a: nueva, similares }, 'Prioridad recalculada');
          }
        } catch (err) {
          logger.warn({ incidenteId: inc.id, motivo: err.message }, 'Recálculo pendiente: Ubicaciones sigue sin responder');
          break; // se reintenta en el siguiente ciclo
        }
      }
    } catch (err) {
      logger.error({ motivo: err.message }, 'Error en la tarea de recálculo');
    } finally {
      enCurso = false;
    }
    return actualizados;
  }

  const temporizador = setInterval(ciclo, intervaloMs);
  logger.info({ intervaloMs }, 'Tarea de recálculo de prioridad iniciada');
  return { ciclo, detener: () => clearInterval(temporizador) };
}

module.exports = { iniciarRecalculo };
