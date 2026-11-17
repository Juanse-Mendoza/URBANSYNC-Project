#!/usr/bin/env bash
# Ejecuta "npm test" (Jest + Supertest) de comun, gateway y los cinco servicios dentro de un
# contenedor node:20-alpine. No requiere Node instalado en el equipo.
# Uso: bash pruebas/tests_unitarios.sh
set -u
cd "$(dirname "$0")/.."
RAIZ="$(pwd -W 2>/dev/null || pwd)"   # ruta compatible con Docker Desktop en Windows

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$RAIZ:/repo:ro" \
  -v urbansync_npm_cache:/root/.npm \
  node:20-alpine sh -c '
    set -u
    mkdir -p /t && cd /repo && cp -r comun gateway servicios /t/ && cd /t
    FALLOS=0
    for p in comun gateway servicios/usuario servicios/clasificacion servicios/ubicaciones servicios/asignacion servicios/notificacion; do
      echo
      echo "================ $p ================"
      (cd /t/$p && npm install --no-audit --no-fund --loglevel=error >/dev/null 2>&1 && npx jest --colors=false 2>&1) || FALLOS=$((FALLOS+1))
    done
    echo
    if [ "$FALLOS" -eq 0 ]; then echo "TODOS LOS PAQUETES PASARON"; else echo "PAQUETES CON FALLOS: $FALLOS"; fi
    exit $FALLOS
  '
