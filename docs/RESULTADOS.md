# Resultados de las pruebas – URBANSYNC (MVP local)

Ejecución: 16 y 17 de noviembre de 2026, en un solo equipo (Windows 11, 16 GB RAM, Docker Desktop
29.9) con los 8 contenedores del `docker-compose.yml`. Todas las salidas están en `evidencias/`.

> Estas tablas llenan la columna **"Resultado obtenido"** de las Tablas 17 a 21 del documento
> teórico. Los identificadores (PF, PI, PC, PR, PT) son los del documento; si alguna descripción de
> esta tabla difiere de la del documento, prevalece la del documento y el resultado se toma de la
> evidencia indicada.

## Resumen

| Conjunto | Resultado | Evidencia |
|---|---|---|
| Verificación Fase 2 (usuario + gateway) | 30 / 30 correctas | `evidencias/fase2/verificacion.txt` |
| Verificación Fase 3 (clasificación + ubicaciones) | 44 / 44 correctas | `evidencias/fase3/verificacion.txt` |
| Verificación Fase 4 (asignación + notificación + eventos) | 48 / 48 correctas | `evidencias/fase4/verificacion.txt` |
| Pruebas unitarias (Jest + Supertest, 7 paquetes) | 88 / 88 pasan | `evidencias/fase5/tests_unitarios.txt` |
| Flujo e2e con curl | 19 / 19 correctas | `evidencias/fase5/e2e.txt` |
| Colección Postman (newman) | 34 peticiones, 59 aserciones, 0 fallos | `evidencias/fase5/newman.txt`, `newman.json` |
| Carga k6 (creación y mapa) | 0 % de errores, p95 92 ms y 111 ms | `evidencias/fase7/k6_*.txt` |
| Tolerancia a fallos PT-01 … PT-04 | 21 / 21 correctas | `evidencias/fase7/pt0*.txt` |
| App Flutter | `flutter analyze` sin problemas; flujo de los tres roles y notificaciones verificados en celular físico | `evidencias/capturas/app/` |

---

## Tabla 17 – Pruebas funcionales

| Id | Prueba | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| PF-01 | Registro de ciudadano | 201 y cuenta con rol ciudadano | 201 en 0,07 s, rol `ciudadano`, sin exponer el hash. Correo repetido → 409 `CORREO_REGISTRADO`; datos inválidos → 400 con mensaje en español; intentar enviar `rol` → 400 | ✅ Cumple |
| PF-02 | Inicio de sesión | 200 con JWT | 200 en 0,06 s con `{token, usuario:{id,nombre,rol}}` (JWT HS256, 45 min). 5 intentos fallidos → 423 `CUENTA_BLOQUEADA` 5 min | ✅ Cumple |
| PF-03 | Crear reporte de incidente | 201, estado pendiente, prioridad calculada, ≤ 3 s | 201 en 0,15 s, estado `pendiente`, prioridad `media` (seguridad), origen `automatica` | ✅ Cumple |
| PF-04 | Cinco reportes de infraestructura a menos de 50 m | El quinto queda en prioridad alta | Prioridades obtenidas: **baja → media → media → media → alta** | ✅ Cumple |
| PF-05 | Asignar incidente confirmado a un ente | 201 y el ente lo ve en su bandeja | 201 en 0,02 s; aparece en `/asignaciones/mias`; incidente no confirmado → 409; destinatario que no es ente → 400 | ✅ Cumple |
| PF-06 | El ente actualiza el estado | en_atención → resuelto y el ciudadano es notificado | 200 en ambos pasos; saltar de recibido a resuelto → 409; resolver sin solución → 400; versión vieja → 409; el ciudadano recibe "Reporte resuelto. Solución: …" | ✅ Cumple |

## Tabla 18 – Pruebas de integración

| Id | Prueba | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| PI-01 | Gateway ↔ servicios (autenticación y enrutamiento) | Sin token 401; token inválido 401; servicio caído 503 | Sin token → 401 `TOKEN_REQUERIDO`; token falso → 401 `TOKEN_INVALIDO`; Notificación detenido → 503 en español; `/internal/*` → 404; llamada directa a un servicio sin `X-Gateway-Token` → 401 | ✅ Cumple |
| PI-02 | Asignación → Clasificación por evento | El incidente cambia de estado sin llamada síncrona | Tras `asignacion.creada` el incidente pasa a `asignado` en < 2 s; historial final `pendiente → confirmado → asignado → en_atencion → resuelto` | ✅ Cumple |
| PI-03 | Eventos → Notificación | Se generan las notificaciones de ente, ciudadano y supervisores | Asignación → 1 notificación al ente y 1 al ciudadano; prioridad alta → 1 por supervisor; resuelto → 1 al ciudadano | ✅ Cumple |
| PI-04 | Ciudadano consulta la bandeja del supervisor | 403 | 403 `PROHIBIDO` (también con `X-Usuario-Rol: supervisor` falsificado y con `/API/Incidentes/`) | ✅ Cumple |

## Tabla 19 – Pruebas de concurrencia

| Id | Prueba | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| PC-01 | 50 usuarios creando incidentes durante 2 min | < 1 % de errores | **5786 incidentes creados**, 5886 peticiones, **0,00 % de errores**, 100 % de checks | ✅ Cumple |
| PC-02 | Dos asignaciones simultáneas del mismo incidente | Una 201 y otra 409 | Respuestas **`201` y `409`** (`ASIGNACION_ACTIVA`); en la BD queda exactamente 1 asignación activa (índice único parcial) | ✅ Cumple |
| PC-03 | Reenvío con la misma Idempotency-Key | 200 con el incidente original, sin duplicar | 200 con el **mismo id** del incidente original; no se crea una segunda fila | ✅ Cumple |

## Tabla 20 – Pruebas de rendimiento

| Id | Prueba | Meta | Resultado obtenido | Estado |
|---|---|---|---|---|
| PR-01 | Tiempo de creación de incidentes con 50 usuarios (2 min) | p95 < 3000 ms | **p95 = 91,9 ms**, p90 = 67,7 ms, mediana = 29,6 ms, máx. = 397 ms; **44,7 incidentes/s** | ✅ Cumple |
| PR-02 | Consulta del mapa con 200 incidentes por respuesta, 50 usuarios (1 min) | p95 < 2000 ms | **p95 = 110,8 ms**, mediana = 28,9 ms, máx. = 707 ms; 47,2 consultas/s; 0 % de errores; todas devolvieron 200 puntos | ✅ Cumple |

**Nota de método.** k6 corre en un contenedor **dentro de la red de Docker** y llama a
`http://gateway:8080`. Una primera corrida desde fuera (`host.docker.internal`) dio 4,7 % y 2,7 % de
errores de **conexión** (código 0, tiempos de conexión de hasta 19 s) que nunca llegaron al gateway
(0 errores en sus logs): eran del reenvío de puertos de Docker Desktop en Windows, no del sistema.
Las latencias de esa corrida fueron similares (p95 = 135 ms y 106 ms). Ambas corridas están en
`evidencias/fase7/` (sufijo `_via_host`). Durante la carga se elevó temporalmente el rate limit del
gateway (todas las VUs salen de una sola IP) y luego se restauró a 100/min (DECISIONES #19).

## Tabla 21 – Pruebas de tolerancia a fallos

| Id | Falla provocada | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| PT-01 | `docker compose stop notificacion` mientras se crean, confirman y asignan 3 reportes | Las operaciones siguen; los eventos no se pierden y se procesan al volver | Las 3 asignaciones respondieron 201; **9 eventos esperaron** en la cola durable; al iniciar el servicio la cola se vació en **3 s** y llegaron las 6 notificaciones del ciudadano y las 3 del ente | ✅ Cumple |
| PT-02 | `docker compose stop ubicaciones` y creación de 6 reportes | Se guardan en ≤ 3 s con prioridad de respaldo; se recalcula en ≤ 60 s tras el reinicio | 6 × 201, tiempo máximo **2,04 s**; el circuit breaker se abrió al 5.º fallo y el 6.º respondió en **0,02 s**; tras `start` las 6 prioridades se recalcularon en **16 s** (corridas anteriores: 26, 31 y 37 s) → `baja media media media alta alta` | ✅ Cumple |
| PT-03 | `docker compose stop rabbitmq` y confirmación + asignación | Las operaciones siguen; el outbox publica al volver el broker | Confirmar → 200 y asignar → 201 con el broker caído; eventos retenidos en los outbox; `/health` en estado `degradado` (`broker:false`); al iniciar RabbitMQ los servicios se reconectaron y el outbox publicó en **15 s**; el incidente pasó a `asignado` y el ente recibió su notificación | ✅ Cumple |
| PT-04 | El proceso de un servicio (Clasificación) termina abruptamente | Docker lo reinicia solo y vuelve a estar healthy | `RestartCount` 0 → 1, contenedor otra vez **healthy en 6 s**; el gateway respondió 200 de nuevo | ✅ Cumple |

**Nota PT-04.** `docker kill` y `docker stop` cuentan como parada **manual** y Docker no aplica la
política `restart: unless-stopped` (verificado: el contenedor quedó `exited` 20 s). Por eso la falla
se provoca haciendo terminar al proceso Node desde dentro del contenedor, que es lo que ocurre en una
caída real (excepción no controlada, falta de memoria…). DECISIONES #43.

---

## Comparación con las metas no funcionales (Tabla 7)

| Requisito no funcional | Meta | Medido | Cumple |
|---|---|---|---|
| RNF-REN-01 Tiempo de registro de un incidente | ≤ 3 s | p95 92 ms con 50 usuarios; 2,04 s en el peor caso (Ubicaciones caído) | ✅ |
| Concurrencia | 50 usuarios simultáneos con < 1 % de errores | 50 VUs, 0 % de errores, 44,7 incidentes/s | ✅ |
| Consulta del mapa | Respuesta rápida con 200 puntos | p95 111 ms | ✅ |
| Disponibilidad ante la caída de un servicio | El sistema sigue operando | PT-01, PT-02, PT-03: operaciones 200/201 con el componente caído | ✅ |
| Recuperación automática | Reinicio sin intervención | PT-04: healthy en 6 s | ✅ |
| Consistencia de eventos | Ningún evento perdido | PT-01 (cola durable) y PT-03 (outbox): 0 eventos perdidos | ✅ |
| Concurrencia sobre el mismo recurso | Sin dobles asignaciones ni sobrescrituras | PC-02 (201/409) y control por versión (409) | ✅ |
| RNF-USA-01 Nuevo reporte | ≤ 5 pasos | 5 pasos en una pantalla (título, categoría, descripción, radio, ubicación) | ✅ |
| RNF-USA-02 Mensajes de error | Claros, en español, sin trazas | Formato `{error:{codigo,mensaje}}`; un error interno devuelve 500 sin detalles (test) | ✅ |
| RNF-USA-03 Navegación consistente | Mismo orden de pestañas por rol | Principal · Mapa · Alertas · Perfil en los tres roles | ✅ |
| RNF-USA-04 Pantallas pequeñas | Usable desde 360 × 640 | Formularios desplazables, filtros con scroll horizontal; probado en celular | ✅ |
| RNF-DIS-02 La app no se cierra ante errores de red | SnackBar con "Reintentar" | Implementado en todas las pantallas (A-17) | ✅ |
| RNF-POR-02 Compatibilidad Android | Android 8.0+ | `minSdk 26` | ✅ |
| Seguridad | JWT, roles, contraseñas cifradas | JWT HS256, autorización doble (gateway + servicio), bcrypt costo 10, bloqueo 5 intentos, OWASP API1 | ✅ |
| TLS en tránsito | HTTPS | ⚠️ HTTP en el MVP local (DECISIONES #2 y #37); HTTPS en el despliegue en nube | Parcial |

## Limitaciones conocidas

- Todo corre en un solo equipo: las cifras de rendimiento no incluyen latencia de red real entre nodos.
- Sin TLS en local; fotografías, FCM e iOS fuera del MVP (DECISIONES #2–#6).
- La DLQ se vigila desde la consola de RabbitMQ; no hay reprocesamiento automático (DECISIONES #34).
