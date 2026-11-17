/**
 * Pruebas del gateway con un microservicio FALSO (express en un puerto aleatorio) que
 * devuelve los encabezados que recibió. Así se verifica qué reenvía realmente el gateway.
 */
const http = require('http');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { crearLogger } = require('@urbansync/comun');
const { crearApp } = require('../src/app');

const SECRETO = 'secreto-de-prueba';
const TOKEN_INTERNO = 'token-interno';
const logger = crearLogger('gateway-test');
logger.level = 'silent';

const firmar = (rol, opciones = {}) => jwt.sign(
  { rol, nombre: 'Prueba' }, SECRETO,
  { subject: `id-${rol}`, issuer: 'urbansync', algorithm: 'HS256', expiresIn: '5m', ...opciones },
);

let falso;
let app;
beforeAll(async () => {
  const f = express();
  f.all('*', (req, res) => res.json({ ruta: req.originalUrl, headers: req.headers }));
  falso = http.createServer(f);
  await new Promise((r) => falso.listen(0, r));
  const url = `http://127.0.0.1:${falso.address().port}`;
  app = crearApp({
    logger,
    env: {
      JWT_SECRET: SECRETO,
      GATEWAY_TOKEN: TOKEN_INTERNO,
      URL_SERVICIO_USUARIO: url,
      URL_SERVICIO_CLASIFICACION: url,
      URL_SERVICIO_UBICACIONES: url,
      URL_SERVICIO_ASIGNACION: url,
      URL_SERVICIO_NOTIFICACION: 'http://127.0.0.1:1', // servicio "caído"
    },
  });
});
afterAll(() => new Promise((r) => falso.close(r)));

describe('Gateway: autenticación', () => {
  test('ruta protegida sin token -> 401 TOKEN_REQUERIDO', async () => {
    const r = await request(app).get('/api/incidentes/mios');
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('TOKEN_REQUERIDO');
  });

  test('token con firma inválida -> 401 TOKEN_INVALIDO', async () => {
    const malo = jwt.sign({ rol: 'supervisor' }, 'otro-secreto', { subject: 'x', issuer: 'urbansync' });
    const r = await request(app).get('/api/incidentes').set('Authorization', `Bearer ${malo}`);
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  test('token expirado -> 401 TOKEN_EXPIRADO', async () => {
    const vencido = firmar('ciudadano', { expiresIn: -10 });
    const r = await request(app).get('/api/usuarios/me').set('Authorization', `Bearer ${vencido}`);
    expect(r.body.error.codigo).toBe('TOKEN_EXPIRADO');
  });

  test('ruta pública (login) pasa sin token', async () => {
    const r = await request(app).post('/api/usuarios/login').send({ correo: 'a@b.co', contrasena: 'x' });
    expect(r.status).toBe(200);
    expect(r.body.ruta).toBe('/api/usuarios/login');
  });
});

describe('Gateway: autorización por rol', () => {
  test('PI-04: ciudadano en GET /api/incidentes -> 403', async () => {
    const r = await request(app).get('/api/incidentes').set('Authorization', `Bearer ${firmar('ciudadano')}`);
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('PROHIBIDO');
  });

  test('mayúsculas o "/" final no evaden las reglas', async () => {
    const r = await request(app).get('/API/Incidentes/').set('Authorization', `Bearer ${firmar('ciudadano')}`);
    expect(r.status).toBe(403);
  });

  test('supervisor en GET /api/incidentes -> se reenvía al servicio', async () => {
    const r = await request(app).get('/api/incidentes?estado=pendiente').set('Authorization', `Bearer ${firmar('supervisor')}`);
    expect(r.status).toBe(200);
    expect(r.body.ruta).toBe('/api/incidentes?estado=pendiente');
  });
});

describe('Gateway: encabezados reenviados', () => {
  test('agrega identidad y token interno, y quita Authorization', async () => {
    const r = await request(app).get('/api/usuarios/me').set('Authorization', `Bearer ${firmar('ciudadano')}`);
    const h = r.body.headers;
    expect(h['x-usuario-id']).toBe('id-ciudadano');
    expect(h['x-usuario-rol']).toBe('ciudadano');
    expect(h['x-gateway-token']).toBe(TOKEN_INTERNO);
    expect(h['x-request-id']).toBeDefined();
    expect(h.authorization).toBeUndefined();
  });

  test('ignora X-Usuario-Rol y X-Gateway-Token falsificados por el cliente', async () => {
    const r = await request(app).get('/api/usuarios/me')
      .set('Authorization', `Bearer ${firmar('ciudadano')}`)
      .set('X-Usuario-Rol', 'admin')
      .set('X-Usuario-Id', 'otro')
      .set('X-Gateway-Token', 'falso');
    expect(r.body.headers['x-usuario-rol']).toBe('ciudadano');
    expect(r.body.headers['x-usuario-id']).toBe('id-ciudadano');
    expect(r.body.headers['x-gateway-token']).toBe(TOKEN_INTERNO);
  });
});

describe('Gateway: enrutamiento y fallos', () => {
  test('/internal no está expuesto -> 404', async () => {
    const r = await request(app).get('/internal/usuarios/1').set('Authorization', `Bearer ${firmar('admin')}`);
    expect(r.status).toBe(404);
  });

  test('servicio destino caído -> 503 en español', async () => {
    const r = await request(app).get('/api/notificaciones').set('Authorization', `Bearer ${firmar('ciudadano')}`);
    expect(r.status).toBe(503);
    expect(r.body.error).toEqual({
      codigo: 'SERVICIO_NO_DISPONIBLE',
      mensaje: 'El servicio no está disponible en este momento, intenta más tarde',
    });
  });

  test('body mayor a 100 kb -> 413', async () => {
    const r = await request(app).post('/api/usuarios/registro')
      .set('Content-Type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(110 * 1024) }));
    expect(r.status).toBe(413);
  });
});
