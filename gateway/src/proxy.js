/**
 * Proxy inverso (http-proxy-middleware) hacia el microservicio resuelto en req.servicioDestino.
 * Antes de reenviar agrega la identidad validada y el token interno:
 *   X-Usuario-Id, X-Usuario-Rol, X-Request-Id, X-Gateway-Token
 * y quita Authorization (los servicios no necesitan ver el JWT).
 * Si el servicio no responde (caído, sin DNS, timeout) responde 503 en español.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

const TIMEOUT_PROXY_MS = 10000;

function crearProxy({ gatewayToken, logger }) {
  if (!gatewayToken) throw new Error('GATEWAY_TOKEN no está definido');

  return createProxyMiddleware({
    target: 'http://destino.invalido', // obligatorio; "router" lo reemplaza en cada petición
    router: (req) => req.servicioDestino.url,
    changeOrigin: true,
    timeout: TIMEOUT_PROXY_MS,
    proxyTimeout: TIMEOUT_PROXY_MS,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.removeHeader('authorization');
        proxyReq.setHeader('X-Gateway-Token', gatewayToken);
        proxyReq.setHeader('X-Request-Id', req.id);
        if (req.usuario) {
          proxyReq.setHeader('X-Usuario-Id', req.usuario.id);
          proxyReq.setHeader('X-Usuario-Rol', req.usuario.rol);
        }
      },
      error: (err, req, res) => {
        logger.warn(
          { requestId: req.id, destino: req.servicioDestino?.nombre, motivo: err.code || err.message },
          'Servicio destino no disponible',
        );
        if (res.headersSent || typeof res.writeHead !== 'function') return;
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          error: {
            codigo: 'SERVICIO_NO_DISPONIBLE',
            mensaje: 'El servicio no está disponible en este momento, intenta más tarde',
          },
        }));
      },
    },
  });
}

module.exports = { crearProxy };
