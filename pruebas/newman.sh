#!/usr/bin/env bash
# Ejecuta la colección Postman con newman (dentro de node:20-alpine, sin instalar Node).
# Uso: bash pruebas/newman.sh        -> guarda el reporte JSON en evidencias/fase5/newman.json
set -u
cd "$(dirname "$0")/.."
RAIZ="$(pwd -W 2>/dev/null || pwd)"
# Desde un contenedor, el host es host.docker.internal (Docker Desktop en Windows/Mac).
BASE="${BASE_URL:-http://host.docker.internal:8080}"
mkdir -p evidencias/fase5
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$RAIZ/pruebas/postman:/coleccion:ro" \
  -v "$RAIZ/evidencias/fase5:/salida" \
  -v urbansync_npm_cache:/root/.npm \
  --add-host=host.docker.internal:host-gateway \
  node:20-alpine sh -c "npx -y newman@6 run /coleccion/urbansync.postman_collection.json \
    --env-var baseUrl=$BASE --color off -r cli,json --reporter-json-export /salida/newman.json"
