#!/usr/bin/env bash
# Verificación de la Fase 2 (Usuario + Gateway) con curl.
# Uso: bash pruebas/fase2.sh   (con el sistema levantado; no repetir antes de 1 minuto por el rate limit de login)
set -u
BASE="${BASE_URL:-http://localhost:8080}"
CLAVE='Urbansync2026*'
OK=0; FALLOS=0

# Extrae un campo string de un JSON plano: campo '{"token":"abc"}' token -> abc
campo() { echo "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p"; }

# peticion METODO RUTA [TOKEN] [BODY] [ENCABEZADO_EXTRA] -> deja CODIGO y CUERPO
peticion() {
  local args=(-s -o /tmp/us_cuerpo -w '%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-d "$4")
  [ -n "${5:-}" ] && args+=(-H "$5")
  CODIGO=$(curl "${args[@]}"); CUERPO=$(cat /tmp/us_cuerpo)
}

verificar() { # verificar "descripcion" esperado
  if [ "$CODIGO" = "$2" ]; then OK=$((OK+1)); echo "[OK]    $1 -> $CODIGO"
  else FALLOS=$((FALLOS+1)); echo "[FALLO] $1 -> $CODIGO (esperado $2)"; fi
  echo "        $CUERPO" | cut -c1-260
}

CORREO="ana.$(date +%s)@correo.co"
echo "=== PF-01 Registro de ciudadano ==="
peticion POST /api/usuarios/registro "" "{\"nombre\":\"Ana Perez\",\"correo\":\"$CORREO\",\"contrasena\":\"Clave2026\",\"telefono\":\"3105556677\",\"barrio\":\"Kennedy\"}"
verificar "Registro válido" 201
peticion POST /api/usuarios/registro "" "{\"nombre\":\"Ana Perez\",\"correo\":\"$CORREO\",\"contrasena\":\"Clave2026\",\"telefono\":\"3105556677\"}"
verificar "Correo repetido" 409
peticion POST /api/usuarios/registro "" '{"nombre":"A","correo":"no-es-correo","contrasena":"123"}'
verificar "Datos inválidos" 400
peticion POST /api/usuarios/registro "" "{\"nombre\":\"Pirata\",\"correo\":\"p$(date +%s)@x.co\",\"contrasena\":\"Clave2026\",\"telefono\":\"3105556677\",\"rol\":\"admin\"}"
verificar "Intento de registrarse como admin (campo no permitido)" 400

echo; echo "=== PF-02 Login ==="
peticion POST /api/usuarios/login "" "{\"correo\":\"ciudadano@urbansync.co\",\"contrasena\":\"$CLAVE\"}"
verificar "Login ciudadano demo" 200
T_CIU=$(campo "$CUERPO" token)
peticion POST /api/usuarios/login "" "{\"correo\":\"supervisor@urbansync.co\",\"contrasena\":\"$CLAVE\"}"; T_SUP=$(campo "$CUERPO" token)
peticion POST /api/usuarios/login "" "{\"correo\":\"admin@urbansync.co\",\"contrasena\":\"$CLAVE\"}"; T_ADM=$(campo "$CUERPO" token)

echo; echo "=== Autenticación en el gateway ==="
peticion GET /api/usuarios/me "$T_CIU"; verificar "GET /me con token" 200
peticion GET /api/usuarios/me; verificar "GET /me sin token" 401
peticion GET /api/usuarios/me "token.falso.123"; verificar "GET /me con token inválido" 401

echo; echo "=== Autorización por rol ==="
peticion GET /api/incidentes "$T_CIU"; verificar "PI-04 ciudadano en GET /api/incidentes" 403
peticion GET /api/usuarios/entes "$T_CIU" "" "X-Usuario-Rol: supervisor"
verificar "Ciudadano falsificando X-Usuario-Rol: supervisor" 403
peticion GET "/api/usuarios/entes?categoria=seguridad" "$T_SUP"; verificar "Supervisor lista entes de seguridad" 200
peticion GET /api/usuarios/entes "$T_SUP"; verificar "Supervisor lista todos los entes" 200
peticion POST /api/usuarios "$T_CIU" '{"nombre":"X","correo":"x@x.co","contrasena":"Clave2026","rol":"supervisor"}'
verificar "Ciudadano intenta crear supervisor" 403
peticion POST /api/usuarios "$T_ADM" "{\"nombre\":\"Ente Aseo\",\"correo\":\"ente.aseo.$(date +%s)@urbansync.co\",\"contrasena\":\"Clave2026\",\"rol\":\"ente_gestion\",\"categoria_atencion\":\"infraestructura\"}"
verificar "RF-USU-06 admin crea ente de gestión" 201
peticion PUT /api/usuarios/me "$T_CIU" '{"barrio":"Suba"}'; verificar "Ciudadano edita su barrio" 200
peticion PUT /api/usuarios/me "$T_CIU" '{"rol":"admin"}'; verificar "Ciudadano intenta cambiar su rol" 400
peticion GET /internal/usuarios/00000000-0000-0000-0000-000000000000 "$T_ADM"; verificar "Ruta /internal no expuesta en el gateway" 404

echo; echo "=== Llamada directa a un servicio (sin pasar por el gateway) ==="
DIRECTO=$(docker compose exec -T usuario node -e "fetch('http://localhost:3001/api/usuarios/me',{headers:{'X-Usuario-Id':'x','X-Usuario-Rol':'admin'}}).then(async r=>console.log(r.status+' '+await r.text()))")
CODIGO=${DIRECTO%% *}; CUERPO=${DIRECTO#* }; verificar "Servicio usuario sin X-Gateway-Token" 401

echo; echo "=== RF-USU-03 Recuperación de contraseña (simulada) ==="
peticion POST /api/usuarios/recuperar "" "{\"correo\":\"$CORREO\"}"; verificar "Solicitar recuperación" 200
sleep 1
TOKEN_REC=$(docker compose logs usuario --since 1m --no-log-prefix | grep tokenRecuperacion | tail -1 | sed -n 's/.*"tokenRecuperacion":"\([a-f0-9]*\)".*/\1/p')
echo "        token leído del log: ${TOKEN_REC:0:12}..."
peticion POST /api/usuarios/restablecer "" "{\"token\":\"$TOKEN_REC\",\"nuevaContrasena\":\"NuevaClave2026\"}"; verificar "Restablecer con token" 200
peticion POST /api/usuarios/restablecer "" "{\"token\":\"$TOKEN_REC\",\"nuevaContrasena\":\"OtraClave2026\"}"; verificar "Reusar el mismo token (un solo uso)" 400
peticion POST /api/usuarios/login "" "{\"correo\":\"$CORREO\",\"contrasena\":\"NuevaClave2026\"}"; verificar "Login con la nueva contraseña" 200

echo; echo "=== RF-USU-02 Bloqueo tras 5 intentos fallidos ==="
for i in 1 2 3 4 5; do
  peticion POST /api/usuarios/login "" "{\"correo\":\"$CORREO\",\"contrasena\":\"Incorrecta$i\"}"
  if [ "$i" -lt 5 ]; then verificar "Intento fallido $i" 401; else verificar "Intento fallido 5 (bloquea)" 423; fi
done
peticion POST /api/usuarios/login "" "{\"correo\":\"$CORREO\",\"contrasena\":\"NuevaClave2026\"}"; verificar "Contraseña correcta con cuenta bloqueada" 423

echo; echo "=== Rate limit de /login (10/min) ==="
peticion POST /api/usuarios/login "" '{"correo":"nadie@x.co","contrasena":"x"}'; verificar "Petición 12 de login en el mismo minuto" 429

echo; echo "=== Servicio caído -> 503 desde el gateway ==="
docker compose stop notificacion >/dev/null 2>&1
peticion GET /api/notificaciones "$T_CIU"; verificar "GET /api/notificaciones con notificacion detenido" 503
docker compose start notificacion >/dev/null 2>&1

echo; echo "Resultado: $OK correctas, $FALLOS fallidas"
[ "$FALLOS" -eq 0 ]
