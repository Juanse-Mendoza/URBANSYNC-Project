#!/usr/bin/env bash
# Funciones comunes para los scripts de verificación (bash + curl, sin jq).
BASE="${BASE_URL:-http://localhost:8080}"
CLAVE_DEMO='Urbansync2026*'
OK=0; FALLOS=0
TMP_CUERPO="$(mktemp)"

# Campo string de un JSON:   campo "$JSON" id
campo() { echo "$1" | sed -n "s/^[^{]*{.*\"$2\":\"\([^\"]*\)\".*/\1/p" | head -1; }
# Primer campo string (no anidado al final) – suficiente para respuestas planas
campo1() { echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed "s/\"$2\":\"\(.*\)\"/\1/"; }
# Campo numérico o booleano:  campoNum "$JSON" version
campoNum() { echo "$1" | grep -o "\"$2\":[-0-9.a-z]*" | head -1 | sed "s/\"$2\"://"; }

# peticion METODO RUTA [TOKEN] [BODY] [ENCABEZADO...]  -> CODIGO, CUERPO, TIEMPO (segundos)
peticion() {
  local metodo=$1 ruta=$2 token=${3:-} body=${4:-}; shift 4 2>/dev/null || shift $#
  local args=(-s -o "$TMP_CUERPO" -w '%{http_code} %{time_total}' -X "$metodo" "$BASE$ruta" -H 'Content-Type: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  for h in "$@"; do args+=(-H "$h"); done
  local salida; salida=$(curl "${args[@]}")
  CODIGO=${salida%% *}; TIEMPO=${salida#* }; CUERPO=$(cat "$TMP_CUERPO")
}

verificar() { # verificar "descripcion" codigo_esperado
  if [ "$CODIGO" = "$2" ]; then OK=$((OK+1)); echo "[OK]    $1 -> $CODIGO (${TIEMPO:-?} s)"
  else FALLOS=$((FALLOS+1)); echo "[FALLO] $1 -> $CODIGO (esperado $2)"; fi
  echo "        $CUERPO" | cut -c1-240
}

afirmar() { # afirmar "descripcion" valor_obtenido valor_esperado
  if [ "$2" = "$3" ]; then OK=$((OK+1)); echo "[OK]    $1: $2"
  else FALLOS=$((FALLOS+1)); echo "[FALLO] $1: obtenido '$2', esperado '$3'"; fi
}

login() { # login correo [clave] -> imprime token
  peticion POST /api/usuarios/login "" "{\"correo\":\"$1\",\"contrasena\":\"${2:-$CLAVE_DEMO}\"}"
  campo1 "$CUERPO" token
}

nueva_clave() { echo "k$(date +%s%N | cut -c1-16)$RANDOM"; }

resumen() {
  echo; echo "Resultado: $OK correctas, $FALLOS fallidas"
  rm -f "$TMP_CUERPO"
  [ "$FALLOS" -eq 0 ]
}
