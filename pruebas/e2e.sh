#!/usr/bin/env bash
# Flujo completo de URBANSYNC con curl: ciudadano -> supervisor -> ente -> ciudadano.
# Uso: bash pruebas/e2e.sh   (BASE_URL=http://host:8080 para otro destino)
set -u
cd "$(dirname "$0")/.."
source pruebas/lib.sh

paso() { echo; echo "---- Paso $1: $2"; }
mostrar() { echo "     $1"; }

paso 1 "El sistema está arriba (GET /health)"
peticion GET /health; verificar "Gateway y servicios" 200
mostrar "estado general: $(campo1 "$CUERPO" estado)"

paso 2 "Un vecino se registra (PF-01)"
CORREO="vecino.$(date +%s)@correo.co"
peticion POST /api/usuarios/registro "" "{\"nombre\":\"Laura Gomez\",\"correo\":\"$CORREO\",\"contrasena\":\"Clave2026\",\"telefono\":\"3115550000\",\"barrio\":\"Teusaquillo\"}"
verificar "Registro" 201

paso 3 "El vecino inicia sesión (PF-02)"
peticion POST /api/usuarios/login "" "{\"correo\":\"$CORREO\",\"contrasena\":\"Clave2026\"}"
verificar "Login ciudadano" 200
T_CIU=$(campo1 "$CUERPO" token); mostrar "rol: $(campo1 "$CUERPO" rol)"

paso 4 "La app carga las categorías"
peticion GET /api/categorias "$T_CIU"; verificar "Categorías" 200

paso 5 "El vecino reporta un hueco en la vía (PF-03)"
LAT=$(awk -v r=$RANDOM 'BEGIN{printf "%.6f", 4.60 + (r % 500) * 0.0011}')
peticion POST /api/incidentes "$T_CIU" "{\"titulo\":\"Hueco profundo frente al colegio\",\"descripcion\":\"Ya se cayeron dos motos\",\"categoria\":\"infraestructura\",\"subcategoria\":\"hueco_via\",\"lat\":$LAT,\"lng\":-74.0817,\"radio_m\":40}" "Idempotency-Key: $(nueva_clave)"
verificar "Crear incidente" 201
ID_INC=$(campo1 "$CUERPO" id)
mostrar "incidente $ID_INC: estado=$(campo1 "$CUERPO" estado), prioridad=$(campo1 "$CUERPO" prioridad) ($(campo1 "$CUERPO" prioridad_origen))"

paso 6 "El vecino ve sus reportes"
peticion GET /api/incidentes/mios "$T_CIU"; verificar "Mis reportes" 200

paso 7 "El supervisor revisa la bandeja de pendientes"
T_SUP=$(login supervisor@urbansync.co)
peticion GET "/api/incidentes?estado=pendiente&categoria=infraestructura" "$T_SUP"; verificar "Bandeja filtrada" 200
mostrar "pendientes de infraestructura: $(campoNum "$CUERPO" total)"

paso 8 "El supervisor confirma el incidente (versión 1)"
peticion PATCH "/api/incidentes/$ID_INC/clasificacion" "$T_SUP" '{"confirmar":true,"comentario":"Verificado con foto del vecino","version":1}'
verificar "Confirmar" 200
mostrar "estado=$(campo1 "$CUERPO" estado), version=$(campoNum "$CUERPO" version)"

paso 9 "El supervisor busca entes de infraestructura y asigna"
peticion GET "/api/usuarios/entes?categoria=infraestructura" "$T_SUP"; verificar "Listar entes" 200
peticion POST /api/usuarios/login "" "{\"correo\":\"ente.infra@urbansync.co\",\"contrasena\":\"$CLAVE_DEMO\"}"
T_ENTE=$(campo1 "$CUERPO" token); ID_ENTE=$(campo1 "$CUERPO" id)
peticion POST /api/asignaciones "$T_SUP" "{\"incidenteId\":\"$ID_INC\",\"enteId\":\"$ID_ENTE\"}"
verificar "Asignar (PF-05)" 201
ID_ASG=$(campo1 "$CUERPO" id)

paso 10 "El ente ve su asignación y su notificación"
sleep 4
peticion GET /api/asignaciones/mias "$T_ENTE"; verificar "Mis asignaciones" 200
peticion GET /api/notificaciones/no-leidas/conteo "$T_ENTE"; verificar "Conteo de no leídas del ente" 200
mostrar "no leídas del ente: $(campoNum "$CUERPO" conteo)"

paso 11 "El ente atiende y resuelve (PF-06)"
peticion PATCH "/api/asignaciones/$ID_ASG/estado" "$T_ENTE" '{"estado":"en_atencion","comentario":"Cuadrilla en el sitio","version":1}'
verificar "En atención" 200
peticion PATCH "/api/asignaciones/$ID_ASG/estado" "$T_ENTE" '{"estado":"resuelto","comentario":"Trabajo terminado","solucion":"Se reparcheo el tramo con asfalto en frio","version":2}'
verificar "Resuelto" 200

paso 12 "El vecino ve su reporte resuelto y sus notificaciones"
sleep 4
peticion GET "/api/incidentes/$ID_INC" "$T_CIU"; verificar "Detalle del reporte" 200
mostrar "estado final: $(campo1 "$CUERPO" estado)"
mostrar "historial: $(echo "$CUERPO" | grep -o '"estado_nuevo":"[a-z_]*"' | cut -d'"' -f4 | tr '\n' ' ')"
afirmar "Estado final del incidente" "$(campo1 "$CUERPO" estado)" resuelto
peticion GET "/api/notificaciones?limite=10" "$T_CIU"; verificar "Notificaciones del vecino" 200
echo "$CUERPO" | grep -o '"titulo":"[^"]*"' | cut -d'"' -f4 | sed 's/^/       • /'
afirmar "Notificaciones recibidas (confirmado, asignado, en atención, resuelto)" "$(campoNum "$CUERPO" total)" 4

paso 13 "El supervisor consulta el historial de asignaciones (RF-ASG-05)"
peticion GET "/api/asignaciones/incidente/$ID_INC" "$T_SUP"; verificar "Historial de asignaciones" 200

resumen
