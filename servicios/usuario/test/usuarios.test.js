const request = require('supertest');
const jwt = require('jsonwebtoken');
const { crearLogger, crearAppBase, finalizarApp } = require('@urbansync/comun');
const { crearServicioUsuarios } = require('../src/servicios/usuarios');
const { crearControladorUsuarios } = require('../src/controladores/usuarios');
const { rutasUsuarios } = require('../src/rutas/usuarios');
const { esquemaRegistro, esquemaActualizarPerfil } = require('../src/esquemas/usuarios');
const { crearRepoMemoria } = require('./repoMemoria');

const logger = crearLogger('usuario-test');
logger.level = 'silent';
const SECRETO = 'secreto-test';
const TOKEN = 'token-interno';
const ciudadano = { nombre: 'Ana Pérez', correo: 'ana@correo.co', contrasena: 'Clave2026', telefono: '3105556677' };

function montar() {
  const repo = crearRepoMemoria();
  const servicio = crearServicioUsuarios({ repo, logger, jwtSecret: SECRETO, jwtExpiresIn: '5m' });
  const app = crearAppBase({ servicio: 'usuario', logger, db: { ping: async () => true }, gatewayToken: TOKEN });
  app.use('/api/usuarios', rutasUsuarios(crearControladorUsuarios(servicio)));
  finalizarApp(app, logger);
  return { repo, servicio, app };
}

describe('esquemas de Usuario (zod)', () => {
  test('registro válido normaliza el correo a minúsculas', () => {
    const r = esquemaRegistro.parse({ ...ciudadano, correo: '  ANA@Correo.CO ' });
    expect(r.correo).toBe('ana@correo.co');
  });
  test('registro rechaza el campo "rol" (no se puede auto-asignar)', () => {
    expect(esquemaRegistro.safeParse({ ...ciudadano, rol: 'admin' }).success).toBe(false);
  });
  test('contraseña sin números es inválida', () => {
    const r = esquemaRegistro.safeParse({ ...ciudadano, contrasena: 'SoloLetras' });
    expect(r.error.issues[0].message).toBe('La contraseña debe contener al menos un número');
  });
  test('editar perfil exige al menos un campo y no admite "rol"', () => {
    expect(esquemaActualizarPerfil.safeParse({}).success).toBe(false);
    expect(esquemaActualizarPerfil.safeParse({ rol: 'admin' }).success).toBe(false);
    expect(esquemaActualizarPerfil.safeParse({ barrio: 'Suba' }).success).toBe(true);
  });
});

describe('reglas de negocio de Usuario', () => {
  test('el registro público siempre crea rol ciudadano y no devuelve el hash', async () => {
    const { servicio } = montar();
    const u = await servicio.registrar({ ...ciudadano, rol: 'admin' });
    expect(u.rol).toBe('ciudadano');
    expect(u.hash_contrasena).toBeUndefined();
  });

  test('correo repetido -> 409 CORREO_REGISTRADO', async () => {
    const { servicio } = montar();
    await servicio.registrar(ciudadano);
    await expect(servicio.registrar(ciudadano)).rejects.toMatchObject({ status: 409, codigo: 'CORREO_REGISTRADO' });
  });

  test('login correcto devuelve un JWT HS256 con sub, rol y nombre', async () => {
    const { servicio } = montar();
    const u = await servicio.registrar(ciudadano);
    const r = await servicio.login({ correo: ciudadano.correo, contrasena: ciudadano.contrasena });
    const datos = jwt.verify(r.token, SECRETO, { algorithms: ['HS256'] });
    expect(datos).toMatchObject({ sub: u.id, rol: 'ciudadano', nombre: 'Ana Pérez', iss: 'urbansync' });
    expect(r.usuario).toEqual({ id: u.id, nombre: 'Ana Pérez', rol: 'ciudadano' });
  });

  test('RF-USU-02: el 5.º intento fallido bloquea la cuenta (423), incluso con la clave correcta', async () => {
    const { servicio } = montar();
    await servicio.registrar(ciudadano);
    for (let i = 1; i <= 4; i++) {
      await expect(servicio.login({ correo: ciudadano.correo, contrasena: 'mala' })).rejects.toMatchObject({ status: 401 });
    }
    await expect(servicio.login({ correo: ciudadano.correo, contrasena: 'mala' })).rejects.toMatchObject({ status: 423 });
    await expect(servicio.login({ correo: ciudadano.correo, contrasena: ciudadano.contrasena }))
      .rejects.toMatchObject({ status: 423, codigo: 'CUENTA_BLOQUEADA' });
  });

  test('correo inexistente -> 401 genérico (no revela si existe)', async () => {
    const { servicio } = montar();
    await expect(servicio.login({ correo: 'nadie@x.co', contrasena: 'x' }))
      .rejects.toMatchObject({ status: 401, codigo: 'CREDENCIALES_INVALIDAS' });
  });

  test('RF-USU-03: el token de recuperación es de un solo uso', async () => {
    const { servicio, repo } = montar();
    await servicio.registrar(ciudadano);
    let tokenLog;
    const original = logger.info.bind(logger);
    logger.info = (obj, ...rest) => { if (obj && obj.tokenRecuperacion) tokenLog = obj.tokenRecuperacion; return original(obj, ...rest); };
    await servicio.recuperar({ correo: ciudadano.correo });
    logger.info = original;
    expect(repo.filas[0].token_recuperacion).not.toBe(tokenLog); // en BD solo queda el hash
    await servicio.restablecer({ token: tokenLog, nuevaContrasena: 'NuevaClave1' });
    await expect(servicio.restablecer({ token: tokenLog, nuevaContrasena: 'OtraClave1' }))
      .rejects.toMatchObject({ status: 400, codigo: 'TOKEN_INVALIDO' });
  });
});

describe('API de Usuario (supertest)', () => {
  const interno = (r) => r.set('X-Gateway-Token', TOKEN);

  test('sin X-Gateway-Token -> 401', async () => {
    const { app } = montar();
    const r = await request(app).post('/api/usuarios/registro').send(ciudadano);
    expect(r.status).toBe(401);
  });

  test('POST /registro -> 201', async () => {
    const { app } = montar();
    const r = await interno(request(app).post('/api/usuarios/registro')).send(ciudadano);
    expect(r.status).toBe(201);
    expect(r.body.correo).toBe('ana@correo.co');
  });

  test('POST /registro con datos inválidos -> 400 con mensaje en español', async () => {
    const { app } = montar();
    const r = await interno(request(app).post('/api/usuarios/registro')).send({ ...ciudadano, correo: 'no-es-correo' });
    expect(r.status).toBe(400);
    expect(r.body.error).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: 'El correo no tiene un formato válido' });
  });

  test('GET /entes con rol ciudadano -> 403 (segunda capa de autorización)', async () => {
    const { app } = montar();
    const r = await interno(request(app).get('/api/usuarios/entes')).set('X-Usuario-Id', 'x').set('X-Usuario-Rol', 'ciudadano');
    expect(r.status).toBe(403);
  });
});
