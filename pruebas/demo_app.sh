#!/usr/bin/env bash
# Ayudante para la demo de la app: ejecuta desde el PC las acciones de los OTROS roles
# mientras el celular está abierto con un usuario, para ver llegar las notificaciones.
#
# Uso:
#   bash pruebas/demo_app.sh crear [categoria]      # el ciudadano demo crea un reporte
#   bash pruebas/demo_app.sh asignar [correo]       # el supervisor confirma y asigna el último reporte
#                                                   #   del ciudadano (por defecto ciudadano@urbansync.co)
#   bash pruebas/demo_app.sh atender [categoria]    # el ente avanza su última asignación un paso
#                                                   #   (recibido -> en_atencion -> resuelto)
# categoria: infraestructura (por defecto) | seguridad | desastre_natural
set -u
cd "$(dirname "$0")/.."
source pruebas/lib.sh

declare -A ENTE=([infraestructura]=ente.infra@urbansync.co [seguridad]=ente.seguridad@urbansync.co [desastre_natural]=ente.emergencias@urbansync.co)
declare -A SUB=([infraestructura]=hueco_via [seguridad]=zona_oscura [desastre_natural]=arbol_caido)

case "${1:-}" in
  crear)
    CAT=${2:-infraestructura}
    T=$(login ciudadano@urbansync.co)
    LAT=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", 4.60 + (r % 200) * 0.0004}')
    peticion POST /api/incidentes "$T" "{\"titulo\":\"Reporte de demostracion ($CAT)\",\"categoria\":\"$CAT\",\"subcategoria\":\"${SUB[$CAT]}\",\"lat\":$LAT,\"lng\":-74.0817}" "Idempotency-Key: $(nueva_clave)"
    verificar "Ciudadano demo crea un reporte de $CAT" 201
    ;;
  asignar)
    # Toma el reporte MÁS RECIENTE del ciudadano (el que se acaba de crear en el celular).
    CIU=${2:-ciudadano@urbansync.co}
    TC=$(login "$CIU")
    peticion GET "/api/incidentes/mios?limite=1" "$TC"
    ID=$(campo1 "$CUERPO" id)
    [ -z "$ID" ] && { echo "$CIU no tiene reportes. Crea uno desde la app o con: bash pruebas/demo_app.sh crear"; exit 1; }
    T=$(login supervisor@urbansync.co)
    peticion GET "/api/incidentes/$ID" "$T"
    CAT=$(campo1 "$CUERPO" categoria); VER=$(campoNum "$CUERPO" version); EST=$(campo1 "$CUERPO" estado)
    [ "$EST" != "pendiente" ] && { echo "El último reporte de $CIU ya está en estado '$EST'. Crea uno nuevo."; exit 1; }
    echo "Último reporte de $CIU: $ID ($CAT)"
    peticion PATCH "/api/incidentes/$ID/clasificacion" "$T" "{\"confirmar\":true,\"comentario\":\"Confirmado en la demo\",\"version\":$VER}"
    verificar "Supervisor confirma" 200
    peticion POST /api/usuarios/login "" "{\"correo\":\"${ENTE[$CAT]}\",\"contrasena\":\"$CLAVE_DEMO\"}"
    ID_ENTE=$(campo1 "$CUERPO" id)
    peticion POST /api/asignaciones "$T" "{\"incidenteId\":\"$ID\",\"enteId\":\"$ID_ENTE\"}"
    verificar "Supervisor asigna a ${ENTE[$CAT]}" 201
    echo "En máximo ~30 s llegan las notificaciones (al ciudadano y al ente)."
    ;;
  atender)
    CAT=${2:-infraestructura}
    T=$(login "${ENTE[$CAT]}")
    peticion GET "/api/asignaciones/mias?limite=1" "$T"
    ID=$(campo1 "$CUERPO" id); EST=$(campo1 "$CUERPO" estado); VER=$(campoNum "$CUERPO" version)
    case "$EST" in
      recibido) peticion PATCH "/api/asignaciones/$ID/estado" "$T" "{\"estado\":\"en_atencion\",\"comentario\":\"La cuadrilla va en camino\",\"version\":$VER}"
                verificar "Ente pasa a en_atencion" 200 ;;
      en_atencion) peticion PATCH "/api/asignaciones/$ID/estado" "$T" "{\"estado\":\"resuelto\",\"comentario\":\"Trabajo terminado\",\"solucion\":\"Se reparo el dano reportado\",\"version\":$VER}"
                   verificar "Ente marca como resuelto" 200 ;;
      *) echo "El ente ${ENTE[$CAT]} no tiene asignaciones pendientes (estado: ${EST:-ninguna}). Usa primero: asignar"; exit 1 ;;
    esac
    echo "En máximo ~30 s le llega la notificación al ciudadano."
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
