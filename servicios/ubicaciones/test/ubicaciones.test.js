const request = require('supertest');
const { crearLogger, crearAppBase, finalizarApp } = require('@urbansync/comun');
const { crearControladorUbicaciones } = require('../src/controladores/ubicaciones');
const { rutasUbicaciones, rutasInternas } = require('../src/rutas/ubicaciones');
const { esquemaMapa, esquemaRegistro } = require('../src/esquemas/ubicaciones');

const logger = crearLogger('ubicaciones-test');
logger.level = 'silent';
const TOKEN = 'token-interno';
const ID = '11111111-1111-4111-8111-111111111111';

function montar() {
  const repo = {
    registrarYContar: jest.fn(async () => 3),
    mapa: jest.fn(async () => []),
    buscar: jest.fn(async (id) => (id === ID ? { incidente_id: ID, radio_m: 50 } : null)),
    similares: jest.fn(async () => [{ incidente_id: 'otro', distancia_m: 12 }]),
    actualizarRadio: jest.fn(async (id, radio) => ({ incidente_id: id, radio_m: radio })),
  };
  const app = crearAppBase({ servicio: 'ubicaciones', logger, db: { ping: async () => true }, gatewayToken: TOKEN });
  const c = crearControladorUbicaciones({ repo, radioSimilares: 50 });
  app.use('/api/ubicaciones', rutasUbicaciones(c));
  app.use('/internal/ubicaciones', rutasInternas(c));
  finalizarApp(app, logger);
  return { app, repo };
}
const como = (r, rol) => r.set('X-Gateway-Token', TOKEN).set('X-Usuario-Id', 'u1').set('X-Usuario-Rol', rol);

describe('esquemas de Ubicaciones', () => {
  test('el radio por defecto del registro es 50 m', () => {
    expect(esquemaRegistro.parse({ incidenteId: ID, categoria: 'seguridad', lat: 4.6, lng: -74 }).radio_m).toBe(50);
  });
  test('lat sin lng en el mapa es inválido', () => {
    expect(esquemaMapa.safeParse({ lat: '4.6' }).success).toBe(false);
  });
  test('radio fuera de 25-200 m es inválido', () => {
    expect(esquemaRegistro.safeParse({ incidenteId: ID, categoria: 'seguridad', lat: 4.6, lng: -74, radio_m: 300 }).success).toBe(false);
  });
});

describe('API de Ubicaciones', () => {
  test('POST /internal/ubicaciones sin token interno -> 401', async () => {
    const { app } = montar();
    const r = await request(app).post('/internal/ubicaciones').send({ incidenteId: ID, categoria: 'seguridad', lat: 4.6, lng: -74 });
    expect(r.status).toBe(401);
  });

  test('POST /internal/ubicaciones devuelve el número de similares', async () => {
    const { app, repo } = montar();
    const r = await request(app).post('/internal/ubicaciones').set('X-Gateway-Token', TOKEN)
      .send({ incidenteId: ID, categoria: 'seguridad', lat: 4.6, lng: -74 });
    expect(r.status).toBe(201);
    expect(r.body.similares).toBe(3);
    expect(repo.registrarYContar).toHaveBeenCalledWith(expect.objectContaining({ radio_m: 50 }), 50);
  });

  test('GET /mapa con coordenadas inválidas -> 400', async () => {
    const { app } = montar();
    const r = await como(request(app).get('/api/ubicaciones/mapa?lat=95&lng=-74'), 'ciudadano');
    expect(r.status).toBe(400);
  });

  test('GET /:id/similares: ciudadano -> 403, inexistente -> 404, supervisor -> 200', async () => {
    const { app } = montar();
    expect((await como(request(app).get(`/api/ubicaciones/${ID}/similares`), 'ciudadano')).status).toBe(403);
    expect((await como(request(app).get('/api/ubicaciones/22222222-2222-4222-8222-222222222222/similares'), 'supervisor')).status).toBe(404);
    const r = await como(request(app).get(`/api/ubicaciones/${ID}/similares`), 'supervisor');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
  });
});
