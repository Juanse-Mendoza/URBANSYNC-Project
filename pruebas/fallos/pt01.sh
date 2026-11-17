#!/usr/bin/env bash
# PT-01: el servicio de Notificación se detiene. Los eventos NO se pierden: esperan en la cola
# durable de RabbitMQ y se procesan cuando el servicio vuelve.
set -u
source "$(dirname "$0")/comun_fallos.sh"
echo "PT-01 Caída del servicio de Notificación"

C_CIU0=$(conteo "$T_CIU"); C_ENTE0=$(conteo "$T_INFRA")
paso "1. docker compose stop notificacion"
docker compose stop notificacion >/dev/null 2>&1
peticion GET /api/notificaciones "$T_CIU"; verificar "La API de notificaciones responde 503 mientras está caído" 503

paso "2. Se crean, confirman y asignan 3 reportes con Notificación caído"
for i in 1 2 3; do
  crear_incidente infraestructura alumbrado "PT-01 poste sin luz $i"; ID=$ID_INC
  confirmar "$ID" >/dev/null
  peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID\",\"enteId\":\"$ID_INFRA\"}"
  verificar "Asignación $i creada aunque Notificación está caído" 201
done
sleep 5
EN_COLA=$(cola notificacion.eventos)
echo "        eventos esperando en la cola notificacion.eventos: $EN_COLA"
afirmar "Eventos retenidos en la cola (>= 9: 3 creados + 3 confirmados + 3 asignados)" "$(( EN_COLA >= 9 ? 1 : 0 ))" 1

paso "3. docker compose start notificacion"
docker compose start notificacion >/dev/null 2>&1; INICIO=$(ahora)
T=0; while [ $T -lt 60 ] && [ "$(cola notificacion.eventos)" != "0" ]; do sleep 1; T=$((T+1)); done
sleep 2
afirmar "Cola vaciada tras reiniciar ($(( $(ahora) - INICIO )) s)" "$(cola notificacion.eventos)" 0
afirmar "Notificaciones nuevas del ciudadano (3 confirmados + 3 asignados)" "$(( $(conteo "$T_CIU") - C_CIU0 ))" 6
afirmar "Notificaciones nuevas del ente (3 asignaciones)" "$(( $(conteo "$T_INFRA") - C_ENTE0 ))" 3
resumen
