-- Extensiones y un esquema por microservicio (DECISIONES.md #1).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS usuarios;
CREATE SCHEMA IF NOT EXISTS incidentes;
CREATE SCHEMA IF NOT EXISTS ubicaciones;
CREATE SCHEMA IF NOT EXISTS asignaciones;
CREATE SCHEMA IF NOT EXISTS notificaciones;
