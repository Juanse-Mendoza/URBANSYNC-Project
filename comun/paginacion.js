/**
 * Paginación estándar de listados: ?pagina=1&limite=20 (máximo 50).
 * Respuesta: { datos: [...], paginacion: { pagina, limite, total, paginas } }
 */
const LIMITE_MAXIMO = 50;

function leerPaginacion(query = {}) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const limite = Math.min(LIMITE_MAXIMO, Math.max(1, parseInt(query.limite, 10) || 20));
  return { pagina, limite, offset: (pagina - 1) * limite };
}

function respuestaPaginada(datos, total, { pagina, limite }) {
  return { datos, paginacion: { pagina, limite, total, paginas: Math.ceil(total / limite) } };
}

module.exports = { leerPaginacion, respuestaPaginada, LIMITE_MAXIMO };
