#!/usr/bin/env bash
# Utilidades compartidas por las pruebas de tolerancia a fallos PT-01..PT-04.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
source pruebas/lib.sh
source .env

sesion() { peticion POST /api/usuarios/login "" "{\"correo\":\"$1\",\"contrasena\":\"$CLAVE_DEMO\"}"; TOKEN=$(campo1 "$CUERPO" token); ID_USUARIO=$(campo1 "$CUERPO" id); }
sql() { docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" | tr -d '\r'; }
cola() { docker compose exec -T rabbitmq rabbitmqctl list_queues -q name messages 2>/dev/null | awk -v c="$1" '$1==c{print $2}' | tr -d '\r'; }
conteo() { peticion GET /api/notificaciones/no-leidas/conteo "$1"; campoNum "$CUERPO" conteo; }
estado_incidente() { peticion GET "/api/incidentes/$1" "$T_SUP"; campo1 "$CUERPO" estado; }
esperar_estado() { local t=0; while [ $t -lt "$3" ]; do [ "$(estado_incidente "$1")" = "$2" ] && break; sleep 1; t=$((t+1)); done; estado_incidente "$1"; }
ahora() { date +%s; }
paso() { echo; echo "---- $*"; }

LAT_BASE=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", 4.50 + (r % 900) * 0.0013}')
N_INC=0
# crear_incidente categoria subcategoria titulo -> ID_INC
crear_incidente() {
  N_INC=$((N_INC+1))
  local plat; plat=$(awk -v b="$LAT_BASE" -v n=$N_INC 'BEGIN{printf "%.6f", b + n*0.0015}')
  peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"$3\",\"categoria\":\"$1\",\"subcategoria\":\"$2\",\"lat\":$plat,\"lng\":-74.25}" "Idempotency-Key: $(nueva_clave)"
  ID_INC=$(campo1 "$CUERPO" id)
}
confirmar() { peticion PATCH "/api/incidentes/$1/clasificacion" "$T_SUP" '{"confirmar":true,"version":1}'; }

sesion ciudadano@urbansync.co;      T_CIU=$TOKEN
sesion supervisor@urbansync.co;     T_SUP=$TOKEN
sesion ente.infra@urbansync.co;     T_INFRA=$TOKEN; ID_INFRA=$ID_USUARIO
