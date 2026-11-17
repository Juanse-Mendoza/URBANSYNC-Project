# CLAUDE.md — URBANSYNC (MVP local)

Este archivo guía a Claude Code para construir el MVP de URBANSYNC. Léelo completo antes de cada fase.

## 1. Contexto

- Proyecto final de Sistemas Distribuidos (Universidad Manuela Beltrán, docente Juan José Osorio Tabares).
- Equipo: Carlos Felipe Avilán Payares, Juan Sebastián Mendoza Moncada, Miguel Ángel Pinilla Báez.
- URBANSYNC es una plataforma distribuida para reportar, clasificar, asignar y hacer seguimiento a incidentes comunitarios (infraestructura, seguridad, desastre natural) en un barrio.
- Fuente de verdad del diseño: el documento teórico `URBANSYNC_Documento_Teorico_APA.docx` (requisitos RF-USU, RF-CLA, RF-UBI, RF-ASG, RF-NOT y RNF). Este archivo resume lo necesario y define las simplificaciones del MVP.
- Meta: MVP funcional de punta a punta, ejecutado localmente con Docker Compose, más una app Flutter (Android) que muestra alertas como notificaciones del sistema.
- Plazo: martes 17 de noviembre de 2026. Ante la duda, elegir lo más simple que cumpla el requisito.

## 2. Reglas de trabajo para Claude Code

1. Responder en español. Identificadores, rutas, tablas y columnas en español sin tildes ni ñ (incidente, asignacion, ubicacion).
2. Trabajar por fases (sección 12). No pasar a la siguiente fase sin cumplir sus criterios de aceptación y mostrar la evidencia (salida de `docker compose ps`, `curl`, tests).
3. Al terminar cada fase: levantar con `docker compose up -d --build`, verificar, y hacer commit `fase N: <resumen>`.
4. Usar solo las dependencias de la sección 3. Si hace falta otra, justificarla antes de instalarla.
5. Secretos solo en `.env` (en `.gitignore`). Mantener `.env.example` actualizado.
6. Cada desviación respecto al documento teórico se registra en `docs/DECISIONES.md` (qué, por qué, impacto en el documento).
7. Respuestas de error siempre con el formato `{"error": {"codigo": "TEXTO_CORTO", "mensaje": "Mensaje claro en español"}}`, sin trazas internas (RNF-USA-02).
8. Consultas SQL siempre parametrizadas. Validación de entradas con zod en cada servicio.
9. Logs en JSON con pino: fecha, servicio, nivel, requestId, mensaje. Nunca registrar contraseñas ni tokens.
10. Código simple y comentado en los puntos clave (regla de prioridad, breaker, outbox, consumidor), porque se mostrará en la sustentación.

## 3. Stack

Backend (cada servicio y gateway):
- Node.js 20 LTS, Express 4
- pg, amqplib, jsonwebtoken, bcryptjs, zod, axios, pino, pino-http, helmet, express-rate-limit, http-proxy-middleware (solo gateway)
- Tests: jest, supertest
- Imagen base: `node:20-alpine` (instalar `wget` ya viene en alpine para healthchecks)

Infraestructura:
- PostgreSQL 16 + PostGIS: `postgis/postgis:16-3.4`
- RabbitMQ: `rabbitmq:3-management`
- Pruebas de carga: `grafana/k6` vía `docker run`
- Pruebas de API: colección Postman ejecutada con `npx newman`

Móvil (Flutter 3, solo Android en el MVP):
- http, provider, flutter_secure_storage, geolocator, flutter_map, latlong2, flutter_local_notifications, uuid, intl

## 4. Estructura del repositorio

```
urbansync/
├── CLAUDE.md
├── README.md                 # manual de instalación y ejecución (entregable 6)
├── docker-compose.yml
├── .env.example
├── comun/                    # librería compartida (paquete local "@urbansync/comun")
│   ├── package.json
│   ├── errores.js            # AppError, middleware de errores, formato estándar
│   ├── logger.js             # pino
│   ├── db.js                 # pool pg con reintento de conexión al inicio y search_path
│   ├── auth.js               # lee X-Usuario-Id / X-Usuario-Rol, verifica X-Gateway-Token, requiereRol()
│   ├── httpResiliente.js     # axios + timeout + reintentos con backoff + breaker
│   ├── breaker.js            # circuit breaker propio (fallos consecutivos)
│   ├── mensajeria.js         # conexión AMQP con reconexión, publicar, consumir con reintentos y DLQ
│   ├── outbox.js             # publicador periódico de la tabla outbox
│   └── salud.js              # GET /health
├── gateway/                  # :8080
├── servicios/
│   ├── usuario/              # :3001
│   ├── clasificacion/        # :3002
│   ├── ubicaciones/          # :3003
│   ├── asignacion/           # :3004
│   └── notificacion/         # :3005
├── db/init/                  # 00_extensiones.sql, 01_usuarios.sql, ... (se montan en /docker-entrypoint-initdb.d)
├── app_movil/                # Flutter
├── pruebas/
│   ├── postman/urbansync.postman_collection.json
│   ├── k6/carga_incidentes.js
│   ├── fallos/               # scripts PT-01..PT-04
│   └── e2e.sh                # flujo completo con curl
├── evidencias/               # salidas de pruebas, capturas (para el documento)
└── docs/
    ├── DECISIONES.md
    ├── API.md
    ├── arquitectura.md       # diagrama en Mermaid
    └── RESULTADOS.md         # tablas 17–21 con "Resultado obtenido"
```

Docker: el contexto de build de cada servicio es la raíz del repo (para poder copiar `comun/`). Ejemplo: `build: { context: ., dockerfile: servicios/clasificacion/Dockerfile }`. Cada servicio depende de `comun` con `"@urbansync/comun": "file:../../comun"` (gateway: `file:../comun`).

Estructura interna de cada servicio: `src/index.js`, `src/rutas/`, `src/controladores/`, `src/servicios/` (reglas de negocio), `src/repositorios/` (SQL), `src/esquemas/` (zod), `src/eventos/` (consumidores), `test/`.

## 5. Puertos y variables

| Componente | Puerto | Publicado en el host |
|---|---|---|
| gateway | 8080 | Sí (`8080:8080`) |
| usuario | 3001 | No |
| clasificacion | 3002 | No |
| ubicaciones | 3003 | No |
| asignacion | 3004 | No |
| notificacion | 3005 | No |
| db (PostGIS) | 5432 | Sí, solo desarrollo |
| rabbitmq | 5672 / 15672 | 15672 sí (consola), 5672 no |

`.env.example`:
```
POSTGRES_USER=urbansync
POSTGRES_PASSWORD=cambiar
POSTGRES_DB=urbansync
DATABASE_URL=postgres://urbansync:cambiar@db:5432/urbansync
RABBITMQ_DEFAULT_USER=urbansync
RABBITMQ_DEFAULT_PASS=cambiar
RABBITMQ_URL=amqp://urbansync:cambiar@rabbitmq:5672
JWT_SECRET=cambiar_por_un_secreto_largo
JWT_EXPIRES_IN=45m
GATEWAY_TOKEN=cambiar_token_interno
URL_SERVICIO_USUARIO=http://usuario:3001
URL_SERVICIO_CLASIFICACION=http://clasificacion:3002
URL_SERVICIO_UBICACIONES=http://ubicaciones:3003
URL_SERVICIO_ASIGNACION=http://asignacion:3004
URL_SERVICIO_NOTIFICACION=http://notificacion:3005
HTTP_TIMEOUT_MS=2000
CB_FALLOS_UMBRAL=5
CB_ESPERA_MS=30000
RADIO_SIMILARES_M=50
SEED=true
```
Cada servicio define en `environment` su `PORT` y `DB_SCHEMA`.

Docker Compose:
- `restart: unless-stopped` en todos los servicios.
- `healthcheck` con `wget -qO- http://localhost:<puerto>/health` cada 15 s; db con `pg_isready`; rabbitmq con `rabbitmq-diagnostics -q ping`.
- `depends_on` con `condition: service_healthy` hacia db y rabbitmq.
- Volúmenes `pgdata` y `rabbitdata` para que los mensajes durables sobrevivan reinicios.

## 6. Decisiones del MVP (simplificaciones frente al documento teórico)

Registrar todas en `docs/DECISIONES.md`:

1. Base de datos: una instancia PostgreSQL con un esquema por servicio (`usuarios`, `incidentes`, `ubicaciones`, `asignaciones`, `notificaciones`) y un solo usuario de BD. Cada servicio fija `search_path` a su esquema y nunca consulta otro. Las referencias entre servicios son UUID sin llave foránea.
2. TLS: en local la app se conecta por HTTP dentro de la red local. HTTPS queda para el despliegue en nube (Cloud Run lo provee). Opcional si sobra tiempo: perfil `tls` con Caddy y `tls internal` delante del gateway, para demostrarlo con Postman.
3. Fotografías (RF-CLA-01, RF-ASG-04): fuera del MVP. Se deja la columna `foto_url` nula.
4. Recuperación de contraseña (RF-USU-03): simulada. El token de un solo uso (15 min) se imprime en el log del servicio de Usuario en lugar de enviarse por correo.
5. Notificaciones: la app consulta el conteo de no leídas cada 30 s y, si hay nuevas, muestra una notificación local del sistema con flutter_local_notifications. Funciona con la app abierta o en segundo plano reciente; sin FCM.
6. iOS: no se compila (requiere macOS). Se entrega APK de Android.
7. Cuentas de supervisor y ente de gestión: creadas por seed al iniciar el servicio de Usuario (`SEED=true`). Endpoint `POST /api/usuarios` solo para rol admin.
8. Clasificación consume también `asignacion.creada` para pasar el incidente a estado `asignado`.
9. Vinculación manual de reportes (RF-UBI-05): opcional, solo si sobra tiempo. Reasignación (RF-ASG-06): sí se implementa.
10. Protección de servicios internos: además de no publicar sus puertos, cada servicio exige el encabezado `X-Gateway-Token` (= `GATEWAY_TOKEN`), que el gateway agrega y que también usan las llamadas internas entre servicios. El gateway elimina cualquier `X-Usuario-*` o `X-Gateway-Token` que venga del cliente.
11. Circuit breaker propio (`comun/breaker.js`) por fallos consecutivos en lugar de una librería, para que coincida con la Tabla 15 y sea fácil de explicar.

## 7. Modelo de datos (db/init)

`00_extensiones.sql`: `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto;` y creación de los cinco esquemas.

usuarios.usuario
- id uuid pk default gen_random_uuid(), nombre varchar(100), correo varchar(150) unique (guardado en minúsculas), hash_contrasena text, telefono varchar(20), barrio varchar(100) null, rol (enum `ciudadano|supervisor|ente_gestion|admin`), categoria_atencion varchar(30) null (para entes), token_recuperacion text null, token_expira timestamptz null, intentos_fallidos int default 0, bloqueado_hasta timestamptz null, creado_en timestamptz default now()

incidentes.categoria (codigo pk, nombre, prioridad_base) — seed: `infraestructura` (baja), `seguridad` (media), `desastre_natural` (alta)
incidentes.subcategoria (codigo pk, categoria fk, nombre) — seed: infraestructura: fuga_agua, hueco_via, alumbrado; seguridad: robo, zona_oscura, vandalismo; desastre_natural: inundacion, deslizamiento, arbol_caido

incidentes.incidente
- id uuid pk, ciudadano_id uuid, titulo varchar(120), descripcion varchar(1000) null, categoria fk, subcategoria fk null, foto_url text null
- prioridad (enum `baja|media|alta`), prioridad_origen (enum `automatica|respaldo|supervisor`), recalcular_prioridad bool default false
- estado (enum `pendiente|confirmado|asignado|en_atencion|resuelto`)
- lat double precision, lng double precision, radio_m int default 50 (copia local para poder reintentar el registro en Ubicaciones)
- idempotency_key varchar(64), unique (ciudadano_id, idempotency_key)
- version int default 1, creado_en, actualizado_en
incidentes.historial_estado (id, incidente_id, estado_anterior null, estado_nuevo, actor_id null, comentario null, creado_en)
incidentes.outbox (id uuid pk, tipo varchar, payload jsonb, creado_en, publicado_en null, intentos int default 0)
incidentes.eventos_procesados (evento_id uuid pk, procesado_en)

ubicaciones.ubicacion
- incidente_id uuid pk, categoria varchar(30), punto geography(Point,4326), radio_m int, creado_en
- índice GIST sobre punto; índice (categoria, creado_en)

asignaciones.asignacion
- id uuid pk, incidente_id uuid, ciudadano_id uuid, ente_id uuid, supervisor_id uuid
- estado (enum `recibido|en_atencion|resuelto|reasignado`), activa bool default true
- solucion varchar(1000) null, version int default 1, creado_en, actualizado_en
- índice único parcial `(incidente_id) WHERE activa` (garantiza PC-02 → 409)
asignaciones.seguimiento (id, asignacion_id, estado, comentario, actor_id, creado_en)
asignaciones.outbox (igual a incidentes.outbox)

notificaciones.notificacion (id, usuario_id, tipo, titulo, mensaje, incidente_id null, leida bool default false, creado_en) — índice (usuario_id, leida, creado_en desc)
notificaciones.eventos_procesados (evento_id pk, procesado_en)

## 8. API (todo a través del gateway, `http://<host>:8080`)

Todas las rutas protegidas reciben `Authorization: Bearer <jwt>`. Listados con `?pagina=1&limite=20` (máximo 50). Rutas `/internal/*` no se exponen en el gateway.

Usuario (`/api/usuarios`)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | /api/usuarios/registro | público | Registro de ciudadano (RF-USU-01). 201 |
| POST | /api/usuarios/login | público | Devuelve `{token, usuario:{id,nombre,rol}}` (RF-USU-02). Bloqueo 5 min tras 5 intentos fallidos |
| POST | /api/usuarios/recuperar | público | Genera token y lo imprime en el log (simulado) |
| POST | /api/usuarios/restablecer | público | `{token, nuevaContrasena}` |
| GET | /api/usuarios/me | todos | Perfil propio |
| PUT | /api/usuarios/me | ciudadano | Edita nombre, telefono, barrio (lista blanca; el rol no se puede cambiar) |
| GET | /api/usuarios/entes?categoria= | supervisor | Lista de entes de gestión |
| POST | /api/usuarios | admin | Crea supervisor o ente (RF-USU-06) |
| GET | /internal/usuarios/:id | interno | Datos básicos y rol |
| GET | /internal/usuarios?rol=supervisor | interno | Para notificar supervisores |

Clasificación (`/api/incidentes`, `/api/categorias`)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | /api/categorias | todos | Categorías con subcategorías (RF-CLA-02) |
| POST | /api/incidentes | ciudadano | Encabezado `Idempotency-Key` obligatorio. Body: titulo, descripcion?, categoria, subcategoria?, lat, lng, radio_m? (25–200). 201 (RF-CLA-01, 03, 06, RF-UBI-01, 02) |
| GET | /api/incidentes/mios | ciudadano | Mis reportes (RF-CLA-07) |
| GET | /api/incidentes | supervisor | Filtros categoria, prioridad, estado (RF-CLA-04) |
| GET | /api/incidentes/:id | dueño, supervisor, ente asignado | Detalle + historial. Ciudadano ajeno → 403 (OWASP API1) |
| PATCH | /api/incidentes/:id/clasificacion | supervisor | Body: categoria?, prioridad?, confirmar: true, version. Versión distinta → 409 (RF-CLA-05) |
| GET | /internal/incidentes/:id | interno | Usado por Asignación |

Ubicaciones (`/api/ubicaciones`)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | /internal/ubicaciones | interno | Registra punto y devuelve `{similares}` (RF-UBI-04) |
| GET | /api/ubicaciones/mapa?lat&lng&radio_m=500&categoria&desde&hasta | todos | Puntos para el mapa, máximo 200 (RF-UBI-03, 06) |
| GET | /api/ubicaciones/:incidenteId/similares | supervisor | Reportes cercanos de la misma categoría |
| PATCH | /api/ubicaciones/:incidenteId/radio | supervisor | Ajusta radio (RF-UBI-02) |

Asignación (`/api/asignaciones`)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | /api/asignaciones | supervisor | `{incidenteId, enteId}`. Verifica incidente confirmado (Clasificación) y rol del ente (Usuario). Ya existe activa → 409 (RF-ASG-01) |
| GET | /api/asignaciones/mias | ente_gestion | Mis asignaciones activas (RF-ASG-02) |
| PATCH | /api/asignaciones/:id/estado | ente (dueño) | `{estado: en_atencion|resuelto, comentario, solucion?, version}` (RF-ASG-03, 04) |
| PATCH | /api/asignaciones/:id/reasignar | supervisor | `{enteId}`: desactiva la actual (estado reasignado) y crea otra (RF-ASG-06) |
| GET | /api/asignaciones/incidente/:incidenteId | supervisor | Historial de asignaciones y seguimiento (RF-ASG-05) |

Notificación (`/api/notificaciones`)
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | /api/notificaciones | todos | Historial propio paginado (RF-NOT-04) |
| GET | /api/notificaciones/no-leidas/conteo | todos | `{conteo}` (para el polling) |
| PATCH | /api/notificaciones/:id/leida | dueño | Marca como leída |
| PATCH | /api/notificaciones/leer-todas | todos | Marca todas |

Gateway:
- Tabla de rutas por prefijo → servicio, con lista de rutas públicas y roles permitidos por prefijo/método.
- Valida JWT (401) y rol (403) antes de reenviar. Agrega `X-Usuario-Id`, `X-Usuario-Rol`, `X-Request-Id`, `X-Gateway-Token`.
- `express-rate-limit`: 100 peticiones/min por IP; 10/min en `/login`.
- helmet, límite de body 100 kb, CORS abierto solo en desarrollo.
- Si el servicio destino no responde: 503 con mensaje en español ("El servicio no está disponible en este momento, intenta más tarde").
- `GET /health` agrega el estado de los cinco servicios.

## 9. Eventos (RabbitMQ)

- Exchange `urbansync.eventos` (topic, durable). Exchange de fallidos `urbansync.dlx` (fanout) y cola `urbansync.dlq`.
- Colas durables con `x-dead-letter-exchange: urbansync.dlx`:
  - `notificacion.eventos` ← `incidente.creado`, `asignacion.*`
  - `clasificacion.eventos` ← `asignacion.creada`, `asignacion.estado_actualizado`
- Mensajes persistentes (`persistent: true`), `prefetch(10)`, ack manual.
- Sobre: `{ eventoId, tipo, emitidoEn, incidenteId, datos }`.

| Evento | Publica | datos | Consumidor y efecto |
|---|---|---|---|
| incidente.creado | Clasificación | ciudadanoId, titulo, categoria, prioridad | Notificación: si prioridad alta, notifica a todos los supervisores (RF-NOT-02) |
| asignacion.creada | Asignación | asignacionId, enteId, ciudadanoId, titulo | Notificación: avisa al ente (RF-NOT-03). Clasificación: estado → asignado + historial |
| asignacion.estado_actualizado | Asignación | asignacionId, estado, comentario, ciudadanoId, actorId | Clasificación: estado → en_atencion/resuelto + historial. Notificación: avisa al ciudadano (RF-NOT-01) |
| asignacion.reasignada | Asignación | asignacionAnterior, nuevaAsignacionId, enteAnterior, enteNuevo | Notificación: avisa al nuevo ente |

Además, cuando el supervisor confirma un incidente, Clasificación notifica al ciudadano con el mismo mecanismo: publicar `incidente.confirmado` (consumido por Notificación).

Reglas de consumo:
- Idempotencia: insertar `eventoId` en `eventos_procesados` dentro de la misma transacción del efecto; si ya existe, ack sin hacer nada.
- Reintentos: si el procesamiento falla, republicar con encabezado `x-reintentos` +1 (esperas 200/400/800 ms); al cuarto fallo, `nack(requeue=false)` → DLQ y log de error.

Outbox (Clasificación y Asignación):
- El cambio de negocio y la fila en `outbox` se guardan en la misma transacción.
- `comun/outbox.js` corre cada 2 s: toma hasta 50 filas sin publicar (`FOR UPDATE SKIP LOCKED`), publica con confirmación del broker (`createConfirmChannel`) y marca `publicado_en`. Si el broker está caído, deja las filas y reintenta en el siguiente ciclo.

## 10. Regla de prioridad (Clasificación)

1. Prioridad base según categoría: infraestructura → baja, seguridad → media, desastre_natural → alta.
2. Clasificación llama a `POST /internal/ubicaciones` con timeout de 2 s y sin reintentos (para cumplir ≤ 3 s, RNF-REN-01). Ubicaciones cuenta los reportes de la misma categoría a ≤ `RADIO_SIMILARES_M` metros en los últimos 30 días, incluido el nuevo (`ST_DWithin`).
3. similares 1 → base; 2 a 4 → sube un nivel (baja→media, media→alta); ≥ 5 → alta.
4. Si Ubicaciones falla o el breaker está abierto: prioridad base, `prioridad_origen = respaldo`, `recalcular_prioridad = true`. El incidente se guarda igual (201).
5. Tarea cada 60 s: para incidentes con `recalcular_prioridad = true`, reintenta el registro en Ubicaciones (con reintentos y backoff) y actualiza la prioridad sin bajarla si el supervisor ya la fijó.
6. Implementar la regla como función pura `calcularPrioridad(categoriaBase, similares)` con tests unitarios.

Transacción de creación: incidente (pendiente) + historial inicial + outbox `incidente.creado`. Si llega la misma `Idempotency-Key` del mismo ciudadano, devolver 200 con el incidente original (PC-03).

## 11. Resiliencia y seguridad (resumen de implementación)

- `breaker.js`: estados cerrado/abierto/semiabierto; abre tras `CB_FALLOS_UMBRAL` fallos consecutivos, pasa a semiabierto tras `CB_ESPERA_MS`; un éxito en semiabierto lo cierra. Log en cada cambio de estado (evidencia para la sustentación).
- `httpResiliente.js`: timeout `HTTP_TIMEOUT_MS`; reintentos opcionales (3, backoff 200/400/800 ms + jitter) solo ante errores de red o 5xx, nunca 4xx; envuelto en el breaker; error → `AppError(503, 'SERVICIO_NO_DISPONIBLE', ...)`.
- `db.js` y `mensajeria.js`: reintento de conexión al iniciar (hasta 10 intentos con backoff) y reconexión de AMQP al cerrarse la conexión.
- `/health` en cada servicio: `{estado, servicio, db, broker}`; 503 si la BD no responde.
- Contraseñas con bcryptjs (costo 10). JWT HS256 con `sub`, `rol`, `nombre`, expiración `JWT_EXPIRES_IN`.
- Autorización doble: rol en el gateway y propiedad del recurso en cada servicio.
- Concurrencia: control optimista con `version` (UPDATE ... WHERE id = $1 AND version = $2; 0 filas → 409) e índice único parcial en asignaciones.

Seed (servicio de Usuario, si `SEED=true` y la tabla está vacía; contraseña de demo `Urbansync2026*`):
- admin@urbansync.co (admin), supervisor@urbansync.co (supervisor)
- ente.infra@urbansync.co (ente_gestion, infraestructura), ente.seguridad@urbansync.co (seguridad), ente.emergencias@urbansync.co (desastre_natural)
- ciudadano@urbansync.co (ciudadano)

`scripts/seed_incidentes.sh` (opcional): crea unos 15 incidentes de ejemplo vía API alrededor de Bogotá (4.6097, -74.0817) para que el mapa no esté vacío.

## 12. Fases

Fase 1 — Infraestructura y librería común
- docker-compose.yml, .env.example, db/init, `comun/` completa, esqueleto de los cinco servicios y del gateway con `/health`.
- Aceptación: `docker compose up -d --build` → todos `healthy` en `docker compose ps`; `curl localhost:8080/health` responde con los cinco servicios; consola RabbitMQ en `localhost:15672`.

Fase 2 — Usuario y Gateway
- Registro, login, me, entes, admin, recuperación simulada, seed. Gateway con JWT, roles, rate limit y proxy.
- Aceptación: PF-01, PF-02; sin token → 401; ciudadano en `GET /api/incidentes` → 403 (PI-04); llamada directa a un servicio sin `X-Gateway-Token` → 401.

Fase 3 — Ubicaciones y Clasificación
- Categorías, creación con prioridad y respaldo, idempotencia, listados, detalle con historial, confirmación con versión, mapa, outbox, tarea de recálculo.
- Aceptación: PF-03, PF-04 (cinco reportes de infraestructura a menos de 50 m → el quinto es alta), PC-03; con `docker compose stop ubicaciones` se crea un incidente en ≤ 3 s con prioridad de respaldo y, tras `start`, se recalcula en ≤ 60 s (PT-02); el evento `incidente.creado` aparece en RabbitMQ.

Fase 4 — Asignación, Notificación y eventos
- Asignar, reasignar, actualizar estado, historial; consumidores en Clasificación y Notificación; DLQ.
- Aceptación: PF-05, PF-06, PI-02, PI-03, PC-02 (dos asignaciones simultáneas → una 201 y otra 409); PT-01 (detener notificacion, crear reportes y asignaciones, iniciar y ver las notificaciones generadas); PT-03 (detener rabbitmq, asignar, iniciar y ver el evento publicado desde el outbox).

Fase 5 — Pruebas automatizadas del backend
- Jest + Supertest: regla de prioridad, breaker, auth del gateway, validaciones (mínimo 3–5 tests por servicio).
- `pruebas/e2e.sh`: flujo completo ciudadano → supervisor → ente con curl, imprimiendo cada paso.
- Colección Postman con variables `baseUrl` y tokens; `npx newman run ... -r cli,htmlextra` o `-r cli,json` y guardar salida en `evidencias/`.
- Aceptación: `npm test` pasa en cada servicio; e2e y newman sin fallos.

Fase 6 — App Flutter (ver sección 13)
- Aceptación: en emulador Android se completa el flujo de los tres roles y aparece la notificación del sistema al ciudadano cuando el ente cambia el estado, y al ente cuando se le asigna un incidente.

Fase 7 — Pruebas de carga y fallos, evidencias
- `pruebas/k6/carga_incidentes.js`: 50 VUs durante 2 min creando incidentes (cada VU con su ciudadano y su Idempotency-Key), umbrales `http_req_failed < 1%` y `p(95) < 3000` (PC-01, PR-01). Otro escenario para `GET /api/ubicaciones/mapa` con 200 incidentes (PR-02).
- Ejecutar con `docker run --rm -i --network host grafana/k6 run - < pruebas/k6/carga_incidentes.js` (en Windows/Mac usar `BASE_URL=http://host.docker.internal:8080`).
- `pruebas/fallos/pt01.sh` … `pt04.sh` (PT-04: `docker kill` de un servicio y verificar reinicio automático).
- Guardar todo en `evidencias/` y llenar `docs/RESULTADOS.md` con las tablas 17 a 21 (columna "Resultado obtenido") y la comparación con la Tabla 7.

Fase 8 — Documentación del repositorio
- README raíz (requisitos, puertos, variables, pasos de ejecución, credenciales demo, cómo correr la app y las pruebas), README por servicio, `docs/API.md`, `docs/arquitectura.md` (diagrama Mermaid con flechas síncronas y asíncronas), `docs/DECISIONES.md`.

## 13. App Flutter (app_movil/)

Estructura:
```
lib/
├── main.dart
├── config.dart                 # const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080')
├── api/cliente_api.dart        # http con timeout 10 s, JWT, mapeo de errores a mensajes en español, 401 → cerrar sesión
├── modelos/                    # usuario, incidente, asignacion, notificacion, categoria
├── estado/sesion.dart          # provider: token en flutter_secure_storage, rol
├── servicios/alertas.dart      # polling 30 s + flutter_local_notifications
└── pantallas/
    ├── login.dart, registro.dart
    ├── ciudadano/ (mis_reportes, nuevo_reporte, detalle_reporte)
    ├── supervisor/ (bandeja con filtros, detalle con confirmar/ajustar prioridad/asignar/reasignar)
    ├── ente/ (mis_asignaciones, actualizar_estado)
    ├── comun/ (mapa, notificaciones, perfil)
```

Requisitos de la app:
- Navegación inferior según rol, con el mismo orden de pestañas (RNF-USA-03).
- Nuevo reporte en ≤ 5 pasos (RNF-USA-01): título, categoría/subcategoría (desde `/api/categorias`), descripción opcional, radio (slider 25–200 m), ubicación GPS automática con geolocator; si no hay permiso o GPS (emulador), permitir tocar el mapa para elegir el punto. Generar la `Idempotency-Key` (uuid) al abrir el formulario y reutilizarla en reintentos.
- Mapa con flutter_map y teselas de OpenStreetMap (`userAgentPackageName: 'co.edu.umb.urbansync'`), marcadores de color por categoría; al tocar, ver detalle.
- Alertas: `alertas.dart` consulta `/api/notificaciones/no-leidas/conteo` cada 30 s; si aumenta, trae las últimas no leídas y muestra una notificación local por cada una no mostrada antes (guardar ids mostrados). Tocar la notificación abre la pantalla de notificaciones. Badge con el conteo en la pestaña.
- Errores de red: SnackBar en español con botón "Reintentar"; nunca cerrar la app (RNF-DIS-02).
- Diseño usable desde 360 × 640 (RNF-USA-04). Material 3, color principal sobrio.

Android:
- `AndroidManifest.xml`: permisos INTERNET, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, POST_NOTIFICATIONS; `android:usesCleartextTraffic="true"` (solo MVP local, documentarlo en DECISIONES.md).
- minSdk 26 (RNF-POR-02). Aplicar la configuración Android que pide flutter_local_notifications (core library desugaring) según su README.
- Ejecutar en emulador: `flutter run` (usa 10.0.2.2). En teléfono físico en la misma red Wi-Fi: `flutter run --dart-define=API_URL=http://<IP_DEL_PC>:8080` y permitir el puerto 8080 en el firewall.
- APK: `flutter build apk --release --dart-define=API_URL=http://<IP_DEL_PC>:8080`.

## 14. Prompts sugeridos para cada fase

- Fase 1: "Lee CLAUDE.md completo. Planea y ejecuta la Fase 1. Al final levanta todo con docker compose y muéstrame la evidencia de los criterios de aceptación."
- Fase 2: "Ejecuta la Fase 2 según CLAUDE.md. Prueba con curl cada criterio de aceptación (PF-01, PF-02, PI-04, 401 directo) y muéstrame las salidas."
- Fase 3: "Ejecuta la Fase 3. Incluye la prueba PT-02 deteniendo ubicaciones con docker compose stop y mide el tiempo de respuesta."
- Fase 4: "Ejecuta la Fase 4. Verifica PC-02 con dos curl en paralelo y las pruebas PT-01 y PT-03."
- Fase 5: "Ejecuta la Fase 5 y guarda las salidas en evidencias/."
- Fase 6: "Ejecuta la Fase 6: crea la app Flutter en app_movil/ según la sección 13. Corre flutter analyze y corrige todo antes de terminar."
- Fase 7: "Ejecuta la Fase 7 y llena docs/RESULTADOS.md con los valores reales obtenidos."
- Fase 8: "Ejecuta la Fase 8. El README debe permitir que alguien sin contexto levante el sistema en 10 minutos."
