-- Esquema del servicio de Usuario (RF-USU).
CREATE TYPE usuarios.rol_usuario AS ENUM ('ciudadano', 'supervisor', 'ente_gestion', 'admin');

CREATE TABLE usuarios.usuario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              varchar(100) NOT NULL,
  correo              varchar(150) NOT NULL UNIQUE CHECK (correo = lower(correo)),
  hash_contrasena     text NOT NULL,
  telefono            varchar(20),
  barrio              varchar(100),
  rol                 usuarios.rol_usuario NOT NULL DEFAULT 'ciudadano',
  categoria_atencion  varchar(30),            -- solo para entes de gestion
  token_recuperacion  text,                   -- hash del token de un solo uso
  token_expira        timestamptz,
  intentos_fallidos   int NOT NULL DEFAULT 0,
  bloqueado_hasta     timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuario_rol ON usuarios.usuario (rol, categoria_atencion);
