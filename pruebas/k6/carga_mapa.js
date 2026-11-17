// PR-02: consulta del mapa (GET /api/ubicaciones/mapa) con 200 incidentes devueltos por petición.
// Requiere que existan al menos 200 incidentes en la zona (los crea carga_incidentes.js o setup).
// Umbrales: < 1 % de errores y p95 < 2000 ms.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const JSON_H = { 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    mapa: { executor: 'constant-vus', vus: Number(__ENV.VUS || 50), duration: __ENV.DURACION || '1m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{escenario:mapa}': ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const r = http.post(`${BASE}/api/usuarios/login`,
    JSON.stringify({ correo: 'ciudadano@urbansync.co', contrasena: 'Urbansync2026*' }), { headers: JSON_H });
  if (r.status !== 200) throw new Error(`Login fallido: ${r.status} ${r.body}`);
  const token = r.json('token');
  const m = http.get(`${BASE}/api/ubicaciones/mapa?lat=4.6097&lng=-74.0817&radio_m=20000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const total = m.json('total');
  if (total < 200) throw new Error(`Se necesitan 200 incidentes en la zona y hay ${total}. Ejecuta antes carga_incidentes.js`);
  return { token };
}

export default function ({ token }) {
  // Centro ligeramente distinto en cada petición (como un usuario moviendo el mapa).
  const lat = (4.6097 + (Math.random() - 0.5) * 0.01).toFixed(6);
  const lng = (-74.0817 + (Math.random() - 0.5) * 0.01).toFixed(6);
  const r = http.get(`${BASE}/api/ubicaciones/mapa?lat=${lat}&lng=${lng}&radio_m=20000`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { escenario: 'mapa' },
  });
  check(r, {
    'HTTP 200': (x) => x.status === 200,
    'devuelve 200 puntos': (x) => x.status === 200 && x.json('datos').length === 200,
  });
  sleep(1);
}
