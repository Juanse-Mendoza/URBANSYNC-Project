-- Esquema del servicio de Ubicaciones (RF-UBI).
CREATE TABLE ubicaciones.ubicacion (
  incidente_id  uuid PRIMARY KEY,
  categoria     varchar(30) NOT NULL,
  punto         geography(Point, 4326) NOT NULL,
  radio_m       int NOT NULL DEFAULT 50 CHECK (radio_m BETWEEN 25 AND 200),
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ubicacion_punto     ON ubicaciones.ubicacion USING GIST (punto);
CREATE INDEX idx_ubicacion_categoria ON ubicaciones.ubicacion (categoria, creado_en);
