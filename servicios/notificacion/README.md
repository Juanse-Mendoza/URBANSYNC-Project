# Servicio de Notificación

Consume los eventos del sistema y genera notificaciones para ciudadanos, supervisores (prioridad alta) y entes; expone el historial, el conteo de no leídas (polling de la app) y marcar como leídas. El consumidor es idempotente y los fallos se reintentan y terminan en la DLQ.

| | |
|---|---|
| Puerto | 3005 (interno) |
| Esquema de BD | `notificaciones` |
| Usa RabbitMQ | sí (consume) |
| Requisitos | RF-NOT-01..04 |
| Rutas | `/api/notificaciones/*` |
| Eventos | Consume `incidente.creado`, `incidente.confirmado`, `asignacion.*` (cola `notificacion.eventos`). |
| Archivos clave | `eventos/procesador.js` (plantillas + idempotencia) |
| Variables propias | `URL_SERVICIO_USUARIO` |

## Estructura

```
src/index.js         # arranque: BD, RabbitMQ, rutas, tareas
src/rutas/           # endpoints y roles permitidos
src/controladores/   # validación (zod) y respuesta HTTP
src/servicios/       # reglas de negocio
src/repositorios/    # SQL parametrizado (search_path = esquema del servicio)
src/esquemas/        # esquemas zod
test/                # jest + supertest
```

## Ejecutar y probar

Se ejecuta con Docker Compose desde la raíz del repo (`docker compose up -d --build`); el puerto no se
publica: se accede por el gateway (`http://localhost:8080`). Tests: `bash pruebas/tests_unitarios.sh`
(o `npm install && npm test` en esta carpeta con Node 20).

Variables: `PORT`, `DB_SCHEMA`, `DATABASE_URL`, `GATEWAY_TOKEN`, `LOG_LEVEL` (ver `.env.example`).
