/** Rutas del servicio de Ubicaciones. */
const express = require('express');
const { asincrono: a, requiereUsuario, requiereRol, ROLES } = require('@urbansync/comun');

function rutasUbicaciones(c) {
  const r = express.Router();
  r.get('/mapa', requiereUsuario, a(c.mapa));
  r.get('/:incidenteId/similares', requiereRol(ROLES.SUPERVISOR), a(c.similares));
  r.patch('/:incidenteId/radio', requiereRol(ROLES.SUPERVISOR), a(c.actualizarRadio));
  return r;
}

function rutasInternas(c) {
  const r = express.Router();
  r.post('/', a(c.registrar));
  return r;
}

module.exports = { rutasUbicaciones, rutasInternas };
