-- Esquema del servicio de Clasificacion (RF-CLA).
CREATE TYPE incidentes.nivel_prioridad  AS ENUM ('baja', 'media', 'alta');
CREATE TYPE incidentes.origen_prioridad AS ENUM ('automatica', 'respaldo', 'supervisor');
CREATE TYPE incidentes.estado_incidente AS ENUM ('pendiente', 'confirmado', 'asignado', 'en_atencion', 'resuelto');

CREATE TABLE incidentes.categoria (
  codigo          varchar(30) PRIMARY KEY,
  nombre          varchar(100) NOT NULL,
  prioridad_base  incidentes.nivel_prioridad NOT NULL
);

CREATE TABLE incidentes.subcategoria (
  codigo     varchar(30) PRIMARY KEY,
  categoria  varchar(30) NOT NULL REFERENCES incidentes.categoria (codigo),
  nombre     varchar(100) NOT NULL
);

INSERT INTO incidentes.categoria (codigo, nombre, prioridad_base) VALUES
  ('infraestructura',  'Infraestructura',  'baja'),
  ('seguridad',        'Seguridad',        'media'),
  ('desastre_natural', 'Desastre natural', 'alta');

INSERT INTO incidentes.subcategoria (codigo, categoria, nombre) VALUES
  ('fuga_agua',     'infraestructura',  'Fuga de agua'),
  ('hueco_via',     'infraestructura',  'Hueco en la vía'),
  ('alumbrado',     'infraestructura',  'Alumbrado público'),
  ('robo',          'seguridad',        'Robo'),
  ('zona_oscura',   'seguridad',        'Zona oscura'),
  ('vandalismo',    'seguridad',        'Vandalismo'),
  ('inundacion',    'desastre_natural', 'Inundación'),
  ('deslizamiento', 'desastre_natural', 'Deslizamiento'),
  ('arbol_caido',   'desastre_natural', 'Árbol caído');

CREATE TABLE incidentes.incidente (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciudadano_id          uuid NOT NULL,      -- referencia logica a usuarios.usuario (sin FK entre servicios)
  titulo                varchar(120) NOT NULL,
  descripcion           varchar(1000),
  categoria             varchar(30) NOT NULL REFERENCES incidentes.categoria (codigo),
  subcategoria          varchar(30) REFERENCES incidentes.subcategoria (codigo),
  foto_url              text,               -- fuera del MVP (DECISIONES.md #3)
  prioridad             incidentes.nivel_prioridad NOT NULL,
  prioridad_origen      incidentes.origen_prioridad NOT NULL DEFAULT 'automatica',
  recalcular_prioridad  boolean NOT NULL DEFAULT false,
  estado                incidentes.estado_incidente NOT NULL DEFAULT 'pendiente',
  lat                   double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                   double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radio_m               int NOT NULL DEFAULT 50 CHECK (radio_m BETWEEN 25 AND 200),
  idempotency_key       varchar(64) NOT NULL,
  version               int NOT NULL DEFAULT 1,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_incidente_idempotencia UNIQUE (ciudadano_id, idempotency_key)
);

CREATE INDEX idx_incidente_ciudadano ON incidentes.incidente (ciudadano_id, creado_en DESC);
CREATE INDEX idx_incidente_filtros   ON incidentes.incidente (estado, prioridad, categoria, creado_en DESC);
CREATE INDEX idx_incidente_recalculo ON incidentes.incidente (creado_en) WHERE recalcular_prioridad;

CREATE TABLE incidentes.historial_estado (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id     uuid NOT NULL REFERENCES incidentes.incidente (id),
  estado_anterior  incidentes.estado_incidente,
  estado_nuevo     incidentes.estado_incidente NOT NULL,
  actor_id         uuid,
  comentario       varchar(1000),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historial_incidente ON incidentes.historial_estado (incidente_id, creado_en);

-- Patron outbox: el evento se guarda en la misma transaccion que el cambio de negocio.
CREATE TABLE incidentes.outbox (
  id            uuid PRIMARY KEY,           -- = eventoId del sobre
  tipo          varchar(60) NOT NULL,
  payload       jsonb NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  publicado_en  timestamptz,
  intentos      int NOT NULL DEFAULT 0
);
CREATE INDEX idx_outbox_pendientes ON incidentes.outbox (creado_en) WHERE publicado_en IS NULL;

-- Idempotencia de consumidores.
CREATE TABLE incidentes.eventos_procesados (
  evento_id     uuid PRIMARY KEY,
  procesado_en  timestamptz NOT NULL DEFAULT now()
);
