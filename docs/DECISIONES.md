# Decisiones del MVP (desviaciones frente al documento teórico)

Cada entrada indica **qué** se decidió, **por qué** y el **impacto** en el documento teórico
`URBANSYNC_Documento_Teorico_APA.docx`.

| # | Qué | Por qué | Impacto en el documento |
|---|-----|---------|-------------------------|
| 1 | Una instancia PostgreSQL 16 + PostGIS con un esquema por servicio (`usuarios`, `incidentes`, `ubicaciones`, `asignaciones`, `notificaciones`) y un solo usuario de BD. Cada servicio fija `search_path` a su esquema y nunca consulta otro. Referencias entre servicios por UUID sin llave foránea. | Simplifica la operación local manteniendo el aislamiento lógico de "base de datos por servicio". | Aclarar que en producción cada esquema puede migrar a su propia instancia sin cambiar código. |
| 2 | TLS: en local la app usa HTTP dentro de la red local; HTTPS queda para el despliegue en nube. `android:usesCleartextTraffic="true"` solo en el MVP. | Evitar gestionar certificados en el entorno local. | RNF de seguridad en tránsito se cumple en el despliegue, no en la demo local. |
| 3 | Fotografías (RF-CLA-01, RF-ASG-04) fuera del MVP; `foto_url` queda nula. | Alcance y plazo. | Marcar como trabajo futuro. |
| 4 | Recuperación de contraseña (RF-USU-03) simulada: el token de un solo uso (15 min) se imprime en el log del servicio de Usuario. | No hay servidor de correo en local. | Se describe el flujo; el canal de envío cambia. |
| 5 | Notificaciones por *polling* (30 s) del conteo de no leídas + notificación local con `flutter_local_notifications`; sin FCM. | Evita depender de Firebase. | Las notificaciones push reales quedan como trabajo futuro. |
| 6 | iOS no se compila (requiere macOS); se entrega APK Android. | Restricción de hardware. | Portabilidad iOS pendiente. |
| 7 | Cuentas de supervisor y entes creadas por *seed* (`SEED=true`); `POST /api/usuarios` solo para admin. | Facilita la demo. | Ninguno funcional. |
| 8 | Clasificación consume `asignacion.creada` para pasar el incidente a `asignado`. | Mantener el estado del incidente coherente sin llamadas síncronas. | Agregar el evento al diagrama de flujo. |
| 9 | Vinculación manual de reportes (RF-UBI-05) opcional; reasignación (RF-ASG-06) sí se implementa. | Plazo. | RF-UBI-05 como trabajo futuro si no se completa. |
| 10 | Servicios internos protegidos con el encabezado `X-Gateway-Token` además de no publicar sus puertos. El gateway elimina `X-Usuario-*` y `X-Gateway-Token` enviados por el cliente. | Defensa en profundidad (OWASP API). | Agregar a la sección de seguridad. |
| 11 | Circuit breaker propio (`comun/breaker.js`) por fallos consecutivos, sin librería. | Coincide con la Tabla 15 y es fácil de explicar. | Ninguno. |
| 12 | `/health` de cada servicio responde 200 con `estado: "degradado"` si RabbitMQ está caído (503 solo si cae la BD). Usuario y Ubicaciones no usan broker: `broker: "no_aplica"`. | Si el broker cae, Docker no debe reiniciar los servicios: siguen atendiendo y el outbox guarda los eventos (PT-03). | Precisar el contrato de salud en la sección de disponibilidad. |
| 13 | Se agregó `comun/app.js` (no estaba en la estructura original) con `crearAppBase`/`finalizarApp`. | Evita repetir en cinco servicios el orden de middlewares (log, JSON, /health, token, identidad). | Ninguno. |
| 14 | `mensajeria.js`: si RabbitMQ no responde tras 10 intentos al arrancar, el servicio inicia igual y sigue reintentando en segundo plano. | Disponibilidad: el servicio no debe morir por el broker. | Ninguno. |
| 15 | Cualquier servicio que se conecta declara toda la topología (exchanges, colas, DLQ). | Las colas existen aunque el consumidor esté caído, así los eventos se acumulan (PT-01). | Ninguno. |
