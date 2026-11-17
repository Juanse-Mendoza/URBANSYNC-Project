-- Esquema del servicio de Asignacion (RF-ASG).
CREATE TYPE asignaciones.estado_asignacion AS ENUM ('recibido', 'en_atencion', 'resuelto', 'reasignado');

CREATE TABLE asignaciones.asignacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id    uuid NOT NULL,
  ciudadano_id    uuid NOT NULL,
  ente_id         uuid NOT NULL,
  supervisor_id   uuid NOT NULL,
  estado          asignaciones.estado_asignacion NOT NULL DEFAULT 'recibido',
  activa          boolean NOT NULL DEFAULT true,
  solucion        varchar(1000),
  version         int NOT NULL DEFAULT 1,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Solo puede existir UNA asignacion activa por incidente (PC-02 -> 409).
CREATE UNIQUE INDEX uq_asignacion_activa ON asignaciones.asignacion (incidente_id) WHERE activa;
CREATE INDEX idx_asignacion_ente ON asignaciones.asignacion (ente_id, activa, creado_en DESC);

CREATE TABLE asignaciones.seguimiento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id  uuid NOT NULL REFERENCES asignaciones.asignacion (id),
  estado         asignaciones.estado_asignacion NOT NULL,
  comentario     varchar(1000),
  actor_id       uuid,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seguimiento_asignacion ON asignaciones.seguimiento (asignacion_id, creado_en);

CREATE TABLE asignaciones.outbox (
  id            uuid PRIMARY KEY,
  tipo          varchar(60) NOT NULL,
  payload       jsonb NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  publicado_en  timestamptz,
  intentos      int NOT NULL DEFAULT 0
);
CREATE INDEX idx_outbox_pendientes ON asignaciones.outbox (creado_en) WHERE publicado_en IS NULL;
