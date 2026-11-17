# Servicio de Usuario

Registro de ciudadanos, login con JWT (HS256, 45 min) y bloqueo tras 5 intentos, perfil, recuperación de contraseña simulada (token en el log), listado de entes y creación de cuentas institucionales por el admin. Crea las cuentas demo al iniciar si `SEED=true`.

| | |
|---|---|
| Puerto | 3001 (interno) |
| Esquema de BD | `usuarios` |
| Usa RabbitMQ | no |
| Requisitos | RF-USU-01..06 |
| Rutas | `/api/usuarios/*`, `/internal/usuarios` |
| Eventos | — |
| Archivos clave | `servicios/usuarios.js` (login, bloqueo, recuperación), `repositorios/usuarios.js` (bloqueo atómico) |
| Variables propias | `JWT_SECRET`, `JWT_EXPIRES_IN`, `SEED` |

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
