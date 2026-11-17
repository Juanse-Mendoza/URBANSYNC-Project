# URBANSYNC

Plataforma distribuida para **reportar, clasificar, asignar y hacer seguimiento** a incidentes
comunitarios (infraestructura, seguridad, desastre natural) en un barrio.

Proyecto final de **Sistemas Distribuidos** — Universidad Manuela Beltrán.
Equipo: Carlos Felipe Avilán Payares, Juan Sebastián Mendoza Moncada, Miguel Ángel Pinilla Báez.
Docente: Juan José Osorio Tabares.

- **Backend**: 5 microservicios Node.js + API Gateway, PostgreSQL 16/PostGIS (un esquema por servicio),
  RabbitMQ (eventos, outbox, DLQ), todo con Docker Compose.
- **App móvil**: Flutter (Android) para ciudadano, supervisor y ente de gestión, con mapa y
  notificaciones del sistema.
- Arquitectura y patrones: [docs/arquitectura.md](docs/arquitectura.md) · API: [docs/API.md](docs/API.md) ·
  Decisiones del MVP: [docs/DECISIONES.md](docs/DECISIONES.md) · Resultados de pruebas: [docs/RESULTADOS.md](docs/RESULTADOS.md)

---

## 1. Requisitos

| Herramienta | Versión probada | Para qué |
|---|---|---|
| Docker Desktop (con Docker Compose v2) | 29.x | Backend completo (obligatorio) |
| Git + Git Bash (en Windows) | — | Clonar y correr los scripts `.sh` de pruebas |
| Flutter + Android SDK | Flutter 3.47 | Solo para compilar/correr la app |
| Celular Android 8+ o emulador | — | Solo para la app |

**No hace falta instalar Node.js**: los servicios, las pruebas unitarias, newman y k6 corren en contenedores.
Equipo recomendado: 8 GB de RAM libres (16 GB si además se compila la app).

## 2. Levantar el backend (≈ 5 minutos)

```bash
git clone https://github.com/Juanse-Mendoza/URBANSYNC-Project.git
cd URBANSYNC-Project
cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
#   (opcional) cambia las contraseñas y secretos de .env
docker compose up -d --build  # la primera vez descarga imágenes y construye (~3-5 min)
docker compose ps             # esperar a que los 8 contenedores digan (healthy)
curl localhost:8080/health    # estado del gateway y de los cinco servicios
```

La base de datos se crea sola (scripts de `db/init/`) y el servicio de Usuario crea las cuentas de
demostración (`SEED=true`). Para **empezar de cero** (borra todos los datos): `docker compose down -v`.

### Puertos

| Componente | Puerto | ¿Publicado en el host? |
|---|---|---|
| **API Gateway** | **8080** | **Sí** — único punto de entrada de la API |
| Usuario / Clasificación / Ubicaciones / Asignación / Notificación | 3001 / 3002 / 3003 / 3004 / 3005 | No (solo red interna; exigen `X-Gateway-Token`) |
| PostgreSQL + PostGIS | 5432 | Sí (solo desarrollo) |
| RabbitMQ (AMQP / consola) | 5672 / **15672** | Solo la consola: http://localhost:15672 (usuario/clave de `.env`) |

### Variables de entorno (`.env`)

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` | urbansync / cambiar | Base de datos |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, `RABBITMQ_URL` | urbansync / cambiar | Broker |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | — / 45m | Firma y vigencia del token de sesión |
| `GATEWAY_TOKEN` | — | Token interno gateway ↔ servicios |
| `URL_SERVICIO_*` | http://servicio:puerto | Direcciones internas |
| `HTTP_TIMEOUT_MS` | 2000 | Timeout de llamadas entre servicios |
| `CB_FALLOS_UMBRAL`, `CB_ESPERA_MS` | 5 / 30000 | Circuit breaker |
| `RADIO_SIMILARES_M` | 50 | Radio para contar reportes similares (regla de prioridad) |
| `SEED` | true | Crear cuentas de demostración |
| `RATE_LIMIT_GENERAL`, `RATE_LIMIT_LOGIN` | 100 / 10 | Peticiones por minuto e IP |

## 3. Cuentas de demostración

Contraseña de todas: **`Urbansync2026*`**

| Rol | Correo |
|---|---|
| Ciudadano | `ciudadano@urbansync.co` |
| Supervisor | `supervisor@urbansync.co` |
| Ente de gestión — infraestructura | `ente.infra@urbansync.co` |
| Ente de gestión — seguridad | `ente.seguridad@urbansync.co` |
| Ente de gestión — desastre natural | `ente.emergencias@urbansync.co` |
| Administrador | `admin@urbansync.co` |

Los ciudadanos nuevos se registran desde la app o con `POST /api/usuarios/registro`.

## 4. App móvil (Android)

Guía completa en [app_movil/README.md](app_movil/README.md). Resumen con un celular por USB:

```powershell
# 1. En el celular: Opciones de desarrollador -> Depuración USB, conectar el cable y aceptar
cd app_movil
.\correr_en_celular.ps1      # verifica el backend, hace "adb reverse tcp:8080 tcp:8080" y "flutter run"
```

- Emulador: `flutter run` (usa `http://10.0.2.2:8080`).
- Wi-Fi: `flutter run --dart-define=API_URL=http://IP_DEL_PC:8080` (abrir el puerto 8080 en el firewall).
- APK: `flutter build apk --release --dart-define=API_URL=http://127.0.0.1:8080`.

## 5. Pruebas

Todos los scripts se ejecutan desde la raíz del repo en **Git Bash** con el backend levantado; las
salidas quedan en `evidencias/`. Resultados consolidados: [docs/RESULTADOS.md](docs/RESULTADOS.md).

| Qué | Comando | Duración |
|---|---|---|
| Pruebas unitarias (Jest + Supertest, 88 tests) | `bash pruebas/tests_unitarios.sh` | ~2 min |
| Flujo completo ciudadano → supervisor → ente | `bash pruebas/e2e.sh` | ~15 s |
| Colección Postman con newman (34 peticiones) | `bash pruebas/newman.sh` | ~15 s |
| Verificación por fase (usuario/gateway, clasificación, asignación) | `bash pruebas/fase2.sh` · `fase3.sh` · `fase4.sh` | 10 s · 1,5 min · 2 min |
| Carga con k6 (PC-01, PR-01, PR-02) | `bash pruebas/k6/ejecutar.sh` | ~4 min |
| Tolerancia a fallos PT-01 … PT-04 | `bash pruebas/fallos/pt01.sh` … `pt04.sh` | ~1 min c/u |

> `fase2.sh` usa el límite de 10 logins/min: no repetirlo antes de un minuto.
> En Postman: *Import* → `pruebas/postman/urbansync.postman_collection.json` → *Run collection*.

## 6. Estructura del repositorio

```
├── docker-compose.yml, .env.example
├── comun/                 # librería compartida: errores, logs, BD, auth, breaker, HTTP resiliente, mensajería, outbox
├── gateway/               # API Gateway :8080
├── servicios/
│   ├── usuario/           # :3001  registro, login JWT, perfiles, entes
│   ├── clasificacion/     # :3002  incidentes, regla de prioridad, outbox, recálculo
│   ├── ubicaciones/       # :3003  PostGIS, similares, mapa
│   ├── asignacion/        # :3004  asignaciones, seguimiento, reasignación
│   └── notificacion/      # :3005  consumidor de eventos, notificaciones
├── db/init/               # esquemas y tablas (se ejecutan al crear la BD)
├── app_movil/             # app Flutter (Android)
├── pruebas/               # e2e, faseN, postman, k6, fallos, demo_app.sh
├── evidencias/            # salidas de las pruebas y capturas
└── docs/                  # arquitectura, API, decisiones, resultados, guía de capturas
```

## 7. Solución de problemas

| Problema | Solución |
|---|---|
| Un contenedor queda `unhealthy` o reiniciando | `docker compose logs <servicio> --tail 50` (logs en JSON con `requestId`) |
| `port is already allocated` (8080, 5432 o 15672) | Cerrar el programa que usa el puerto o cambiar el mapeo en `docker-compose.yml` |
| Cambié `db/init/*.sql` y no se aplica | Los scripts solo corren con la BD vacía: `docker compose down -v && docker compose up -d --build` |
| La app dice "No hay conexión con el servidor" | Repetir `adb reverse tcp:8080 tcp:8080` y revisar `docker compose ps` |
| Error de Gradle `Unable to delete directory` (repo dentro de OneDrive) | Usar `app_movil/correr_en_celular.ps1` (deja `build/` fuera de OneDrive) |
| `429 DEMASIADAS_PETICIONES` | Esperar un minuto (rate limit) |
