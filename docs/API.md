# API de URBANSYNC

Todo se consume a través del **gateway**: `http://localhost:8080` (celular por USB con `adb reverse`:
`http://127.0.0.1:8080`). La colección completa y ejecutable está en
`pruebas/postman/urbansync.postman_collection.json`.

## Convenciones

- **Autenticación**: `Authorization: Bearer <jwt>` (se obtiene en `POST /api/usuarios/login`; expira en 45 min).
- **Formato de error** (siempre):
  ```json
  { "error": { "codigo": "VERSION_CONFLICTO", "mensaje": "El incidente fue modificado por otra persona..." } }
  ```
- **Paginación**: `?pagina=1&limite=20` (máximo 50). Respuesta `{ "datos": [...], "paginacion": { "pagina", "limite", "total", "paginas" } }`.
- **Concurrencia**: los PATCH que cambian estado reciben `version`; si no coincide → `409 VERSION_CONFLICTO`.
- **Trazabilidad**: cada respuesta incluye `X-Request-Id` (también aparece en los logs de todos los servicios).
- **Límites**: 100 peticiones/min por IP (10/min en login) → `429`; body máximo 100 kb → `413`.

### Códigos de respuesta usados

| Código | Cuándo |
|---|---|
| 200 / 201 | OK / creado (200 también en el reenvío idempotente de un incidente) |
| 400 `DATOS_INVALIDOS` | validación (mensaje en español con el campo) |
| 401 `TOKEN_REQUERIDO`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`, `CREDENCIALES_INVALIDAS` | autenticación |
| 403 `PROHIBIDO` | rol no permitido o recurso ajeno |
| 404 | recurso o ruta inexistente |
| 409 `VERSION_CONFLICTO`, `ASIGNACION_ACTIVA`, `INCIDENTE_NO_ASIGNABLE`, `TRANSICION_INVALIDA`, `CORREO_REGISTRADO` | conflictos de estado |
| 423 `CUENTA_BLOQUEADA` | 5 intentos de login fallidos (5 min) |
| 429 `DEMASIADAS_PETICIONES` | rate limit |
| 503 `SERVICIO_NO_DISPONIBLE` | el servicio destino no responde |

## Usuario — `/api/usuarios`

| Método | Ruta | Rol | Cuerpo / parámetros | Respuesta |
|---|---|---|---|---|
| POST | `/api/usuarios/registro` | público | `{nombre, correo, contrasena, telefono, barrio?}` | 201 usuario (siempre rol ciudadano) |
| POST | `/api/usuarios/login` | público | `{correo, contrasena}` | `{token, usuario:{id,nombre,rol}}` |
| POST | `/api/usuarios/recuperar` | público | `{correo}` | 200 (el token se imprime en el log del servicio) |
| POST | `/api/usuarios/restablecer` | público | `{token, nuevaContrasena}` | 200 |
| GET | `/api/usuarios/me` | todos | — | perfil |
| PUT | `/api/usuarios/me` | ciudadano | `{nombre?, telefono?, barrio?}` | perfil (el rol no se puede cambiar) |
| GET | `/api/usuarios/entes?categoria=` | supervisor, admin | categoría opcional | lista paginada de entes |
| POST | `/api/usuarios` | admin | `{nombre, correo, contrasena, rol: supervisor\|ente_gestion, categoria_atencion?}` | 201 |

Contraseña: 8 a 72 caracteres con letras y números.

## Clasificación — `/api/categorias`, `/api/incidentes`

| Método | Ruta | Rol | Cuerpo / parámetros | Respuesta |
|---|---|---|---|---|
| GET | `/api/categorias` | todos | — | categorías con subcategorías y prioridad base |
| POST | `/api/incidentes` | ciudadano | Encabezado **`Idempotency-Key`** (8-64). `{titulo, descripcion?, categoria, subcategoria?, lat, lng, radio_m? (25-200)}` | 201 incidente (200 si la clave ya se usó) |
| GET | `/api/incidentes/mios` | ciudadano | paginación | mis reportes |
| GET | `/api/incidentes` | supervisor | `categoria`, `prioridad`, `estado` + paginación | bandeja (alta primero) |
| GET | `/api/incidentes/:id` | dueño, supervisor, ente asignado | — | incidente + `historial` (403 a otros) |
| PATCH | `/api/incidentes/:id/clasificacion` | supervisor | `{confirmar?=true, categoria?, subcategoria?, prioridad?, comentario?, version}` | incidente (409 si la versión cambió) |

Campos del incidente: `prioridad` (baja/media/alta), `prioridad_origen` (automatica/respaldo/supervisor),
`recalcular_prioridad`, `estado` (pendiente → confirmado → asignado → en_atencion → resuelto), `version`.

## Ubicaciones — `/api/ubicaciones`

| Método | Ruta | Rol | Parámetros | Respuesta |
|---|---|---|---|---|
| GET | `/api/ubicaciones/mapa` | todos | `lat`, `lng` (juntos), `radio_m`=500 (máx. 50000), `categoria`, `desde`, `hasta` | `{datos:[{incidente_id, categoria, lat, lng, radio_m, creado_en}], total}` (máx. 200) |
| GET | `/api/ubicaciones/:incidenteId/similares` | supervisor | — | reportes cercanos de la misma categoría con `distancia_m` |
| PATCH | `/api/ubicaciones/:incidenteId/radio` | supervisor | `{radio_m}` (25-200) | ubicación |

## Asignación — `/api/asignaciones`

| Método | Ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/api/asignaciones` | supervisor | `{incidenteId, enteId}` | 201 (409 si no está confirmado o ya hay una activa) |
| GET | `/api/asignaciones/mias?estado=` | ente | — | asignaciones activas del ente |
| PATCH | `/api/asignaciones/:id/estado` | ente dueño | `{estado: en_atencion\|resuelto, comentario, solucion? (obligatoria si resuelto), version}` | asignación |
| PATCH | `/api/asignaciones/:id/reasignar` | supervisor | `{enteId, comentario?}` | `{anterior, nueva}` |
| GET | `/api/asignaciones/incidente/:incidenteId` | supervisor | — | asignaciones con `seguimiento` |

## Notificación — `/api/notificaciones`

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/notificaciones?noLeidas=true` | todos | historial propio paginado |
| GET | `/api/notificaciones/no-leidas/conteo` | todos | `{conteo}` (lo consulta la app cada 30 s) |
| PATCH | `/api/notificaciones/:id/leida` | dueño | marca una (404 si es ajena) |
| PATCH | `/api/notificaciones/leer-todas` | todos | `{actualizadas}` |

## Rutas internas (no expuestas por el gateway; exigen `X-Gateway-Token`)

| Servicio | Ruta | Uso |
|---|---|---|
| Usuario | `GET /internal/usuarios/:id`, `GET /internal/usuarios?rol=` | Asignación valida el ente; Notificación busca supervisores |
| Clasificación | `GET /internal/incidentes/:id` | Asignación verifica que esté confirmado |
| Ubicaciones | `POST /internal/ubicaciones` | Clasificación registra el punto y obtiene `similares` |

## Eventos (RabbitMQ, exchange `urbansync.eventos`)

Sobre: `{ eventoId, tipo, emitidoEn, incidenteId, datos }`.

| Evento | Publica | Consume | Efecto |
|---|---|---|---|
| `incidente.creado` | Clasificación | Notificación | si prioridad alta → aviso a todos los supervisores |
| `incidente.confirmado` | Clasificación | Notificación | aviso al ciudadano |
| `asignacion.creada` | Asignación | Clasificación, Notificación | estado → asignado; aviso al ente y al ciudadano |
| `asignacion.estado_actualizado` | Asignación | Clasificación, Notificación | estado → en_atencion/resuelto; aviso al ciudadano |
| `asignacion.reasignada` | Asignación | Clasificación, Notificación | nuevo ente asignado; aviso al nuevo ente |

## Ejemplo rápido (curl)

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/usuarios/login -H 'Content-Type: application/json' \
  -d '{"correo":"ciudadano@urbansync.co","contrasena":"Urbansync2026*"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

curl -s -X POST localhost:8080/api/incidentes -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(date +%s)abcdef" \
  -d '{"titulo":"Hueco en la vía","categoria":"infraestructura","lat":4.6097,"lng":-74.0817}'
```
