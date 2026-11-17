/**
 * Controladores HTTP: validan la entrada (zod), llaman a la regla de negocio y responden.
 */
const { validar, leerPaginacion, respuestaPaginada } = require('@urbansync/comun');
const E = require('../esquemas/usuarios');

function crearControladorUsuarios(servicio) {
  return {
    async registro(req, res) {
      const datos = validar(E.esquemaRegistro, req.body);
      const usuario = await servicio.registrar(datos);
      res.status(201).json(usuario);
    },

    async login(req, res) {
      const datos = validar(E.esquemaLogin, req.body);
      res.json(await servicio.login(datos));
    },

    async recuperar(req, res) {
      const datos = validar(E.esquemaRecuperar, req.body);
      await servicio.recuperar(datos);
      res.json({ mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña' });
    },

    async restablecer(req, res) {
      const datos = validar(E.esquemaRestablecer, req.body);
      await servicio.restablecer(datos);
      res.json({ mensaje: 'Contraseña actualizada correctamente' });
    },

    async me(req, res) {
      res.json(await servicio.perfil(req.usuario.id));
    },

    async actualizarMe(req, res) {
      const campos = validar(E.esquemaActualizarPerfil, req.body);
      res.json(await servicio.actualizarPerfil(req.usuario.id, campos));
    },

    async listarEntes(req, res) {
      const { categoria } = validar(E.esquemaFiltroEntes, req.query);
      const pag = leerPaginacion(req.query);
      const { filas, total } = await servicio.listarPorRol({ rol: 'ente_gestion', categoria, ...pag });
      res.json(respuestaPaginada(filas, total, pag));
    },

    async crearInstitucional(req, res) {
      const datos = validar(E.esquemaCrearUsuario, req.body);
      res.status(201).json(await servicio.crearInstitucional(datos));
    },

    // ----- Rutas internas (solo otros servicios) -----
    async internoPorId(req, res) {
      const id = validar(E.esquemaId, req.params.id);
      const u = await servicio.perfil(id);
      res.json({ id: u.id, nombre: u.nombre, rol: u.rol, categoria_atencion: u.categoria_atencion });
    },

    async internoPorRol(req, res) {
      const { rol } = validar(E.esquemaFiltroInterno, req.query);
      const { filas } = await servicio.listarPorRol({ rol, limite: 500, offset: 0 });
      res.json({ datos: filas.map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol })) });
    },
  };
}

module.exports = { crearControladorUsuarios };
