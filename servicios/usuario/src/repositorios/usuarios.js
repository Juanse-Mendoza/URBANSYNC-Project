/**
 * Acceso a datos de usuarios.usuario. Todas las consultas son parametrizadas ($1, $2...).
 * Nunca se devuelve hash_contrasena fuera de buscarPorCorreo (que solo usa el login).
 */
const CAMPOS_PUBLICOS = 'id, nombre, correo, telefono, barrio, rol, categoria_atencion, creado_en';

function crearRepositorioUsuarios(db) {
  return {
    async contar() {
      const { rows } = await db.query('SELECT count(*)::int AS total FROM usuario');
      return rows[0].total;
    },

    async crear({ nombre, correo, hashContrasena, telefono = null, barrio = null, rol, categoriaAtencion = null }) {
      const { rows } = await db.query(
        `INSERT INTO usuario (nombre, correo, hash_contrasena, telefono, barrio, rol, categoria_atencion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${CAMPOS_PUBLICOS}`,
        [nombre, correo, hashContrasena, telefono, barrio, rol, categoriaAtencion],
      );
      return rows[0];
    },

    async buscarPorCorreo(correo) {
      const { rows } = await db.query('SELECT * FROM usuario WHERE correo = $1', [correo]);
      return rows[0] || null;
    },

    async buscarPorId(id) {
      const { rows } = await db.query(`SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    /**
     * Suma un intento fallido de forma atómica. Al llegar a maxIntentos bloquea la cuenta
     * por "minutos" y reinicia el contador. Devuelve el estado resultante.
     */
    async registrarFalloLogin(id, maxIntentos, minutos) {
      const { rows } = await db.query(
        `UPDATE usuario SET
           bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2
                                    THEN now() + make_interval(mins => $3) ELSE NULL END,
           intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END
         WHERE id = $1
         RETURNING intentos_fallidos, bloqueado_hasta`,
        [id, maxIntentos, minutos],
      );
      return rows[0];
    },

    async reiniciarIntentos(id) {
      await db.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [id]);
    },

    async guardarTokenRecuperacion(id, hashToken, minutos) {
      await db.query(
        `UPDATE usuario SET token_recuperacion = $2, token_expira = now() + make_interval(mins => $3)
         WHERE id = $1`,
        [id, hashToken, minutos],
      );
    },

    /**
     * Cambia la contraseña consumiendo el token (un solo uso): el UPDATE solo afecta a la fila
     * si el token coincide y no ha expirado, y en el mismo paso lo borra.
     */
    async restablecerConToken(hashToken, hashContrasena) {
      const { rows } = await db.query(
        `UPDATE usuario SET hash_contrasena = $2, token_recuperacion = NULL, token_expira = NULL,
                            intentos_fallidos = 0, bloqueado_hasta = NULL
         WHERE token_recuperacion = $1 AND token_expira > now()
         RETURNING id`,
        [hashToken, hashContrasena],
      );
      return rows[0] || null;
    },

    /** Actualiza solo los campos de la lista blanca. */
    async actualizarPerfil(id, campos) {
      const permitidos = ['nombre', 'telefono', 'barrio'];
      const sets = [];
      const valores = [id];
      for (const campo of permitidos) {
        if (campo in campos) {
          valores.push(campos[campo]);
          sets.push(`${campo} = $${valores.length}`);
        }
      }
      const { rows } = await db.query(
        `UPDATE usuario SET ${sets.join(', ')} WHERE id = $1 RETURNING ${CAMPOS_PUBLICOS}`,
        valores,
      );
      return rows[0] || null;
    },

    async listarPorRol({ rol, categoria = null, limite, offset }) {
      const { rows } = await db.query(
        `SELECT ${CAMPOS_PUBLICOS}, count(*) OVER()::int AS total_filas
           FROM usuario
          WHERE rol = $1 AND ($2::varchar IS NULL OR categoria_atencion = $2)
          ORDER BY nombre
          LIMIT $3 OFFSET $4`,
        [rol, categoria, limite, offset],
      );
      const total = rows.length ? rows[0].total_filas : 0;
      return { filas: rows.map(({ total_filas, ...u }) => u), total };
    },
  };
}

module.exports = { crearRepositorioUsuarios };
