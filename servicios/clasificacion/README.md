# Servicio de Clasificación

Crea incidentes con `Idempotency-Key`, calcula la prioridad (base de la categoría + reportes similares que devuelve Ubicaciones), aplica prioridad de respaldo si Ubicaciones falla y la recalcula cada 60 s, lista y confirma/reclasifica con control de versión, y mantiene el estado del incidente a partir de los eventos de Asignación.

| | |
|---|---|
| Puerto | 3002 (interno) |
| Esquema de BD | `incidentes` |
| Usa RabbitMQ | sí (publica y consume) |
| Requisitos | RF-CLA-01..07, RF-UBI-01/02 |
| Rutas | `/api/categorias`, `/api/incidentes/*`, `/internal/incidentes/:id` |
| Eventos | Publica `incidente.creado`, `incidente.confirmado` (outbox). Consume `asignacion.creada`, `asignacion.estado_actualizado`, `asignacion.reasignada`. |
| Archivos clave | `servicios/prioridad.js` (regla pura), `servicios/incidentes.js` (crear con plan B), `servicios/recalculo.js`, `eventos/consumidorAsignaciones.js`, `clientes/ubicaciones.js` (breaker) |
| Variables propias | `URL_SERVICIO_UBICACIONES`, `HTTP_TIMEOUT_MS`, `CB_FALLOS_UMBRAL`, `CB_ESPERA_MS`, `RECALCULO_INTERVALO_MS` |

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
