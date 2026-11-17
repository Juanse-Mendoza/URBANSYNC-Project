const http = require('http');
const { crearClienteHttp } = require('../httpResiliente');
const { CircuitBreaker } = require('../breaker');

// Servidor HTTP local que responde según una lista de códigos y cuenta las llamadas.
function servidorCon(codigos) {
  const estado = { llamadas: 0, encabezados: null };
  const srv = http.createServer((req, res) => {
    estado.encabezados = req.headers;
    const codigo = codigos[Math.min(estado.llamadas, codigos.length - 1)];
    estado.llamadas += 1;
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ codigo }));
  });
  return new Promise((resolve) => srv.listen(0, () => resolve({ srv, estado, url: `http://127.0.0.1:${srv.address().port}` })));
}

describe('crearClienteHttp', () => {
  let s;
  afterEach(() => new Promise((r) => (s ? s.srv.close(r) : r())));

  test('reintenta ante 5xx y luego tiene éxito', async () => {
    s = await servidorCon([500, 503, 200]);
    const c = crearClienteHttp({ nombre: 'x', baseURL: s.url, gatewayToken: 't', reintentos: 3 });
    const r = await c.get('/');
    expect(r.status).toBe(200);
    expect(s.estado.llamadas).toBe(3);
  });

  test('NUNCA reintenta un 4xx y lo devuelve al llamador', async () => {
    s = await servidorCon([404]);
    const c = crearClienteHttp({ nombre: 'x', baseURL: s.url, gatewayToken: 't', reintentos: 3 });
    const r = await c.get('/');
    expect(r.status).toBe(404);
    expect(s.estado.llamadas).toBe(1);
  });

  test('si se agotan los reintentos lanza AppError 503 en español', async () => {
    s = await servidorCon([500]);
    const c = crearClienteHttp({ nombre: 'ubicaciones', baseURL: s.url, gatewayToken: 't', reintentos: 1 });
    await expect(c.get('/')).rejects.toMatchObject({
      status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', message: expect.stringContaining('ubicaciones'),
    });
    expect(s.estado.llamadas).toBe(2);
  });

  test('agrega X-Gateway-Token y X-Request-Id', async () => {
    s = await servidorCon([200]);
    const c = crearClienteHttp({ nombre: 'x', baseURL: s.url, gatewayToken: 'secreto' });
    await c.get('/', { requestId: 'abc12345' });
    expect(s.estado.encabezados['x-gateway-token']).toBe('secreto');
    expect(s.estado.encabezados['x-request-id']).toBe('abc12345');
  });

  test('servicio inalcanzable -> 503 y abre el breaker', async () => {
    const breaker = new CircuitBreaker({ nombre: 'x', umbral: 2, esperaMs: 60000 });
    const c = crearClienteHttp({ nombre: 'x', baseURL: 'http://127.0.0.1:1', gatewayToken: 't', breaker, timeoutMs: 500 });
    await expect(c.get('/')).rejects.toMatchObject({ status: 503 });
    await expect(c.get('/')).rejects.toMatchObject({ status: 503 });
    expect(breaker.estado).toBe('abierto');
  });
});
