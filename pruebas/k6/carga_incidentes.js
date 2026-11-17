// PC-01 / PR-01: 50 usuarios virtuales creando incidentes durante 2 minutos.
// Cada VU usa su propio ciudadano (creado en setup) y una Idempotency-Key nueva por reporte.
// Umbrales: menos de 1 % de errores y p95 < 3000 ms (RNF-REN-01).
//
// Ejecutar (Windows/Mac):
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 grafana/k6 run - < pruebas/k6/carga_incidentes.js
// (o simplemente: bash pruebas/k6/ejecutar.sh)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 50);
const CATEGORIAS = ['infraestructura', 'seguridad', 'desastre_natural'];
const JSON_H = { 'Content-Type': 'application/json' };

const creados = new Counter('incidentes_creados');
const tiempoCreacion = new Trend('tiempo_creacion_ms', true);

export const options = {
  setupTimeout: '180s',
  scenarios: {
    crear_incidentes: { executor: 'constant-vus', vus: VUS, duration: __ENV.DURACION || '2m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],                     // < 1 % de errores
    'http_req_duration{escenario:crear}': ['p(95)<3000'], // p95 < 3 s
    checks: ['rate>0.99'],
  },
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Crea un ciudadano por VU y devuelve sus tokens.
export function setup() {
  const sello = Date.now();
  const tokens = [];
  for (let i = 0; i < VUS; i++) {
    const correo = `k6.${sello}.${i}@carga.co`;
    const cuerpo = { nombre: `Vecino Carga ${i}`, correo, contrasena: 'Clave2026', telefono: '3000000000' };
    const r = http.post(`${BASE}/api/usuarios/registro`, JSON.stringify(cuerpo), { headers: JSON_H, tags: { escenario: 'setup' } });
    if (r.status !== 201) throw new Error(`No se pudo registrar ${correo}: ${r.status} ${r.body}`);
    const l = http.post(`${BASE}/api/usuarios/login`, JSON.stringify({ correo, contrasena: 'Clave2026' }), { headers: JSON_H, tags: { escenario: 'setup' } });
    if (l.status !== 200) throw new Error(`No se pudo iniciar sesión ${correo}: ${l.status} ${l.body}`);
    tokens.push(l.json('token'));
  }
  return { tokens };
}

export default function (datos) {
  const token = datos.tokens[(__VU - 1) % datos.tokens.length];
  const categoria = CATEGORIAS[Math.floor(Math.random() * CATEGORIAS.length)];
  // Puntos aleatorios en un área de ~10 km alrededor de Bogotá (4.6097, -74.0817).
  const cuerpo = {
    titulo: `Reporte de carga VU ${__VU} iteración ${__ITER}`,
    categoria,
    lat: 4.6097 + (Math.random() - 0.5) * 0.09,
    lng: -74.0817 + (Math.random() - 0.5) * 0.09,
    radio_m: 50,
  };
  const r = http.post(`${BASE}/api/incidentes`, JSON.stringify(cuerpo), {
    headers: { ...JSON_H, Authorization: `Bearer ${token}`, 'Idempotency-Key': uuid() },
    tags: { escenario: 'crear' },
  });
  const ok = check(r, {
    'HTTP 201': (x) => x.status === 201,
    'prioridad calculada': (x) => x.status === 201 && ['baja', 'media', 'alta'].includes(x.json('prioridad')),
  });
  if (ok) creados.add(1);
  tiempoCreacion.add(r.timings.duration);
  sleep(1); // un ciudadano real no reporta sin pausa
}
