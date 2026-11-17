# URBANSYNC

Plataforma distribuida para reportar, clasificar, asignar y hacer seguimiento a incidentes
comunitarios. Proyecto final de Sistemas Distribuidos — Universidad Manuela Beltrán.

> Manual completo en construcción (Fase 8). Arranque rápido:

```bash
cp .env.example .env        # y cambiar las contraseñas/secretos
docker compose up -d --build
docker compose ps           # todos deben quedar "healthy"
curl localhost:8080/health  # estado del gateway y de los cinco servicios
```

- API (gateway): http://localhost:8080
- Consola RabbitMQ: http://localhost:15672 (usuario/contraseña de `.env`)
