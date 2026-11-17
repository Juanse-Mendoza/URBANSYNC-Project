#!/usr/bin/env bash
# PT-02: el servicio de Ubicaciones se detiene. Los reportes se guardan igual (≤ 3 s) con prioridad
# de respaldo; el circuit breaker se abre; al volver Ubicaciones la prioridad se recalcula (≤ 60 s).
set -u
source "$(dirname "$0")/comun_fallos.sh"
echo "PT-02 Caída del servicio de Ubicaciones"

paso "1. docker compose stop ubicaciones"
docker compose stop ubicaciones >/dev/null 2>&1
IDS=(); MAX=0
for i in 1 2 3 4 5 6; do
  peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"PT-02 fuga $i\",\"categoria\":\"infraestructura\",\"subcategoria\":\"fuga_agua\",\"lat\":$LAT_BASE,\"lng\":-74.26}" "Idempotency-Key: $(nueva_clave)"
  IDS+=("$(campo1 "$CUERPO" id)")
  echo "        reporte $i -> HTTP $CODIGO en $TIEMPO s, prioridad=$(campo1 "$CUERPO" prioridad), origen=$(campo1 "$CUERPO" prioridad_origen)"
  MAX=$(awk -v a="$MAX" -v b="$TIEMPO" 'BEGIN{print (b>a)?b:a}')
  [ "$CODIGO" = 201 ] || FALLOS=$((FALLOS+1))
done
LISTA=$(IFS=,; echo "${IDS[*]}" | sed "s/,/','/g")   # id1','id2','... (va dentro de IN ('...'))
afirmar "Los 6 reportes se guardaron (201) con origen respaldo" "$(sql "SELECT count(*) FROM incidentes.incidente WHERE id IN ('$LISTA') AND prioridad_origen='respaldo'")" 6
afirmar "Tiempo máximo de respuesta <= 3 s ($MAX s)" "$(awk -v t="$MAX" 'BEGIN{print (t<=3)?1:0}')" 1
echo "        log del circuit breaker:"
docker compose logs clasificacion --since 1m --no-log-prefix | grep -a 'cerrado -> abierto' | tail -1 | cut -c1-200 | sed 's/^/        /'

paso "2. docker compose start ubicaciones"
docker compose start ubicaciones >/dev/null 2>&1; INICIO=$(ahora)
T=0; while [ $T -lt 90 ]; do
  [ "$(sql "SELECT count(*) FROM incidentes.incidente WHERE id='${IDS[5]}' AND NOT recalcular_prioridad")" = "1" ] && break
  sleep 2; T=$((T+2)); done
SEG=$(( $(ahora) - INICIO ))
afirmar "Prioridades recalculadas tras reiniciar Ubicaciones ($SEG s)" "$(sql "SELECT count(*) FROM incidentes.incidente WHERE id IN ('$LISTA') AND NOT recalcular_prioridad")" 6
afirmar "Recálculo en <= 60 s" "$(( SEG <= 60 ? 1 : 0 ))" 1
echo "        prioridades finales: $(sql "SELECT string_agg(prioridad::text, ' ' ORDER BY creado_en) FROM incidentes.incidente WHERE id IN ('$LISTA')")"
resumen
