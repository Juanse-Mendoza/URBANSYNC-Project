/**
 * Rutas del servicio de Usuario.
 * Los roles se verifican aquí también (segunda capa), aunque el gateway ya los validó.
 */
const express = require('express');
const { asincrono: a, requiereUsuario, requiereRol, ROLES } = require('@urbansync/comun');

function rutasUsuarios(c) {
  const r = express.Router();
  // Públicas
  r.post('/registro', a(c.registro));
  r.post('/login', a(c.login));
  r.post('/recuperar', a(c.recuperar));
  r.post('/restablecer', a(c.restablecer));
  // Protegidas
  r.get('/me', requiereUsuario, a(c.me));
  r.put('/me', requiereRol(ROLES.CIUDADANO), a(c.actualizarMe));
  r.get('/entes', requiereRol(ROLES.SUPERVISOR, ROLES.ADMIN), a(c.listarEntes));
  r.post('/', requiereRol(ROLES.ADMIN), a(c.crearInstitucional));
  return r;
}

/** Rutas /internal/usuarios: el gateway no las expone; solo exigen X-Gateway-Token. */
function rutasInternas(c) {
  const r = express.Router();
  r.get('/', a(c.internoPorRol));
  r.get('/:id', a(c.internoPorId));
  return r;
}

module.exports = { rutasUsuarios, rutasInternas };
