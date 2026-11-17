/** Repositorio de usuarios en memoria (mismo contrato que el de PostgreSQL) para los tests. */
const { randomUUID } = require('crypto');

function crearRepoMemoria() {
  const filas = [];
  const publico = ({ hash_contrasena, token_recuperacion, token_expira, intentos_fallidos, bloqueado_hasta, ...u }) => u;
  return {
    filas,
    async contar() { return filas.length; },
    async crear(d) {
      if (filas.some((u) => u.correo === d.correo)) throw Object.assign(new Error('duplicado'), { code: '23505' });
      const u = {
        id: randomUUID(), nombre: d.nombre, correo: d.correo, hash_contrasena: d.hashContrasena, telefono: d.telefono ?? null,
        barrio: d.barrio ?? null, rol: d.rol, categoria_atencion: d.categoriaAtencion ?? null,
        intentos_fallidos: 0, bloqueado_hasta: null, token_recuperacion: null, token_expira: null,
      };
      filas.push(u);
      return publico(u);
    },
    async buscarPorCorreo(correo) { return filas.find((u) => u.correo === correo) || null; },
    async buscarPorId(id) { const u = filas.find((x) => x.id === id); return u ? publico(u) : null; },
    async registrarFalloLogin(id, max, minutos) {
      const u = filas.find((x) => x.id === id);
      if (u.intentos_fallidos + 1 >= max) {
        u.intentos_fallidos = 0;
        u.bloqueado_hasta = new Date(Date.now() + minutos * 60000);
      } else {
        u.intentos_fallidos += 1;
        u.bloqueado_hasta = null;
      }
      return { intentos_fallidos: u.intentos_fallidos, bloqueado_hasta: u.bloqueado_hasta };
    },
    async reiniciarIntentos(id) { const u = filas.find((x) => x.id === id); u.intentos_fallidos = 0; u.bloqueado_hasta = null; },
    async guardarTokenRecuperacion(id, hash, minutos) {
      const u = filas.find((x) => x.id === id); u.token_recuperacion = hash; u.token_expira = new Date(Date.now() + minutos * 60000);
    },
    async restablecerConToken(hash, hashContrasena) {
      const u = filas.find((x) => x.token_recuperacion === hash && x.token_expira > new Date());
      if (!u) return null;
      u.hash_contrasena = hashContrasena; u.token_recuperacion = null;
      return { id: u.id };
    },
    async actualizarPerfil(id, campos) {
      const u = filas.find((x) => x.id === id); if (!u) return null; Object.assign(u, campos); return publico(u);
    },
    async listarPorRol({ rol, categoria }) {
      const r = filas.filter((u) => u.rol === rol && (!categoria || u.categoria_atencion === categoria)).map(publico);
      return { filas: r, total: r.length };
    },
  };
}

module.exports = { crearRepoMemoria };
