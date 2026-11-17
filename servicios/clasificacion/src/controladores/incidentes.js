/** Controladores HTTP de Clasificación. */
const { validar, leerPaginacion, respuestaPaginada } = require('@urbansync/comun');
const E = require('../esquemas/incidentes');

function crearControladorIncidentes(servicio) {
  return {
    async categorias(req, res) {
      res.json({ datos: await servicio.categorias() });
    },

    /** 201 si se creó; 200 con el original si la Idempotency-Key ya se había usado (PC-03). */
    async crear(req, res) {
      const idempotencyKey = validar(E.esquemaIdempotencyKey, req.get('idempotency-key'));
      const datos = validar(E.esquemaCrear, req.body);
      const { incidente, creado } = await servicio.crear({
        ciudadanoId: req.usuario.id, idempotencyKey, datos, requestId: req.id, log: req.log,
      });
      res.status(creado ? 201 : 200).json(incidente);
    },

    async mios(req, res) {
      const pag = leerPaginacion(req.query);
      const { filas, total } = await servicio.listarDeCiudadano(req.usuario.id, pag);
      res.json(respuestaPaginada(filas, total, pag));
    },

    async listar(req, res) {
      const filtros = validar(E.esquemaFiltros, req.query);
      const pag = leerPaginacion(req.query);
      const { filas, total } = await servicio.listar(filtros, pag);
      res.json(respuestaPaginada(filas, total, pag));
    },

    async detalle(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      res.json(await servicio.detalle(id, req.usuario));
    },

    async clasificar(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      const cambios = validar(E.esquemaClasificacion, req.body);
      res.json(await servicio.clasificar(id, req.usuario, cambios));
    },

    async interno(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      res.json(await servicio.obtenerInterno(id));
    },
  };
}

module.exports = { crearControladorIncidentes };
