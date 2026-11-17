# Guía de capturas para el documento de URBANSYNC

Lista de las capturas que sustentan el documento (Word). Cada una indica **qué mostrar**, **dónde
está** y **qué requisito o prueba respalda**. Guardar las imágenes con el nombre sugerido en:

```
evidencias/capturas/
├── app/        # pantallazos del celular (A-01 ...)
├── codigo/     # fragmentos de código (C-01 ...)
└── terminal/   # salidas de pruebas, Docker, RabbitMQ (T-01 ...)
```

> Las salidas de texto de todas las pruebas ya están en `evidencias/fase1..fase5/*.txt`; las
> capturas de terminal sirven como imagen para el Word, el texto como respaldo.

---

## 1. Cómo se calcula la prioridad (nivel de riesgo)

El "nivel de riesgo" del incidente es su **prioridad: baja, media o alta**. Se calcula en cuatro piezas:

| # | Pieza | Dónde está | Qué hace |
|---|---|---|---|
| 1 | Prioridad base por categoría | `db/init/02_incidentes.sql` líneas 18-21 (tabla `incidentes.categoria`, columna `prioridad_base`) | infraestructura = **baja**, seguridad = **media**, desastre natural = **alta** |
| 2 | Conteo de reportes similares | `servicios/ubicaciones/src/repositorios/ubicaciones.js` líneas 19-35 (`registrarYContar`) | Cuenta con PostGIS `ST_DWithin` los reportes de la **misma categoría**, a **≤ 50 m** (`RADIO_SIMILARES_M` en `.env`), de los **últimos 30 días**, incluido el nuevo |
| 3 | Regla de prioridad (función pura) | `servicios/clasificacion/src/servicios/prioridad.js` líneas 1-35 (`calcularPrioridad`, línea 26) | 1 similar → base · 2 a 4 → **sube un nivel** · 5 o más → **alta** |
| 4 | Aplicación y respaldo | `servicios/clasificacion/src/servicios/incidentes.js` líneas 48-92 (`crear`) | Llama a Ubicaciones (2 s, breaker). Si falla → prioridad base, origen `respaldo`, `recalcular_prioridad = true` |
| 5 | Recálculo | `servicios/clasificacion/src/servicios/recalculo.js` líneas 13-48 | Cada 60 s recalcula los de respaldo; **nunca baja** una prioridad fijada por el supervisor (línea 29) |
| 6 | Ajuste manual | `servicios/clasificacion/src/servicios/incidentes.js` líneas 118-174 (`clasificar`) | El supervisor puede fijar la prioridad → origen `supervisor` |
| 7 | Consecuencia | `servicios/notificacion/src/eventos/procesador.js` líneas 18-23 | Si la prioridad es **alta**, se notifica a todos los supervisores (RF-NOT-02) |

**Tabla de ejemplos (para el documento):**

| Categoría (base) | Similares a ≤ 50 m en 30 días | Prioridad resultante |
|---|---|---|
| Infraestructura (baja) | 1 | Baja |
| Infraestructura (baja) | 2 – 4 | Media |
| Infraestructura (baja) | 5 o más | Alta |
| Seguridad (media) | 1 | Media |
| Seguridad (media) | 2 o más | Alta |
| Desastre natural (alta) | cualquiera | Alta |

**Origen de la prioridad** (campo `prioridad_origen`, se muestra en la app): `automatica` (regla
normal), `respaldo` (Ubicaciones no respondió; se recalcula), `supervisor` (ajuste manual).

Evidencia: PF-04 en `evidencias/fase3/verificacion.txt` (baja → media → media → media → alta) y
los 7 tests unitarios en `evidencias/fase3/tests_prioridad.txt`.

---

## 2. Capturas de código (las más importantes, en orden de prioridad)

Abrir el archivo en VS Code, seleccionar el rango de líneas y capturar (se ven los números de línea).

| Id | Qué mostrar | Archivo : líneas | Respalda |
|---|---|---|---|
| **C-01** | Regla de prioridad completa (comentario + `calcularPrioridad`) | `servicios/clasificacion/src/servicios/prioridad.js` : 1-35 | Sección 10, PF-04 |
| **C-02** | Conteo geoespacial con PostGIS (`ST_DWithin`) | `servicios/ubicaciones/src/repositorios/ubicaciones.js` : 14-35 | RF-UBI-04 |
| **C-03** | Creación del incidente: idempotencia + plan B + transacción con outbox | `servicios/clasificacion/src/servicios/incidentes.js` : 40-92 | RF-CLA-01, PC-03, PT-02 |
| **C-04** | Circuit breaker: diagrama en comentario + `ejecutar` + cambio de estado | `comun/breaker.js` : 1-95 | Tabla 15, PT-02 |
| **C-05** | Cliente HTTP resiliente (timeout, reintentos solo 5xx/red, breaker) | `comun/httpResiliente.js` : 1-75 | RNF disponibilidad |
| **C-06** | Patrón outbox (`agregarAOutbox` + ciclo con `FOR UPDATE SKIP LOCKED`) | `comun/outbox.js` : 1-66 | PT-03 |
| **C-07** | Topología RabbitMQ (exchange, colas, DLX/DLQ) | `comun/mensajeria.js` : 1-49 | Sección 9 |
| **C-08** | Consumidor con reintentos 200/400/800 ms y envío a DLQ | `comun/mensajeria.js` : 161-208 | DLQ, PT-01 |
| **C-09** | Consumidor idempotente de Notificación (plantillas + `eventos_procesados`) | `servicios/notificacion/src/eventos/procesador.js` : 1-68 | RF-NOT-01/02/03, PI-03 |
| **C-10** | Control optimista por versión (UPDATE ... WHERE version) | `servicios/clasificacion/src/repositorios/incidentes.js` : 90-105 | RF-CLA-05 (409) |
| **C-11** | Índice único parcial (una asignación activa) + manejo del 23505 | `db/init/04_asignaciones.sql` : 20-22 y `servicios/asignacion/src/servicios/asignaciones.js` : 38-66 | PC-02 |
| **C-12** | Máquina de estados de la asignación | `servicios/asignacion/src/servicios/asignaciones.js` : 1-14 y 73-96 | RF-ASG-03/04 |
| **C-13** | Tabla de rutas y roles del gateway | `gateway/src/config/rutas.js` : 1-58 | Autorización, PI-04 |
| **C-14** | Seguridad del gateway: limpiar encabezados + validar JWT + rol | `gateway/src/middlewares/seguridad.js` : 1-64 | OWASP API, 401/403 |
| **C-15** | Cadena de middlewares del gateway | `gateway/src/app.js` : 1-15 y 46-60 | Arquitectura |
| **C-16** | Token interno entre servicios (`X-Gateway-Token`) | `comun/auth.js` : 1-35 | DECISIONES #10 |
| **C-17** | Login con bloqueo tras 5 intentos | `servicios/usuario/src/servicios/usuarios.js` : 55-88 | RF-USU-02 |
| **C-18** | Consumidor de Clasificación (estado no retrocede) | `servicios/clasificacion/src/eventos/consumidorAsignaciones.js` : 1-58 | PI-02 |
| **C-19** | Docker Compose: ancla común, healthchecks, restart | `docker-compose.yml` : 1-28 y 89-102 | PT-04, despliegue |
| **C-20** | App: polling de alertas + notificación del sistema | `app_movil/lib/servicios/alertas.dart` : 1-30 y 89-131 | DECISIONES #5 |
| **C-21** | App: Idempotency-Key generada una vez y reutilizada | `app_movil/lib/pantallas/ciudadano/nuevo_reporte.dart` : 15-35 y 85-115 | RNF-USA-01, PC-03 |
| **C-22** | App: cliente HTTP con timeout y errores en español | `app_movil/lib/api/cliente_api.dart` : 28-100 | RNF-DIS-02, RNF-USA-02 |
| C-23 | Formato estándar de errores | `comun/errores.js` : 1-20 y 67-95 | RNF-USA-02 |
| C-24 | Modelo de datos del incidente | `db/init/02_incidentes.sql` : 34-62 | Modelo de datos |
| C-25 | Test unitario de la regla (caso PF-04) | `servicios/clasificacion/test/prioridad.test.js` : 1-30 | Pruebas |

Si el espacio del documento es limitado, las **imprescindibles** son: C-01, C-02, C-03, C-04, C-06, C-08, C-09, C-10, C-11, C-13, C-20.

---

## 3. Capturas de terminal y consolas

| Id | Qué capturar | Cómo obtenerla | Respalda |
|---|---|---|---|
| **T-01** | Los 8 contenedores `healthy` | `docker compose ps` | Fase 1, despliegue |
| **T-02** | Salud agregada del gateway | `curl localhost:8080/health` (o el navegador) | Fase 1 |
| **T-03** | Consola RabbitMQ: pestaña *Queues* (colas y DLQ) | http://localhost:15672 | Sección 9 |
| **T-04** | Consola RabbitMQ: pestaña *Exchanges* (`urbansync.eventos` topic, `urbansync.dlx`) | http://localhost:15672 | Sección 9 |
| **T-05** | Pruebas de usuario y gateway (30 OK) | `bash pruebas/fase2.sh` | PF-01, PF-02, PI-04 |
| **T-06** | PF-04 (cinco reportes → alta) | `bash pruebas/fase3.sh` (sección PF-04) | PF-04 |
| **T-07** | PT-02: incidente en ≤ 3 s con Ubicaciones caído + log del breaker + recálculo | `bash pruebas/fase3.sh` (sección PT-02) | PT-02, Tabla 15 |
| **T-08** | PC-02: `201 409` en paralelo | `bash pruebas/fase4.sh` (sección PC-02) | PC-02 |
| **T-09** | PT-01: eventos acumulados en la cola y luego procesados | `bash pruebas/fase4.sh` (sección PT-01) | PT-01 |
| **T-10** | PT-03: outbox retenido con RabbitMQ caído y publicado al volver | `bash pruebas/fase4.sh` (sección PT-03) | PT-03 |
| **T-11** | DLQ: reintentos y envío a la DLQ | `bash pruebas/fase4.sh` (sección DLQ) | DLQ |
| **T-12** | 88 tests unitarios pasando | `bash pruebas/tests_unitarios.sh` | Fase 5 |
| **T-13** | Flujo e2e completo | `bash pruebas/e2e.sh` | Fase 5 |
| **T-14** | Resumen de newman (34 peticiones, 59 aserciones, 0 fallos) | `bash pruebas/newman.sh` | Fase 5 |
| T-15 | Logs JSON con requestId | `docker compose logs gateway clasificacion --tail 10` | RNF observabilidad |
| T-16 | Colección importada en Postman (carpetas y una petición con tests) | Postman → Import `pruebas/postman/urbansync.postman_collection.json` | Fase 5 |
| T-17 | `flutter analyze` sin problemas | `cd app_movil; flutter analyze` | Fase 6 |
| T-18 / T-19 | Pruebas de carga k6 y PT-04 | Fase 7 (pendiente) | PC-01, PR-01, PR-02, PT-04 |

---

## 4. Capturas de la app (celular)

| Id | Pantalla | Rol | Respalda |
|---|---|---|---|
| **A-01** | Login (con "Cuentas de demostración" desplegado) | — | RF-USU-02 |
| A-02 | Registro | — | RF-USU-01 |
| **A-03** | Mis reportes (lista con estados y prioridades) | Ciudadano | RF-CLA-07 |
| **A-04** | Nuevo reporte: pasos 1-2 (título y categoría) | Ciudadano | RNF-USA-01 |
| **A-05** | Nuevo reporte: pasos 4-5 (radio y mapa con el punto) | Ciudadano | RF-UBI-01/02 |
| **A-06** | Detalle del reporte con historial completo (pendiente → resuelto) | Ciudadano | RF-CLA-07 |
| **A-07** | Bandeja con filtros | Supervisor | RF-CLA-04 |
| **A-08** | Gestionar incidente: confirmar / ajustar prioridad (diálogo) | Supervisor | RF-CLA-05 |
| **A-09** | Elegir ente para asignar (hoja inferior) | Supervisor | RF-ASG-01 |
| A-10 | Historial de asignaciones (activa y reasignada) | Supervisor | RF-ASG-05/06 |
| **A-11** | Mis asignaciones | Ente | RF-ASG-02 |
| **A-12** | Atender incidente (resolver con solución) | Ente | RF-ASG-03/04 |
| **A-13** | Mapa con marcadores por categoría | Todos | RF-UBI-03 |
| **A-14** | **Notificación del sistema** en la barra de Android | Ciudadano | RF-NOT-01 |
| **A-15** | **Notificación "Nuevo incidente asignado"** | Ente | RF-NOT-03 |
| A-16 | Pestaña Alertas con badge de no leídas | Todos | RF-NOT-04 |
| A-17 | Error de red con botón "Reintentar" (apagar Wi-Fi/backend) | Todos | RNF-DIS-02 |
| A-18 | Perfil | Todos | RF-USU |

---

## 5. Instrucción sugerida para Claude Desktop

> "Con el repositorio URBANSYNC (CLAUDE.md, docs/DECISIONES.md, docs/GUIA_CAPTURAS.md y la carpeta
> evidencias/), completa el documento Word: inserta cada captura (A-xx, C-xx, T-xx) en la sección del
> requisito o prueba que respalda según esta guía, con un pie de figura en formato APA y un párrafo
> que explique qué demuestra. Explica la regla de prioridad con la tabla de la sección 1 y registra
> las desviaciones de DECISIONES.md."
