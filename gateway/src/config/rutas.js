/**
 * Tabla de enrutamiento y autorización del gateway.
 *  1. SERVICIOS: prefijo de la URL -> microservicio destino.
 *  2. RUTAS_PUBLICAS: no requieren JWT.
 *  3. REGLAS_ROLES: qué roles pueden usar cada método + ruta. La primera regla que
 *     coincide decide. Si ninguna coincide, basta con estar autenticado (cualquier rol).
 * Las rutas /internal/* no aparecen aquí, por lo tanto el gateway responde 404.
 */
const C = 'ciudadano';
const S = 'supervisor';
const E = 'ente_gestion';
const A = 'admin';

function servicios(env = process.env) {
  return [
    { nombre: 'usuario', prefijos: ['/api/usuarios'], url: env.URL_SERVICIO_USUARIO },
    { nombre: 'clasificacion', prefijos: ['/api/incidentes', '/api/categorias'], url: env.URL_SERVICIO_CLASIFICACION },
    { nombre: 'ubicaciones', prefijos: ['/api/ubicaciones'], url: env.URL_SERVICIO_UBICACIONES },
    { nombre: 'asignacion', prefijos: ['/api/asignaciones'], url: env.URL_SERVICIO_ASIGNACION },
    { nombre: 'notificacion', prefijos: ['/api/notificaciones'], url: env.URL_SERVICIO_NOTIFICACION },
  ];
}

const RUTAS_PUBLICAS = [
  { metodo: 'POST', ruta: '/api/usuarios/registro' },
  { metodo: 'POST', ruta: '/api/usuarios/login' },
  { metodo: 'POST', ruta: '/api/usuarios/recuperar' },
  { metodo: 'POST', ruta: '/api/usuarios/restablecer' },
];

const ID = '[^/]+';
const REGLAS_ROLES = [
  // Usuario
  { metodo: 'GET', patron: /^\/api\/usuarios\/entes$/, roles: [S, A] },
  { metodo: 'POST', patron: /^\/api\/usuarios$/, roles: [A] },
  { metodo: 'PUT', patron: /^\/api\/usuarios\/me$/, roles: [C] },
  // Clasificación
  { metodo: 'POST', patron: /^\/api\/incidentes$/, roles: [C] },
  { metodo: 'GET', patron: /^\/api\/incidentes\/mios$/, roles: [C] },
  { metodo: 'GET', patron: /^\/api\/incidentes$/, roles: [S] },
  { metodo: 'GET', patron: new RegExp(`^/api/incidentes/${ID}$`), roles: [C, S, E] },
  { metodo: 'PATCH', patron: new RegExp(`^/api/incidentes/${ID}/clasificacion$`), roles: [S] },
  // Ubicaciones
  { metodo: 'GET', patron: new RegExp(`^/api/ubicaciones/${ID}/similares$`), roles: [S] },
  { metodo: 'PATCH', patron: new RegExp(`^/api/ubicaciones/${ID}/radio$`), roles: [S] },
  // Asignación
  { metodo: 'POST', patron: /^\/api\/asignaciones$/, roles: [S] },
  { metodo: 'GET', patron: /^\/api\/asignaciones\/mias$/, roles: [E] },
  { metodo: 'PATCH', patron: new RegExp(`^/api/asignaciones/${ID}/estado$`), roles: [E] },
  { metodo: 'PATCH', patron: new RegExp(`^/api/asignaciones/${ID}/reasignar$`), roles: [S] },
  { metodo: 'GET', patron: new RegExp(`^/api/asignaciones/incidente/${ID}$`), roles: [S] },
  // Notificaciones, categorías, mapa y /me: cualquier usuario autenticado (sin regla).
];

/** Normaliza la ruta: minúsculas y sin "/" final, para que /API/Incidentes/ no evada las reglas. */
function normalizar(ruta) {
  const r = ruta.toLowerCase().replace(/\/+/g, '/');
  return r.length > 1 ? r.replace(/\/$/, '') : r;
}

function buscarServicio(lista, ruta) {
  return lista.find((s) => s.prefijos.some((p) => ruta === p || ruta.startsWith(`${p}/`))) || null;
}

function esPublica(metodo, ruta) {
  return RUTAS_PUBLICAS.some((r) => r.metodo === metodo && r.ruta === ruta);
}

/** Devuelve los roles permitidos, o null si cualquier rol autenticado puede pasar. */
function rolesPermitidos(metodo, ruta) {
  const regla = REGLAS_ROLES.find((r) => r.metodo === metodo && r.patron.test(ruta));
  return regla ? regla.roles : null;
}

module.exports = { servicios, RUTAS_PUBLICAS, REGLAS_ROLES, normalizar, buscarServicio, esPublica, rolesPermitidos };
