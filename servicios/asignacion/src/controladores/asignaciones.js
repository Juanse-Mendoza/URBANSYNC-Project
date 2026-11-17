/** Controladores HTTP de Asignación. */
const { validar, leerPaginacion, respuestaPaginada } = require('@urbansync/comun');
const E = require('../esquemas/asignaciones');

function crearControladorAsignaciones(servicio) {
  const opciones = (req) => ({ requestId: req.id });
  return {
    async crear(req, res) {
      const datos = validar(E.esquemaCrear, req.body);
      res.status(201).json(await servicio.crear(datos, req.usuario, opciones(req)));
    },

    async mias(req, res) {
      const { estado } = validar(E.esquemaFiltroMias, req.query);
      const pag = leerPaginacion(req.query);
      const { filas, total } = await servicio.mias(req.usuario, estado, pag);
      res.json(respuestaPaginada(filas, total, pag));
    },

    async actualizarEstado(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      const datos = validar(E.esquemaEstado, req.body);
      res.json(await servicio.actualizarEstado(id, req.usuario, datos));
    },

    async reasignar(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      const datos = validar(E.esquemaReasignar, req.body);
      res.json(await servicio.reasignar(id, req.usuario, datos, opciones(req)));
    },

    async historial(req, res) {
      const id = validar(E.esquemaId, req.params.incidenteId);
      const datos = await servicio.historialIncidente(id);
      res.json({ incidenteId: id, datos });
    },
  };
}

module.exports = { crearControladorAsignaciones };
