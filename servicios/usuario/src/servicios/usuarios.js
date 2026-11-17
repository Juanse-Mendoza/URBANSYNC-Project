/**
 * Reglas de negocio del servicio de Usuario (RF-USU-01..06).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AppError } = require('@urbansync/comun');

const COSTO_BCRYPT = 10;
const MAX_INTENTOS = 5;          // RF-USU-02: bloqueo tras 5 intentos fallidos
const MINUTOS_BLOQUEO = 5;
const MINUTOS_TOKEN_RECUPERACION = 15;
// Hash ficticio: si el correo no existe igual se ejecuta bcrypt.compare, para que el tiempo
// de respuesta no revele qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('contrasena-ficticia-urbansync', COSTO_BCRYPT);

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

function crearServicioUsuarios({ repo, logger, jwtSecret, jwtExpiresIn }) {
  if (!jwtSecret) throw new Error('JWT_SECRET no está definido');

  function firmarToken(usuario) {
    return jwt.sign(
      { rol: usuario.rol, nombre: usuario.nombre },
      jwtSecret,
      { subject: usuario.id, expiresIn: jwtExpiresIn || '45m', algorithm: 'HS256', issuer: 'urbansync' },
    );
  }

  /** Crea el usuario; un correo repetido (violación UNIQUE, código 23505) -> 409. */
  async function crearUsuario(datos) {
    try {
      const hashContrasena = await bcrypt.hash(datos.contrasena, COSTO_BCRYPT);
      return await repo.crear({ ...datos, hashContrasena });
    } catch (err) {
      if (err.code === '23505') throw new AppError(409, 'CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo');
      throw err;
    }
  }

  return {
    /** RF-USU-01: registro público, siempre con rol ciudadano. */
    registrar(datos) {
      return crearUsuario({ ...datos, rol: 'ciudadano' });
    },

    /** RF-USU-06: el admin crea supervisores y entes de gestión. */
    crearInstitucional(datos) {
      return crearUsuario({
        ...datos,
        categoriaAtencion: datos.rol === 'ente_gestion' ? datos.categoria_atencion : null,
      });
    },

    /** RF-USU-02: login con bloqueo temporal tras 5 intentos fallidos. */
    async login({ correo, contrasena }) {
      const usuario = await repo.buscarPorCorreo(correo);

      if (usuario?.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
        const minutos = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
        throw new AppError(423, 'CUENTA_BLOQUEADA',
          `La cuenta está bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} minuto(s)`);
      }

      const coincide = await bcrypt.compare(contrasena, usuario?.hash_contrasena || HASH_FICTICIO);
      if (!usuario || !coincide) {
        if (usuario) {
          const estado = await repo.registrarFalloLogin(usuario.id, MAX_INTENTOS, MINUTOS_BLOQUEO);
          if (estado.bloqueado_hasta) {
            logger.warn({ usuarioId: usuario.id }, 'Cuenta bloqueada por intentos fallidos');
            throw new AppError(423, 'CUENTA_BLOQUEADA',
              `Demasiados intentos fallidos. La cuenta quedó bloqueada por ${MINUTOS_BLOQUEO} minutos`);
          }
        }
        throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
      }

      if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) await repo.reiniciarIntentos(usuario.id);
      return {
        token: firmarToken(usuario),
        usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      };
    },

    /**
     * RF-USU-03 (simulado, DECISIONES.md #4): genera un token aleatorio de un solo uso (15 min).
     * En la BD se guarda solo su hash SHA-256; el token en claro se imprime en el log
     * en lugar de enviarse por correo. La respuesta es la misma exista o no el correo.
     */
    async recuperar({ correo }) {
      const usuario = await repo.buscarPorCorreo(correo);
      if (!usuario) {
        logger.info('Solicitud de recuperación para un correo no registrado');
        return;
      }
      const token = crypto.randomBytes(32).toString('hex');
      await repo.guardarTokenRecuperacion(usuario.id, sha256(token), MINUTOS_TOKEN_RECUPERACION);
      logger.info(
        { usuarioId: usuario.id, correo: usuario.correo, tokenRecuperacion: token, expiraEnMin: MINUTOS_TOKEN_RECUPERACION },
        'SIMULACIÓN DE CORREO: token de recuperación de contraseña',
      );
    },

    async restablecer({ token, nuevaContrasena }) {
      const hash = await bcrypt.hash(nuevaContrasena, COSTO_BCRYPT);
      const actualizado = await repo.restablecerConToken(sha256(token), hash);
      if (!actualizado) throw new AppError(400, 'TOKEN_INVALIDO', 'El token es inválido o ya expiró');
    },

    async perfil(id) {
      const usuario = await repo.buscarPorId(id);
      if (!usuario) throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
      return usuario;
    },

    async actualizarPerfil(id, campos) {
      const usuario = await repo.actualizarPerfil(id, campos);
      if (!usuario) throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');
      return usuario;
    },

    listarPorRol(filtro) {
      return repo.listarPorRol(filtro);
    },

    /** Crea las cuentas de demostración si SEED=true y la tabla está vacía (DECISIONES.md #7). */
    async sembrar() {
      if ((await repo.contar()) > 0) return false;
      const contrasena = 'Urbansync2026*';
      const cuentas = [
        { nombre: 'Administrador URBANSYNC', correo: 'admin@urbansync.co', rol: 'admin' },
        { nombre: 'Supervisor Barrial', correo: 'supervisor@urbansync.co', rol: 'supervisor' },
        { nombre: 'Ente Infraestructura', correo: 'ente.infra@urbansync.co', rol: 'ente_gestion', categoriaAtencion: 'infraestructura' },
        { nombre: 'Ente Seguridad', correo: 'ente.seguridad@urbansync.co', rol: 'ente_gestion', categoriaAtencion: 'seguridad' },
        { nombre: 'Ente Emergencias', correo: 'ente.emergencias@urbansync.co', rol: 'ente_gestion', categoriaAtencion: 'desastre_natural' },
        { nombre: 'Ciudadano Demo', correo: 'ciudadano@urbansync.co', rol: 'ciudadano', telefono: '3001234567', barrio: 'Chapinero' },
      ];
      for (const c of cuentas) await crearUsuario({ ...c, contrasena });
      logger.info({ cuentas: cuentas.map((c) => c.correo) }, 'Seed de usuarios de demostración creado');
      return true;
    },
  };
}

module.exports = { crearServicioUsuarios, MAX_INTENTOS, MINUTOS_BLOQUEO };
