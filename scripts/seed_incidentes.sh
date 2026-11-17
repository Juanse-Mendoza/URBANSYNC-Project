#!/usr/bin/env bash
# Crea ~15 incidentes de ejemplo alrededor de Bogotá (4.6097, -74.0817) para que el mapa y la
# bandeja no estén vacíos en una demo. Incluye 5 huecos a menos de 50 m (el 5.º queda en alta).
# Uso: bash scripts/seed_incidentes.sh
set -u
cd "$(dirname "$0")/.."
source pruebas/lib.sh

T=$(login ciudadano@urbansync.co)
[ -z "$T" ] && { echo "No se pudo iniciar sesión. ¿Está levantado el backend? (docker compose up -d)"; exit 1; }

crear() { # crear categoria subcategoria lat lng "titulo" ["descripcion"]
  peticion POST /api/incidentes "$T" "{\"titulo\":\"$5\",\"descripcion\":\"${6:-Reporte de ejemplo}\",\"categoria\":\"$1\",\"subcategoria\":\"$2\",\"lat\":$3,\"lng\":$4}" "Idempotency-Key: $(nueva_clave)"
  printf '  %-3s %-17s %-6s %s\n' "$CODIGO" "$1" "$(campo1 "$CUERPO" prioridad)" "$5"
}

echo "Creando incidentes de ejemplo:"
# Grupo de 5 huecos a ~5 m entre sí (regla de prioridad: baja, media, media, media, alta)
for i in 0 1 2 3 4; do
  crear infraestructura hueco_via "$(awk -v i=$i 'BEGIN{printf "%.6f", 4.6097 + i*0.00004}')" -74.0817 "Hueco en la Carrera 7 ($((i+1)))" "Hueco profundo en el carril derecho"
done
crear infraestructura fuga_agua      4.6150 -74.0700 "Fuga de agua en el andén"     "Sale agua desde anoche"
crear infraestructura alumbrado      4.6020 -74.0900 "Poste de luz apagado"         "La cuadra queda oscura"
crear seguridad       robo           4.6280 -74.0650 "Robo de celulares en el paradero"
crear seguridad       zona_oscura    4.5980 -74.0750 "Parque sin iluminación"       "Se presentan atracos en la noche"
crear seguridad       vandalismo     4.6200 -74.0950 "Grafitis en el salón comunal"
crear desastre_natural inundacion    4.5900 -74.1000 "Calle inundada"               "El agua llega a las casas"
crear desastre_natural arbol_caido   4.6350 -74.0800 "Árbol caído sobre la vía"     "Bloquea un carril"
crear desastre_natural deslizamiento 4.5850 -74.0600 "Deslizamiento en la ladera"   "Riesgo para tres viviendas"
crear infraestructura hueco_via      4.6100 -74.1050 "Hueco frente al colegio"
crear seguridad       robo           4.6050 -74.0600 "Hurto a bicicletas"
echo "Listo. Ábrelos en la app (mapa y bandeja del supervisor)."
