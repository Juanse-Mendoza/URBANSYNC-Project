/** Controladores del servicio de Ubicaciones. */
const { validar, AppError } = require('@urbansync/comun');
const E = require('../esquemas/ubicaciones');

function crearControladorUbicaciones({ repo, radioSimilares }) {
  return {
    /** POST /internal/ubicaciones -> { similares } */
    async registrar(req, res) {
      const datos = validar(E.esquemaRegistro, req.body);
      const similares = await repo.registrarYContar(datos, radioSimilares);
      req.log.info({ incidenteId: datos.incidenteId, categoria: datos.categoria, similares }, 'Ubicación registrada');
      res.status(201).json({ incidenteId: datos.incidenteId, similares, radioSimilaresM: radioSimilares });
    },

    async mapa(req, res) {
      const filtros = validar(E.esquemaMapa, req.query);
      const puntos = await repo.mapa(filtros);
      res.json({ datos: puntos, total: puntos.length, limite: 200 });
    },

    async similares(req, res) {
      const id = validar(E.esquemaId, req.params.incidenteId);
      const base = await repo.buscar(id);
      if (!base) throw new AppError(404, 'UBICACION_NO_ENCONTRADA', 'No hay ubicación registrada para ese incidente');
      const cercanos = await repo.similares(id);
      res.json({ incidente: base, radioM: base.radio_m, datos: cercanos, total: cercanos.length });
    },

    async actualizarRadio(req, res) {
      const id = validar(E.esquemaId, req.params.incidenteId);
      const { radio_m } = validar(E.esquemaRadio, req.body);
      const actualizado = await repo.actualizarRadio(id, radio_m);
      if (!actualizado) throw new AppError(404, 'UBICACION_NO_ENCONTRADA', 'No hay ubicación registrada para ese incidente');
      res.json(actualizado);
    },
  };
}

module.exports = { crearControladorUbicaciones };
