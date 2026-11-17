-- Esquema del servicio de Notificacion (RF-NOT).
CREATE TABLE notificaciones.notificacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL,
  tipo          varchar(60) NOT NULL,
  titulo        varchar(150) NOT NULL,
  mensaje       varchar(1000) NOT NULL,
  incidente_id  uuid,
  leida         boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notificacion_usuario ON notificaciones.notificacion (usuario_id, leida, creado_en DESC);

CREATE TABLE notificaciones.eventos_procesados (
  evento_id     uuid PRIMARY KEY,
  procesado_en  timestamptz NOT NULL DEFAULT now()
);
