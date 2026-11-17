#!/usr/bin/env bash
# PT-03: el broker RabbitMQ se detiene. Las operaciones siguen funcionando; los eventos quedan en
# el outbox de cada servicio y se publican automáticamente cuando el broker vuelve.
set -u
source "$(dirname "$0")/comun_fallos.sh"
echo "PT-03 Caída del broker RabbitMQ"

crear_incidente infraestructura hueco_via "PT-03 hueco en la via"; ID=$ID_INC
C_ENTE0=$(conteo "$T_INFRA")
paso "1. docker compose stop rabbitmq"
docker compose stop rabbitmq >/dev/null 2>&1; sleep 3
confirmar "$ID"; verificar "Confirmar con RabbitMQ caído" 200
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID\",\"enteId\":\"$ID_INFRA\"}"; verificar "Asignar con RabbitMQ caído" 201
sleep 3
P_ASG=$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL")
P_CLA=$(sql "SELECT count(*) FROM incidentes.outbox WHERE publicado_en IS NULL")
echo "        eventos retenidos en outbox: asignaciones=$P_ASG, incidentes=$P_CLA"
afirmar "Hay eventos retenidos en los outbox" "$(( P_ASG + P_CLA >= 2 ? 1 : 0 ))" 1
peticion GET /health; echo "        /health: $(echo "$CUERPO" | grep -o '"asignacion":{[^}]*}')"

paso "2. docker compose start rabbitmq"
docker compose start rabbitmq >/dev/null 2>&1; INICIO=$(ahora)
T=0; while [ $T -lt 120 ]; do
  [ "$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL") $(sql "SELECT count(*) FROM incidentes.outbox WHERE publicado_en IS NULL")" = "0 0" ] && break
  sleep 2; T=$((T+2)); done
afirmar "Outbox publicado tras reiniciar RabbitMQ ($(( $(ahora) - INICIO )) s)" "$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL")" 0
afirmar "El evento llegó a Clasificación (estado del incidente)" "$(esperar_estado "$ID" asignado 30)" asignado
sleep 3
afirmar "El evento llegó a Notificación (aviso al ente)" "$(( $(conteo "$T_INFRA") - C_ENTE0 ))" 1
resumen
