# @urbansync/comun

Librería compartida por el gateway y los cinco servicios (dependencia local `file:../comun`).

| Módulo | Qué ofrece |
|---|---|
| `errores.js` | `AppError`, formato estándar `{error:{codigo,mensaje}}`, traducción de errores zod al español |
| `logger.js` | pino con `fecha`, `servicio`, `nivel`, `requestId`, `mensaje`; oculta contraseñas y tokens |
| `db.js` | pool pg con `search_path` por esquema, reintento de conexión, `enTransaccion` |
| `auth.js` | `verificarGateway` (X-Gateway-Token), `extraerUsuario`, `requiereRol` |
| `breaker.js` | circuit breaker propio (cerrado / abierto / semiabierto) |
| `httpResiliente.js` | axios + timeout + reintentos con backoff y jitter (solo 5xx/red) + breaker |
| `mensajeria.js` | RabbitMQ: topología, publicación confirmada, consumo con reintentos y DLQ, reconexión |
| `outbox.js` | `agregarAOutbox` y publicador periódico (`FOR UPDATE SKIP LOCKED`) |
| `salud.js` | `GET /health` con estado de BD y broker |
| `app.js` | app Express base (log, JSON, health, token interno, identidad) |
| `paginacion.js` | `?pagina&limite` (máx. 50) |

Pruebas: `test/` (breaker, cliente HTTP, app base) — `bash pruebas/tests_unitarios.sh`.
