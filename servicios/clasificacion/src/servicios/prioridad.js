/**
 * REGLA DE PRIORIDAD (sección 10 de CLAUDE.md) — función pura, sin BD ni red.
 *
 *  1. Prioridad base según la categoría:
 *       infraestructura -> baja, seguridad -> media, desastre_natural -> alta
 *  2. "similares" = reportes de la misma categoría a <= 50 m en 30 días, INCLUIDO el nuevo.
 *  3. similares = 1      -> se queda la base
 *     similares = 2 a 4  -> sube un nivel (baja->media, media->alta)
 *     similares >= 5     -> alta
 *
 * Ejemplo PF-04: cinco reportes de infraestructura en el mismo punto
 *   1.º baja, 2.º-4.º media, 5.º alta.
 */
const NIVELES = ['baja', 'media', 'alta'];

function subirNivel(nivel) {
  const i = NIVELES.indexOf(nivel);
  return NIVELES[Math.min(i + 1, NIVELES.length - 1)];
}

/** La mayor de dos prioridades (usada para no bajar una prioridad fijada por el supervisor). */
function maxPrioridad(a, b) {
  return NIVELES.indexOf(a) >= NIVELES.indexOf(b) ? a : b;
}

function calcularPrioridad(categoriaBase, similares) {
  if (!NIVELES.includes(categoriaBase)) throw new Error(`Prioridad base inválida: ${categoriaBase}`);
  const n = Number(similares);
  if (!Number.isInteger(n) || n < 1) return categoriaBase; // dato inesperado: se usa la base
  if (n >= 5) return 'alta';
  if (n >= 2) return subirNivel(categoriaBase);
  return categoriaBase;
}

module.exports = { NIVELES, calcularPrioridad, subirNivel, maxPrioridad };
