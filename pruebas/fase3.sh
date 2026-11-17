#!/usr/bin/env bash
# Verificación de la Fase 3 (Ubicaciones + Clasificación), incluida la prueba de fallo PT-02.
# Uso: bash pruebas/fase3.sh   (sistema levantado; tarda ~1.5 min por la espera del recálculo)
set -u
cd "$(dirname "$0")/.."
source pruebas/lib.sh
source .env

T_CIU=$(login ciudadano@urbansync.co)
T_SUP=$(login supervisor@urbansync.co)

# Zona aleatoria (separada >100 m de corridas anteriores) alrededor de Bogotá (4.6097, -74.0817)
LAT=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", 4.55 + (r % 900) * 0.0012}')
LNG=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", -74.12 + (r % 900) * 0.0012}')
echo "Zona de prueba: $LAT, $LNG"

echo; echo "=== RF-CLA-02 Categorías ==="
peticion GET /api/categorias "$T_CIU"; verificar "GET /api/categorias" 200

echo; echo "=== PF-03 Crear incidente ==="
peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Robo en el parque\",\"categoria\":\"seguridad\",\"subcategoria\":\"robo\",\"lat\":$LAT,\"lng\":$LNG}"
verificar "Sin encabezado Idempotency-Key" 400
CLAVE=$(nueva_clave)
CUERPO_SEG="{\"titulo\":\"Robo en el parque\",\"descripcion\":\"Robaron un celular\",\"categoria\":\"seguridad\",\"subcategoria\":\"robo\",\"lat\":$LAT,\"lng\":$LNG,\"radio_m\":80}"
peticion POST /api/incidentes "$T_CIU" "$CUERPO_SEG" "Idempotency-Key: $CLAVE"
verificar "Crear incidente de seguridad" 201
ID_SEG=$(campo1 "$CUERPO" id)
afirmar "Estado inicial" "$(campo1 "$CUERPO" estado)" pendiente
afirmar "Prioridad (seguridad, 1 reporte)" "$(campo1 "$CUERPO" prioridad)" media
afirmar "Tiempo de respuesta <= 3 s" "$(awk -v t="$TIEMPO" 'BEGIN{print (t<=3)?"si":"no"}')" si

echo; echo "=== PC-03 Idempotencia (misma Idempotency-Key) ==="
peticion POST /api/incidentes "$T_CIU" "$CUERPO_SEG" "Idempotency-Key: $CLAVE"
verificar "Reenvío con la misma clave" 200
afirmar "Devuelve el mismo incidente" "$(campo1 "$CUERPO" id)" "$ID_SEG"

echo; echo "=== Validaciones ==="
peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Hueco\",\"categoria\":\"infraestructura\",\"subcategoria\":\"robo\",\"lat\":$LAT,\"lng\":$LNG}" "Idempotency-Key: $(nueva_clave)"
verificar "Subcategoría de otra categoría" 400
peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Hueco\",\"categoria\":\"infraestructura\",\"lat\":$LAT,\"lng\":$LNG,\"radio_m\":500}" "Idempotency-Key: $(nueva_clave)"
verificar "Radio fuera de 25-200 m" 400
peticion POST /api/incidentes "$T_SUP" "$CUERPO_SEG" "Idempotency-Key: $(nueva_clave)"
verificar "Supervisor intenta crear un reporte" 403

echo; echo "=== PF-04 Cinco reportes de infraestructura a menos de 50 m ==="
ESPERADAS=(baja media media media alta)
IDS_INFRA=()
for i in 0 1 2 3 4; do
  # cada punto a ~5 m del anterior (0.00004 grados de latitud ≈ 4.4 m)
  PLAT=$(awk -v b="$LAT" -v i=$i 'BEGIN{printf "%.6f", b + 0.0003 + i*0.00004}')
  peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Hueco en la via $((i+1))\",\"categoria\":\"infraestructura\",\"subcategoria\":\"hueco_via\",\"lat\":$PLAT,\"lng\":$LNG}" "Idempotency-Key: $(nueva_clave)"
  IDS_INFRA+=("$(campo1 "$CUERPO" id)")
  afirmar "Reporte $((i+1)) -> HTTP $CODIGO, prioridad" "$(campo1 "$CUERPO" prioridad)" "${ESPERADAS[$i]}"
done

echo; echo "=== RF-CLA-07 / RF-CLA-04 Listados ==="
peticion GET "/api/incidentes/mios?limite=5" "$T_CIU"; verificar "Mis reportes (ciudadano)" 200
peticion GET "/api/incidentes?prioridad=alta&categoria=infraestructura&estado=pendiente" "$T_SUP"; verificar "Bandeja del supervisor con filtros" 200

echo; echo "=== Detalle y autorización por propiedad (OWASP API1) ==="
peticion GET "/api/incidentes/$ID_SEG" "$T_CIU"; verificar "Dueño ve su incidente con historial" 200
CORREO_OTRO="otro.$(date +%s)@correo.co"
peticion POST /api/usuarios/registro "" "{\"nombre\":\"Otro Vecino\",\"correo\":\"$CORREO_OTRO\",\"contrasena\":\"Clave2026\",\"telefono\":\"3200000000\"}"
T_OTRO=$(login "$CORREO_OTRO" Clave2026)
peticion GET "/api/incidentes/$ID_SEG" "$T_OTRO"; verificar "Otro ciudadano intenta ver el incidente" 403
peticion GET "/api/incidentes/$ID_SEG" "$T_SUP"; verificar "Supervisor ve el detalle" 200
peticion GET "/api/incidentes/00000000-0000-4000-8000-000000000000" "$T_SUP"; verificar "Incidente inexistente" 404

echo; echo "=== RF-CLA-05 Confirmación con control de versión ==="
peticion PATCH "/api/incidentes/$ID_SEG/clasificacion" "$T_SUP" '{"confirmar":true,"prioridad":"alta","comentario":"Zona con reportes previos","version":1}'
verificar "Supervisor confirma y sube prioridad (version 1)" 200
afirmar "Estado" "$(campo1 "$CUERPO" estado)" confirmado
afirmar "Origen de prioridad" "$(campo1 "$CUERPO" prioridad_origen)" supervisor
afirmar "Nueva versión" "$(campoNum "$CUERPO" version)" 2
peticion PATCH "/api/incidentes/$ID_SEG/clasificacion" "$T_SUP" '{"prioridad":"baja","version":1}'
verificar "Segundo supervisor con versión vieja (1)" 409

echo; echo "=== RF-UBI-03/04/02 Mapa, similares y radio ==="
peticion GET "/api/ubicaciones/mapa?lat=$LAT&lng=$LNG&radio_m=500" "$T_CIU"; verificar "Mapa alrededor de la zona" 200
afirmar "Puntos en el mapa (1 seguridad + 5 infraestructura)" "$(campoNum "$CUERPO" total)" 6
peticion GET "/api/ubicaciones/mapa?lat=$LAT&lng=$LNG&radio_m=500&categoria=infraestructura" "$T_CIU"
afirmar "Mapa filtrado por infraestructura" "$(campoNum "$CUERPO" total)" 5
peticion GET "/api/ubicaciones/${IDS_INFRA[4]}/similares" "$T_SUP"; verificar "Similares del 5.º reporte" 200
afirmar "Reportes cercanos de la misma categoría" "$(campoNum "$CUERPO" total)" 4
peticion PATCH "/api/ubicaciones/${IDS_INFRA[4]}/radio" "$T_SUP" '{"radio_m":120}'; verificar "Supervisor ajusta el radio a 120 m" 200
peticion GET "/api/ubicaciones/mapa?lat=$LAT&lng=500" "$T_CIU"; verificar "Mapa con longitud inválida" 400

echo; echo "=== Evento incidente.creado en RabbitMQ (outbox) ==="
sleep 3
COLA=$(curl -s -u "$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS" "localhost:15672/api/queues/%2F/notificacion.eventos")
echo "        mensajes en notificacion.eventos: $(campoNum "$COLA" messages)"
MSG=$(curl -s -u "$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS" -H 'content-type: application/json' \
  -X POST "localhost:15672/api/queues/%2F/notificacion.eventos/get" -d '{"count":1,"ackmode":"ack_requeue_true","encoding":"auto"}')
echo "        $MSG" | grep -o '"payload":"[^}]*}' | head -1 | cut -c1-240
afirmar "Hay un evento incidente.creado en la cola" "$(echo "$MSG" | grep -c 'incidente.creado')" 1
PEND=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM incidentes.outbox WHERE publicado_en IS NULL")
afirmar "Filas del outbox sin publicar" "$PEND" 0

echo; echo "=== PT-02 Ubicaciones caído: prioridad de respaldo y recálculo ==="
docker compose stop ubicaciones >/dev/null 2>&1
echo "        ubicaciones detenido"
IDS_RESPALDO=()
for i in 1 2 3 4 5 6; do
  peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Fuga de agua $i\",\"categoria\":\"infraestructura\",\"subcategoria\":\"fuga_agua\",\"lat\":$(awk -v b="$LAT" 'BEGIN{printf "%.6f", b - 0.0006}'),\"lng\":$LNG}" "Idempotency-Key: $(nueva_clave)"
  IDS_RESPALDO+=("$(campo1 "$CUERPO" id)")
  echo "        reporte $i -> HTTP $CODIGO en $TIEMPO s, prioridad=$(campo1 "$CUERPO" prioridad), origen=$(campo1 "$CUERPO" prioridad_origen), recalcular=$(campoNum "$CUERPO" recalcular_prioridad)"
  [ "$i" = 1 ] && { verificar "Crear con Ubicaciones caído" 201; afirmar "Respuesta <= 3 s" "$(awk -v t="$TIEMPO" 'BEGIN{print (t<=3)?"si":"no"}')" si; afirmar "Origen" "$(campo1 "$CUERPO" prioridad_origen)" respaldo; }
done
echo "        log del circuit breaker:"
docker compose logs clasificacion --since 1m --no-log-prefix | grep -i 'circuit breaker' | tail -2 | cut -c1-240 | sed 's/^/        /'

docker compose start ubicaciones >/dev/null 2>&1
INICIO=$(date +%s)
echo "        ubicaciones iniciado; esperando el recálculo (máx. 75 s)..."
RECALC="true"
while [ $(( $(date +%s) - INICIO )) -lt 75 ]; do
  sleep 5
  peticion GET "/api/incidentes/${IDS_RESPALDO[5]}" "$T_SUP"   # el último en recalcularse
  RECALC=$(campoNum "$CUERPO" recalcular_prioridad)
  [ "$RECALC" = "false" ] && break
done
SEG=$(( $(date +%s) - INICIO ))
afirmar "Recalculado tras reiniciar Ubicaciones (recalcular_prioridad)" "$RECALC" false
afirmar "Tiempo hasta el recálculo <= 60 s ($SEG s)" "$(( SEG <= 60 ? 1 : 0 ))" 1
afirmar "Origen tras el recálculo" "$(campo1 "$CUERPO" prioridad_origen)" automatica
# Se recalculan en orden de creación: cada uno cuenta los similares existentes en ese momento.
afirmar "6.º reporte recalculado (6 similares)" "$(campo1 "$CUERPO" prioridad)" alta
peticion GET "/api/incidentes/${IDS_RESPALDO[0]}" "$T_SUP"
afirmar "1.er reporte recalculado (1 similar)" "$(campo1 "$CUERPO" prioridad)" baja
docker compose logs clasificacion --since 2m --no-log-prefix | grep 'Prioridad recalculada' | tail -3 | cut -c1-200 | sed 's/^/        /'

resumen
