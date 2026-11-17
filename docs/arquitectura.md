# Arquitectura de URBANSYNC (MVP local)

## Vista general

Flechas **continuas** = llamadas **síncronas** (HTTP/REST). Flechas **punteadas** = mensajes
**asíncronos** (eventos por RabbitMQ).

```mermaid
flowchart LR
    APP["📱 App Flutter (Android)<br/>ciudadano · supervisor · ente"]
    PM["🧪 Postman / k6 / curl"]

    subgraph DOCKER["Docker Compose (red interna urbansync)"]
        GW["API Gateway :8080<br/>JWT · roles · rate limit · proxy"]

        subgraph SVC["Microservicios (puertos NO publicados, exigen X-Gateway-Token)"]
            USU["Usuario :3001"]
            CLA["Clasificación :3002<br/>regla de prioridad · outbox · recálculo"]
            UBI["Ubicaciones :3003<br/>PostGIS"]
            ASG["Asignación :3004<br/>outbox"]
            NOT["Notificación :3005"]
        end

        MQ[["RabbitMQ<br/>exchange urbansync.eventos (topic)<br/>DLX urbansync.dlx → urbansync.dlq"]]

        subgraph BD["PostgreSQL 16 + PostGIS (un esquema por servicio)"]
            E1[("usuarios")]
            E2[("incidentes")]
            E3[("ubicaciones")]
            E4[("asignaciones")]
            E5[("notificaciones")]
        end
    end

    APP -- "HTTPS/HTTP + Bearer JWT" --> GW
    PM --> GW
    GW --> USU & CLA & UBI & ASG & NOT

    CLA -- "POST /internal/ubicaciones<br/>(2 s, breaker)" --> UBI
    ASG -- "GET /internal/incidentes/:id" --> CLA
    ASG -- "GET /internal/usuarios/:id" --> USU
    NOT -- "GET /internal/usuarios?rol=supervisor" --> USU

    USU --- E1
    CLA --- E2
    UBI --- E3
    ASG --- E4
    NOT --- E5

    CLA -. "incidente.creado<br/>incidente.confirmado" .-> MQ
    ASG -. "asignacion.creada<br/>asignacion.estado_actualizado<br/>asignacion.reasignada" .-> MQ
    MQ -. "cola notificacion.eventos" .-> NOT
    MQ -. "cola clasificacion.eventos" .-> CLA
    APP -. "polling 30 s<br/>/no-leidas/conteo" .-> GW
```

## Flujo principal (secuencia)

```mermaid
sequenceDiagram
    autonumber
    actor C as Ciudadano (app)
    participant GW as Gateway
    participant CLA as Clasificación
    participant UBI as Ubicaciones
    participant MQ as RabbitMQ
    participant NOT as Notificación
    actor S as Supervisor
    participant ASG as Asignación
    actor E as Ente

    C->>GW: POST /api/incidentes (JWT, Idempotency-Key)
    GW->>CLA: reenvía + X-Usuario-Id/Rol + X-Gateway-Token
    CLA->>UBI: POST /internal/ubicaciones (timeout 2 s, breaker)
    UBI-->>CLA: { similares: N }  (ST_DWithin 50 m, 30 días)
    Note over CLA: calcularPrioridad(base, N)<br/>si falla: prioridad base + "respaldo"
    CLA->>CLA: TX: incidente + historial + outbox
    CLA-->>C: 201 (≤ 3 s)
    CLA--)MQ: outbox (cada 2 s): incidente.creado
    MQ--)NOT: si prioridad alta → avisa a supervisores

    S->>GW: PATCH /api/incidentes/:id/clasificacion (version)
    GW->>CLA: confirma (control optimista → 409 si cambió)
    CLA--)MQ: incidente.confirmado
    MQ--)NOT: aviso al ciudadano

    S->>GW: POST /api/asignaciones
    GW->>ASG: crear
    ASG->>CLA: GET /internal/incidentes/:id (¿confirmado?)
    ASG->>ASG: TX: asignación (índice único parcial) + outbox
    ASG--)MQ: asignacion.creada
    MQ--)CLA: estado → asignado
    MQ--)NOT: aviso al ente y al ciudadano

    E->>GW: PATCH /api/asignaciones/:id/estado (en_atencion → resuelto)
    GW->>ASG: actualizar (máquina de estados + version)
    ASG--)MQ: asignacion.estado_actualizado
    MQ--)CLA: estado → en_atencion / resuelto
    MQ--)NOT: aviso al ciudadano
    C->>GW: GET /no-leidas/conteo (cada 30 s)
    Note over C: notificación local del sistema
```

## Patrones de sistemas distribuidos aplicados

| Patrón | Dónde | Para qué |
|---|---|---|
| API Gateway | `gateway/` | Punto único de entrada; autenticación (JWT), autorización por rol, rate limit, 503 en español |
| Base de datos por servicio | un esquema por servicio, sin FK entre esquemas | Aislamiento y despliegue independiente |
| Comunicación asíncrona por eventos | RabbitMQ topic + colas durables | Desacoplar; tolerar la caída de un consumidor (PT-01) |
| Transactional Outbox | `comun/outbox.js`, tablas `outbox` | No perder eventos si el broker cae (PT-03) |
| Consumidor idempotente | tablas `eventos_procesados` | Entrega "al menos una vez" sin duplicar efectos |
| Reintentos + Dead Letter Queue | `comun/mensajeria.js` | 3 reintentos (200/400/800 ms) y luego `urbansync.dlq` |
| Circuit breaker | `comun/breaker.js` | Fallar rápido y usar el plan B (PT-02) |
| Timeout + reintentos con backoff y jitter | `comun/httpResiliente.js` | Llamadas síncronas resilientes (solo 5xx/red) |
| Degradación elegante | prioridad de respaldo + recálculo cada 60 s | El reporte nunca se pierde |
| Control optimista de concurrencia | columna `version` → 409 | Dos supervisores editando a la vez |
| Restricción única parcial | `uq_asignacion_activa` | Una sola asignación activa (PC-02) |
| Idempotency-Key | `POST /api/incidentes` | Reintentos de la app sin duplicar (PC-03) |
| Health checks + reinicio automático | `docker-compose.yml` | Autorecuperación (PT-04) |
| Correlación de logs | `X-Request-Id` propagado, logs JSON (pino) | Seguir una petición entre servicios |

## Seguridad en capas

1. **Gateway**: valida el JWT (HS256, emisor `urbansync`) → 401; valida el rol por método y ruta → 403;
   elimina `X-Usuario-*` y `X-Gateway-Token` enviados por el cliente; helmet; 100 kb; rate limit.
2. **Red**: solo el gateway (8080) está publicado; los servicios no son accesibles desde fuera.
3. **Servicio**: exige `X-Gateway-Token` (comparación en tiempo constante) → 401; vuelve a validar el rol
   y la **propiedad del recurso** (un ciudadano solo ve sus reportes → 403, OWASP API1).
4. **Datos**: contraseñas con bcrypt (costo 10), bloqueo tras 5 intentos, token de recuperación
   guardado como hash SHA-256 y de un solo uso, SQL siempre parametrizado, validación con zod.
