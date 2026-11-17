# Servicio de Asignación

Asigna incidentes confirmados a entes de gestión (verifica de forma síncrona el estado en Clasificación y el rol en Usuario), garantiza una sola asignación activa por incidente (índice único parcial), gestiona la máquina de estados recibido → en_atención → resuelto con control de versión y la reasignación.

| | |
|---|---|
| Puerto | 3004 (interno) |
| Esquema de BD | `asignaciones` |
| Usa RabbitMQ | sí (publica) |
| Requisitos | RF-ASG-01..06 |
| Rutas | `/api/asignaciones/*` |
| Eventos | Publica `asignacion.creada`, `asignacion.estado_actualizado`, `asignacion.reasignada` (outbox). |
| Archivos clave | `servicios/asignaciones.js` (TRANSICIONES, PC-02), `clientes/internos.js` |
| Variables propias | `URL_SERVICIO_CLASIFICACION`, `URL_SERVICIO_USUARIO` |

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
