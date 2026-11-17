#!/usr/bin/env bash
# PT-04: un servicio muere abruptamente (proceso terminado). Docker lo reinicia solo gracias a
# "restart: unless-stopped" y vuelve a quedar healthy; el sistema sigue respondiendo.
set -u
source "$(dirname "$0")/comun_fallos.sh"
SERVICIO=${1:-clasificacion}
echo "PT-04 Caída abrupta del servicio $SERVICIO y reinicio automático"

CONT=$(docker compose ps -q "$SERVICIO")
REINICIOS0=$(docker inspect -f '{{.RestartCount}}' "$CONT")
paso "1. El proceso Node del servicio termina abruptamente (simula una caída)"
# Nota: "docker kill" / "docker stop" cuentan como parada MANUAL y Docker no aplica la política de
# reinicio (comportamiento documentado de Docker; verificado en evidencias/fase7). Una caída real es
# el proceso terminando por sí mismo, que es lo que se provoca aquí enviando la señal desde dentro.
PID=$(docker inspect -f '{{.State.Pid}}' "$CONT")
docker exec "$CONT" node -e "process.kill(1, 'SIGTERM')"
INICIO=$(ahora)
echo "        proceso principal (PID $PID en el host) terminado"

paso "2. Esperando el reinicio automático y el healthcheck"
T=0; while [ $T -lt 90 ]; do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null)" = "healthy" ] && [ "$(docker inspect -f '{{.RestartCount}}' "$CONT")" != "$REINICIOS0" ] && break
  sleep 1; T=$((T+1)); done
SEG=$(( $(ahora) - INICIO ))
afirmar "Docker reinició el contenedor (RestartCount $REINICIOS0 -> $(docker inspect -f '{{.RestartCount}}' "$CONT"))" "$(( $(docker inspect -f '{{.RestartCount}}' "$CONT") > REINICIOS0 ? 1 : 0 ))" 1
afirmar "El servicio volvió a healthy en ${SEG} s" "$(docker inspect -f '{{.State.Health.Status}}' "$CONT")" healthy

paso "3. El sistema responde de nuevo"
peticion GET /api/categorias "$T_CIU"; verificar "Petición a través del gateway" 200
peticion GET /health; echo "        estado general: $(campo1 "$CUERPO" estado)"
resumen
