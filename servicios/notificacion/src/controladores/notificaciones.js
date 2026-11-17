/** Controladores HTTP de Notificación (RF-NOT-04). */
const { z } = require('zod');
const { validar, leerPaginacion, respuestaPaginada, AppError } = require('@urbansync/comun');

const esquemaId = z.string().uuid('El identificador de la notificación no es válido');
const esquemaFiltro = z.object({ noLeidas: z.enum(['true', 'false']).optional() }).passthrough();

function crearControladorNotificaciones(repo) {
  return {
    async listar(req, res) {
      const { noLeidas } = validar(esquemaFiltro, req.query);
      const pag = leerPaginacion(req.query);
      const { filas, total } = await repo.listar(req.usuario.id, { soloNoLeidas: noLeidas === 'true', ...pag });
      res.json(respuestaPaginada(filas, total, pag));
    },

    /** Lo consulta la app cada 30 s (polling, DECISIONES.md #5). */
    async conteo(req, res) {
      res.json({ conteo: await repo.contarNoLeidas(req.usuario.id) });
    },

    async marcarLeida(req, res) {
      const id = validar(esquemaId, req.params.id);
      const n = await repo.marcarLeida(id, req.usuario.id);
      if (!n) throw new AppError(404, 'NOTIFICACION_NO_ENCONTRADA', 'La notificación no existe');
      res.json(n);
    },

    async marcarTodas(req, res) {
      res.json({ actualizadas: await repo.marcarTodas(req.usuario.id) });
    },
  };
}

module.exports = { crearControladorNotificaciones };
