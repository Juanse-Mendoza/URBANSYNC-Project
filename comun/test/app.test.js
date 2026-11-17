/** Errores estándar, token interno y roles, probados sobre la app base con supertest. */
const request = require('supertest');
const { crearAppBase, finalizarApp } = require('../app');
const { crearLogger } = require('../logger');
const { AppError, asincrono, mensajeZod } = require('../errores');
const { requiereRol } = require('../auth');

const logger = crearLogger('test');
logger.level = 'silent';
const TOKEN = 'token-interno-de-prueba';

function app({ dbOk = true } = {}) {
  const a = crearAppBase({ servicio: 'test', logger, db: { ping: async () => dbOk }, gatewayToken: TOKEN });
  a.get('/api/supervisores', requiereRol('supervisor'), (req, res) => res.json({ ok: true, usuario: req.usuario }));
  a.get('/api/conflicto', asincrono(async () => { throw new AppError(409, 'VERSION_CONFLICTO', 'Conflicto'); }));
  a.get('/api/explota', asincrono(async () => { throw new Error('detalle interno secreto'); }));
  a.post('/api/eco', (req, res) => res.json(req.body));
  return finalizarApp(a, logger);
}
const conToken = (r) => r.set('X-Gateway-Token', TOKEN);

describe('app base de los servicios', () => {
  test('GET /health es público y reporta la BD', async () => {
    const r = await request(app()).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'ok', servicio: 'test', db: true, broker: 'no_aplica' });
  });

  test('/health responde 503 si la BD no responde', async () => {
    const r = await request(app({ dbOk: false })).get('/health');
    expect(r.status).toBe(503);
    expect(r.body.estado).toBe('caido');
  });

  test('sin X-Gateway-Token -> 401 con el formato estándar', async () => {
    const r = await request(app()).get('/api/supervisores');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'Acceso no autorizado' } });
  });

  test('token interno incorrecto -> 401', async () => {
    const r = await request(app()).get('/api/supervisores').set('X-Gateway-Token', 'otro');
    expect(r.status).toBe(401);
  });

  test('rol no permitido -> 403; rol correcto -> 200', async () => {
    const a = app();
    const r1 = await conToken(request(a).get('/api/supervisores')).set('X-Usuario-Id', 'u1').set('X-Usuario-Rol', 'ciudadano');
    expect(r1.status).toBe(403);
    const r2 = await conToken(request(a).get('/api/supervisores')).set('X-Usuario-Id', 'u1').set('X-Usuario-Rol', 'supervisor');
    expect(r2.status).toBe(200);
    expect(r2.body.usuario).toEqual({ id: 'u1', rol: 'supervisor' });
  });

  test('AppError se traduce a su código HTTP', async () => {
    const r = await conToken(request(app()).get('/api/conflicto'));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('VERSION_CONFLICTO');
  });

  test('un error inesperado responde 500 sin filtrar detalles internos (RNF-USA-02)', async () => {
    const r = await conToken(request(app()).get('/api/explota'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secreto');
    expect(r.body.error.codigo).toBe('ERROR_INTERNO');
  });

  test('JSON mal formado -> 400 JSON_INVALIDO', async () => {
    const r = await conToken(request(app()).post('/api/eco')).set('Content-Type', 'application/json').send('{"a":');
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('JSON_INVALIDO');
  });

  test('ruta inexistente -> 404 RUTA_NO_ENCONTRADA', async () => {
    const r = await conToken(request(app()).get('/api/no-existe'));
    expect(r.status).toBe(404);
  });
});

describe('mensajeZod', () => {
  test('campo obligatorio', () => {
    expect(mensajeZod({ code: 'invalid_type', received: 'undefined', path: ['titulo'], message: 'Required' }))
      .toBe('El campo "titulo" es obligatorio');
  });
  test('respeta mensajes personalizados en español', () => {
    expect(mensajeZod({ code: 'custom', path: ['x'], message: 'La contraseña es débil' })).toBe('La contraseña es débil');
  });
});
