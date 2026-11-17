#!/usr/bin/env bash
# Verificación de la Fase 4 (Asignación + Notificación + eventos), con PC-02, PT-01, PT-03 y DLQ.
# Uso: bash pruebas/fase4.sh   (sistema levantado; tarda ~2-3 min por los reinicios)
set -u
cd "$(dirname "$0")/.."
source pruebas/lib.sh
source .env
RMQ="localhost:15672/api"
RMQ_AUTH="$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS"

# sesion correo -> deja TOKEN e ID_USUARIO
sesion() { peticion POST /api/usuarios/login "" "{\"correo\":\"$1\",\"contrasena\":\"$CLAVE_DEMO\"}"; TOKEN=$(campo1 "$CUERPO" token); ID_USUARIO=$(campo1 "$CUERPO" id); }
sesion ciudadano@urbansync.co;        T_CIU=$TOKEN
sesion supervisor@urbansync.co;       T_SUP=$TOKEN
sesion ente.infra@urbansync.co;       T_INFRA=$TOKEN; ID_INFRA=$ID_USUARIO
sesion ente.seguridad@urbansync.co;   T_SEGU=$TOKEN;  ID_SEGU=$ID_USUARIO

LAT=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", 4.55 + (r % 900) * 0.0012}')
LNG=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", -74.30 + (r % 900) * 0.0012}')

# crear_incidente categoria subcategoria titulo -> ID_INC (separados ~150 m para no subir prioridad)
N=0
crear_incidente() {
  N=$((N+1)); local plat; plat=$(awk -v b="$LAT" -v n=$N 'BEGIN{printf "%.6f", b + n*0.0015}')
  peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"$3\",\"categoria\":\"$1\",\"subcategoria\":\"$2\",\"lat\":$plat,\"lng\":$LNG}" "Idempotency-Key: $(nueva_clave)"
  ID_INC=$(campo1 "$CUERPO" id)
}
confirmar() { peticion PATCH "/api/incidentes/$1/clasificacion" "$T_SUP" '{"confirmar":true,"version":1}'; }
estado_incidente() { peticion GET "/api/incidentes/$1" "$T_SUP"; campo1 "$CUERPO" estado; }
conteo() { peticion GET /api/notificaciones/no-leidas/conteo "$1"; campoNum "$CUERPO" conteo; }
# esperar_estado id estado segundos -> espera a que el evento llegue a Clasificación
esperar_estado() { local t=0; while [ $t -lt "$3" ]; do [ "$(estado_incidente "$1")" = "$2" ] && break; sleep 1; t=$((t+1)); done; estado_incidente "$1"; }
# Mensajes en una cola, en tiempo real (la API HTTP de estadísticas tiene ~5 s de retraso)
cola() { docker compose exec -T rabbitmq rabbitmqctl list_queues -q name messages 2>/dev/null | awk -v c="$1" '$1==c{print $2}' | tr -d ''; }
sql() { docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"; }

echo "=== PF-05 Asignar un incidente confirmado a un ente (RF-ASG-01) ==="
crear_incidente infraestructura fuga_agua "Fuga de agua en la esquina"; ID_A=$ID_INC
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_A\",\"enteId\":\"$ID_INFRA\"}"
verificar "Asignar incidente aún pendiente" 409
confirmar "$ID_A"
sleep 4   # deja llegar la notificación de "confirmado" antes de tomar los conteos
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_A\",\"enteId\":\"$ID_INC\"}"
verificar "Asignar a un id que no es un ente" 400
peticion POST /api/asignaciones "$T_CIU" "{\"incidenteId\":\"$ID_A\",\"enteId\":\"$ID_INFRA\"}"
verificar "Ciudadano intenta asignar" 403
C_INFRA_0=$(conteo "$T_INFRA"); C_CIU_0=$(conteo "$T_CIU")
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_A\",\"enteId\":\"$ID_INFRA\"}"
verificar "Supervisor asigna al ente de infraestructura" 201
ASG_A=$(campo1 "$CUERPO" id)

echo; echo "=== PI-02 Evento asignacion.creada -> Clasificación cambia el estado ==="
afirmar "Estado del incidente tras el evento" "$(esperar_estado "$ID_A" asignado 10)" asignado
echo; echo "=== PI-03 / RF-NOT-03 Evento -> Notificación al ente y al ciudadano ==="
sleep 1
afirmar "Notificaciones nuevas del ente" "$(( $(conteo "$T_INFRA") - C_INFRA_0 ))" 1
afirmar "Notificaciones nuevas del ciudadano" "$(( $(conteo "$T_CIU") - C_CIU_0 ))" 1
peticion GET "/api/notificaciones?limite=1" "$T_INFRA"; verificar "Historial de notificaciones del ente" 200

echo; echo "=== RF-ASG-02 Bandeja del ente y acceso al detalle ==="
peticion GET /api/asignaciones/mias "$T_INFRA"; verificar "Mis asignaciones (ente)" 200
afirmar "La asignación aparece en su bandeja" "$(echo "$CUERPO" | grep -c "$ASG_A")" 1
peticion GET "/api/incidentes/$ID_A" "$T_INFRA"; verificar "Ente asignado ve el detalle del incidente" 200
peticion GET "/api/incidentes/$ID_A" "$T_SEGU"; verificar "Otro ente intenta ver el detalle" 403

echo; echo "=== PF-06 El ente actualiza el estado (RF-ASG-03/04) ==="
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_INFRA" '{"estado":"resuelto","comentario":"Listo","solucion":"Cambio de tubo","version":1}'
verificar "Saltar de recibido a resuelto" 409
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_SEGU" '{"estado":"en_atencion","comentario":"Voy en camino","version":1}'
verificar "Otro ente intenta actualizar" 403
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_INFRA" '{"estado":"en_atencion","comentario":"Cuadrilla en camino","version":1}'
verificar "Ente pasa a en_atencion" 200
afirmar "Estado del incidente (evento)" "$(esperar_estado "$ID_A" en_atencion 10)" en_atencion
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_INFRA" '{"estado":"resuelto","comentario":"Terminado","version":2}'
verificar "Resolver sin describir la solución" 400
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_INFRA" '{"estado":"resuelto","comentario":"Terminado","solucion":"Se cambio el tramo de tuberia","version":1}'
verificar "Resolver con versión vieja" 409
C_CIU_1=$(conteo "$T_CIU")
peticion PATCH "/api/asignaciones/$ASG_A/estado" "$T_INFRA" '{"estado":"resuelto","comentario":"Terminado","solucion":"Se cambio el tramo de tuberia","version":2}'
verificar "Ente resuelve con solución" 200
afirmar "Estado del incidente (evento)" "$(esperar_estado "$ID_A" resuelto 10)" resuelto
sleep 1
afirmar "RF-NOT-01 notificación 'resuelto' al ciudadano" "$(( $(conteo "$T_CIU") - C_CIU_1 ))" 1
peticion GET "/api/notificaciones?noLeidas=true&limite=1" "$T_CIU"
echo "        última: $(campo1 "$CUERPO" titulo) - $(campo1 "$CUERPO" mensaje)"
peticion GET "/api/incidentes/$ID_A" "$T_CIU"
echo "        historial: $(echo "$CUERPO" | grep -o '"estado_nuevo":"[a-z_]*"' | cut -d'"' -f4 | tr '\n' ' ')"

echo; echo "=== PC-02 Dos asignaciones simultáneas del mismo incidente ==="
crear_incidente seguridad zona_oscura "Calle sin luz"; ID_B=$ID_INC; confirmar "$ID_B"
for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/asignaciones" -H "Authorization: Bearer $T_SUP" \
    -H 'Content-Type: application/json' -d "{\"incidenteId\":\"$ID_B\",\"enteId\":\"$ID_SEGU\"}" > "$TMP_CUERPO.$i" &
done
wait
CODIGOS=$(cat "$TMP_CUERPO.1" "$TMP_CUERPO.2" | tr -dc '0-9\n' | sort | tr '\n' ' '); rm -f "$TMP_CUERPO".1 "$TMP_CUERPO".2
afirmar "Códigos de las dos peticiones en paralelo" "$CODIGOS" "201 409 "
afirmar "Asignaciones activas del incidente en la BD" "$(sql "SELECT count(*) FROM asignaciones.asignacion WHERE incidente_id='$ID_B' AND activa")" 1

echo; echo "=== RF-ASG-06 Reasignación y RF-ASG-05 historial ==="
ASG_B=$(sql "SELECT id FROM asignaciones.asignacion WHERE incidente_id='$ID_B' AND activa")
esperar_estado "$ID_B" asignado 10 >/dev/null
C_INFRA_1=$(conteo "$T_INFRA")
peticion PATCH "/api/asignaciones/$ASG_B/reasignar" "$T_SUP" "{\"enteId\":\"$ID_SEGU\"}"
verificar "Reasignar al mismo ente" 400
peticion PATCH "/api/asignaciones/$ASG_B/reasignar" "$T_SUP" "{\"enteId\":\"$ID_INFRA\",\"comentario\":\"Es un tema de alumbrado\"}"
verificar "Supervisor reasigna a infraestructura" 200
sleep 3
afirmar "Notificación al nuevo ente" "$(( $(conteo "$T_INFRA") - C_INFRA_1 ))" 1
peticion GET "/api/incidentes/$ID_B" "$T_INFRA"; verificar "El nuevo ente ya ve el detalle" 200
peticion GET "/api/incidentes/$ID_B" "$T_SEGU"; verificar "El ente anterior ya no lo ve" 403
peticion PATCH "/api/asignaciones/$ASG_B/estado" "$T_SEGU" '{"estado":"en_atencion","comentario":"Intento del ente anterior","version":2}'
verificar "El ente anterior intenta actualizar la asignación desactivada" 409
peticion GET "/api/asignaciones/incidente/$ID_B" "$T_SUP"; verificar "Historial de asignaciones del incidente" 200
afirmar "Asignaciones en el historial" "$(echo "$CUERPO" | grep -o '"activa":' | wc -l | tr -d ' ')" 2

echo; echo "=== RF-NOT-02 Incidente de prioridad alta -> supervisores ==="
C_SUP_0=$(conteo "$T_SUP")
crear_incidente desastre_natural arbol_caido "Arbol caido sobre la via"
afirmar "Prioridad del incidente" "$(campo1 "$CUERPO" prioridad)" alta
sleep 4
afirmar "Notificaciones nuevas del supervisor" "$(( $(conteo "$T_SUP") - C_SUP_0 ))" 1

echo; echo "=== RF-NOT-04 Marcar notificaciones como leídas ==="
peticion GET "/api/notificaciones?limite=1" "$T_CIU"; ID_NOT=$(campo1 "$CUERPO" id)
peticion PATCH "/api/notificaciones/$ID_NOT/leida" "$T_INFRA"; verificar "Marcar una notificación ajena" 404
peticion PATCH "/api/notificaciones/$ID_NOT/leida" "$T_CIU"; verificar "Marcar la propia como leída" 200
peticion PATCH /api/notificaciones/leer-todas "$T_CIU"; verificar "Marcar todas" 200
afirmar "No leídas del ciudadano" "$(conteo "$T_CIU")" 0

echo; echo "=== PT-01 Notificación detenida: los eventos esperan en la cola ==="
docker compose stop notificacion >/dev/null 2>&1; echo "        notificacion detenido"
crear_incidente infraestructura alumbrado "Poste sin luz"; ID_C=$ID_INC; confirmar "$ID_C"
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_C\",\"enteId\":\"$ID_INFRA\"}"; verificar "Asignar con Notificación caído" 201
sleep 4
EN_COLA=$(cola notificacion.eventos); echo "        mensajes esperando en notificacion.eventos: $EN_COLA"
afirmar "Hay eventos acumulados en la cola (>= 3)" "$(( EN_COLA >= 3 ? 1 : 0 ))" 1
docker compose start notificacion >/dev/null 2>&1; echo "        notificacion iniciado"
T=0; while [ $T -lt 40 ] && [ "$(cola notificacion.eventos)" != "0" ]; do sleep 2; T=$((T+2)); done
sleep 2
afirmar "Cola vaciada tras reiniciar Notificación" "$(cola notificacion.eventos)" 0
afirmar "El ciudadano recibió confirmado + asignado" "$(conteo "$T_CIU")" 2

echo; echo "=== PT-03 RabbitMQ detenido: el outbox guarda los eventos ==="
crear_incidente seguridad vandalismo "Grafitis en el salon comunal"; ID_D=$ID_INC
docker compose stop rabbitmq >/dev/null 2>&1; echo "        rabbitmq detenido"
sleep 3
confirmar "$ID_D"; verificar "Confirmar con RabbitMQ caído" 200
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_D\",\"enteId\":\"$ID_SEGU\"}"; verificar "Asignar con RabbitMQ caído" 201
sleep 3
P_ASG=$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL")
P_CLA=$(sql "SELECT count(*) FROM incidentes.outbox WHERE publicado_en IS NULL")
echo "        filas pendientes en outbox: asignaciones=$P_ASG incidentes=$P_CLA"
afirmar "Eventos retenidos en el outbox de Asignación" "$(( P_ASG >= 1 ? 1 : 0 ))" 1
afirmar "Estado del incidente aún sin el evento" "$(estado_incidente "$ID_D")" confirmado
peticion GET /health; echo "        /health asignacion: $(echo "$CUERPO" | grep -o '"asignacion":{[^}]*}')"
docker compose start rabbitmq >/dev/null 2>&1; INICIO=$(date +%s); echo "        rabbitmq iniciado"
T=0; while [ $T -lt 90 ]; do
  [ "$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL")" = "0" ] && break; sleep 2; T=$((T+2)); done
afirmar "Outbox de Asignación publicado tras reiniciar RabbitMQ ($(( $(date +%s) - INICIO )) s)" "$(sql "SELECT count(*) FROM asignaciones.outbox WHERE publicado_en IS NULL")" 0
afirmar "El evento llegó a Clasificación" "$(esperar_estado "$ID_D" asignado 30)" asignado
docker compose logs asignacion --since 3m --no-log-prefix | grep -E 'outbox|RabbitMQ' | tail -3 | cut -c1-200 | sed 's/^/        /'

echo; echo "=== DLQ: mensajes que no se pueden procesar ==="
sleep 5
DLQ0=$(cola urbansync.dlq)
publicar() { curl -s -u "$RMQ_AUTH" -H 'content-type: application/json' -X POST "$RMQ/exchanges/%2F/urbansync.eventos/publish" \
  -d "{\"properties\":{\"delivery_mode\":2},\"routing_key\":\"incidente.creado\",\"payload\":$1,\"payload_encoding\":\"string\"}" >/dev/null; }
publicar '"esto no es JSON"'
publicar "\"{\\\"eventoId\\\":\\\"$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python -c 'import uuid;print(uuid.uuid4())')\\\",\\\"tipo\\\":\\\"incidente.creado\\\",\\\"datos\\\":null}\""
sleep 6
afirmar "Mensajes nuevos en urbansync.dlq (JSON inválido + 4 fallos)" "$(( $(cola urbansync.dlq) - DLQ0 ))" 2
docker compose logs notificacion --since 20s --no-log-prefix | grep -E 'reintentará|DLQ' | cut -c1-200 | sed 's/^/        /'

resumen
