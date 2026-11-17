# API Gateway

Único punto de entrada (puerto **8080**, el único publicado). Para cada petición:

1. `helmet`, log JSON con `X-Request-Id`, CORS abierto solo en desarrollo.
2. Rate limit: 100 peticiones/min por IP; 10/min en `/api/usuarios/login` (`RATE_LIMIT_GENERAL`, `RATE_LIMIT_LOGIN`).
3. Elimina `X-Usuario-Id`, `X-Usuario-Rol` y `X-Gateway-Token` que envíe el cliente (anti suplantación).
4. Rechaza cuerpos > 100 kb (413).
5. Resuelve el servicio por prefijo (`src/config/rutas.js`) o responde 404 (las rutas `/internal/*` no existen aquí).
6. Valida el JWT HS256 (401) y el rol para el método + ruta (403).
7. Reenvía con `http-proxy-middleware` agregando la identidad y `X-Gateway-Token`; quita `Authorization`.
8. Si el servicio no responde: **503** `El servicio no está disponible en este momento, intenta más tarde`.

`GET /health` consulta en paralelo el `/health` de los cinco servicios.

| Archivo | Contenido |
|---|---|
| `src/config/rutas.js` | Tabla de servicios, rutas públicas y reglas de roles |
| `src/middlewares/seguridad.js` | Limpieza de encabezados, JWT, roles, límite de cuerpo, CORS |
| `src/middlewares/limites.js` | express-rate-limit |
| `src/proxy.js` | Proxy y respuesta 503 |
| `src/app.js` | Orden de la cadena de middlewares |
| `test/gateway.test.js` | 12 pruebas con un microservicio falso |

Variables: `JWT_SECRET`, `GATEWAY_TOKEN`, `URL_SERVICIO_*`, `RATE_LIMIT_*`, `CORS_DESARROLLO`.
