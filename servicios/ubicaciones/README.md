# Servicio de Ubicaciones

Guarda el punto geográfico de cada incidente (PostGIS `geography`), cuenta los reportes similares (misma categoría, ≤ `RADIO_SIMILARES_M` metros, 30 días) con `ST_DWithin`, sirve los puntos del mapa (máx. 200) y los reportes cercanos con su distancia.

| | |
|---|---|
| Puerto | 3003 (interno) |
| Esquema de BD | `ubicaciones` |
| Usa RabbitMQ | no |
| Requisitos | RF-UBI-01..06 |
| Rutas | `/api/ubicaciones/mapa`, `/api/ubicaciones/:id/similares`, `/api/ubicaciones/:id/radio`, `/internal/ubicaciones` |
| Eventos | — |
| Archivos clave | `repositorios/ubicaciones.js` (consultas PostGIS) |
| Variables propias | `RADIO_SIMILARES_M` |

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
