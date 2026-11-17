/** Rutas de Asignación. */
const express = require('express');
const { asincrono: a, requiereRol, ROLES } = require('@urbansync/comun');

function rutasAsignaciones(c) {
  const r = express.Router();
  r.post('/', requiereRol(ROLES.SUPERVISOR), a(c.crear));
  r.get('/mias', requiereRol(ROLES.ENTE), a(c.mias));
  r.get('/incidente/:incidenteId', requiereRol(ROLES.SUPERVISOR), a(c.historial));
  r.patch('/:id/estado', requiereRol(ROLES.ENTE), a(c.actualizarEstado));
  r.patch('/:id/reasignar', requiereRol(ROLES.SUPERVISOR), a(c.reasignar));
  return r;
}

module.exports = { rutasAsignaciones };
