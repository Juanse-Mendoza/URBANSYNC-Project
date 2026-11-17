/** Rutas de Clasificación. "/mios" va antes de "/:id" para que no se confunda con un id. */
const express = require('express');
const { asincrono: a, requiereUsuario, requiereRol, ROLES } = require('@urbansync/comun');

const { CIUDADANO, SUPERVISOR, ENTE } = ROLES;

function rutasCategorias(c) {
  const r = express.Router();
  r.get('/', requiereUsuario, a(c.categorias));
  return r;
}

function rutasIncidentes(c) {
  const r = express.Router();
  r.post('/', requiereRol(CIUDADANO), a(c.crear));
  r.get('/mios', requiereRol(CIUDADANO), a(c.mios));
  r.get('/', requiereRol(SUPERVISOR), a(c.listar));
  r.get('/:id', requiereRol(CIUDADANO, SUPERVISOR, ENTE), a(c.detalle));
  r.patch('/:id/clasificacion', requiereRol(SUPERVISOR), a(c.clasificar));
  return r;
}

function rutasInternas(c) {
  const r = express.Router();
  r.get('/:id', a(c.interno));
  return r;
}

module.exports = { rutasCategorias, rutasIncidentes, rutasInternas };
