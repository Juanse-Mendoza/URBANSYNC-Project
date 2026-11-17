/** Rutas de Notificación: cada usuario solo ve y modifica las suyas. */
const express = require('express');
const { asincrono: a, requiereUsuario } = require('@urbansync/comun');

function rutasNotificaciones(c) {
  const r = express.Router();
  r.use(requiereUsuario);
  r.get('/', a(c.listar));
  r.get('/no-leidas/conteo', a(c.conteo));
  r.patch('/leer-todas', a(c.marcarTodas));
  r.patch('/:id/leida', a(c.marcarLeida));
  return r;
}

module.exports = { rutasNotificaciones };
