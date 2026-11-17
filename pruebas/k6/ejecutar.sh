#!/usr/bin/env bash
# Ejecuta las pruebas de carga con k6 (en Docker) y guarda los resultados en evidencias/fase7.
#
# Las VUs salen todas de la misma IP, así que el rate limit del gateway (100/min, 10/min en login)
# las bloquearía. Durante la prueba se recrea el gateway con límites altos y al final se restaura
# (DECISIONES.md #19).
# Uso: bash pruebas/k6/ejecutar.sh            (ambas pruebas)
#      bash pruebas/k6/ejecutar.sh mapa       (solo PR-02)
set -u
cd "$(dirname "$0")/../.."
RAIZ="$(pwd -W 2>/dev/null || pwd)"
# k6 corre DENTRO de la red de Docker y llama directo al gateway: así se mide el sistema y no el
# reenvío de puertos de Docker Desktop en Windows (que con 50 VUs pierde conexiones).
RED="${RED_DOCKER:-urbansync_urbansync}"
BASE="${BASE_URL:-http://gateway:8080}"
SALIDA=evidencias/fase7
mkdir -p "$SALIDA"

echo ">> Subiendo temporalmente el rate limit del gateway para la prueba de carga"
RATE_LIMIT_GENERAL=1000000 RATE_LIMIT_LOGIN=100000 docker compose up -d gateway >/dev/null 2>&1
until curl -sf localhost:8080/health >/dev/null; do sleep 1; done

correr() { # correr archivo nombre
  echo; echo "=============== k6: $2 ==============="
  MSYS_NO_PATHCONV=1 docker run --rm -i \
    --network "$RED" \
    -e BASE_URL="$BASE" \
    -v "$RAIZ/$SALIDA:/salida" \
    grafana/k6:0.57.0 run --summary-export "/salida/$2.json" - < "pruebas/k6/$1" 2>&1 \
    | grep -av '^running (\|^crear_incidentes \|^mapa ' | tee "$SALIDA/$2.txt"
  return "${PIPESTATUS[0]}"
}

R=0
if [ "${1:-}" != "mapa" ]; then correr carga_incidentes.js k6_carga_incidentes || R=1; fi
correr carga_mapa.js k6_carga_mapa || R=1

echo; echo ">> Restaurando el rate limit normal del gateway (.env)"
docker compose up -d gateway >/dev/null 2>&1
exit $R
