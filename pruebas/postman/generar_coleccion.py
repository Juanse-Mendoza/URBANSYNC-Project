"""Genera pruebas/postman/urbansync.postman_collection.json (formato Postman v2.1)."""
import json, sys

def req(nombre, metodo, ruta, token=None, body=None, tests=(), pre=(), headers=()):
    h = [{"key": "Content-Type", "value": "application/json"}]
    if token:
        h.append({"key": "Authorization", "value": "Bearer {{" + token + "}}"})
    for k, v in headers:
        h.append({"key": k, "value": v})
    partes = ruta.split("?")[0].strip("/").split("/")
    url = {"raw": "{{baseUrl}}" + ruta, "host": ["{{baseUrl}}"], "path": partes}
    if "?" in ruta:
        url["query"] = [{"key": q.split("=")[0], "value": q.split("=")[1]} for q in ruta.split("?")[1].split("&")]
    item = {"name": nombre, "request": {"method": metodo, "header": h, "url": url}, "event": []}
    if body is not None:
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False, indent=2)}
    if pre:
        item["event"].append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": list(pre)}})
    if tests:
        item["event"].append({"listen": "test", "script": {"type": "text/javascript", "exec": list(tests)}})
    return item

def codigo(n):
    return f'pm.test("HTTP {n}", () => pm.response.to.have.status({n}));'

FORMATO_ERROR = 'pm.test("Formato de error estándar", () => { const e = pm.response.json().error; pm.expect(e).to.have.keys("codigo", "mensaje"); });'
ESPERA = 'setTimeout(() => {}, 4000); // deja que el outbox publique y los consumidores procesen'

carpetas = [
    ("0. Salud", [
        req("Health del gateway", "GET", "/health", tests=[codigo(200),
            'pm.test("Los cinco servicios disponibles", () => { const s = pm.response.json().servicios; ["usuario","clasificacion","ubicaciones","asignacion","notificacion"].forEach(n => pm.expect(s[n].disponible).to.be.true); });']),
    ]),
    ("1. Usuario y seguridad", [
        req("PF-01 Registro de ciudadano", "POST", "/api/usuarios/registro",
            body={"nombre": "Vecino Postman", "correo": "{{correo}}", "contrasena": "Clave2026", "telefono": "3120001122", "barrio": "Engativá"},
            pre=['pm.collectionVariables.set("correo", `postman.${Date.now()}@correo.co`);'],
            tests=[codigo(201), 'pm.test("Rol ciudadano y sin hash", () => { const u = pm.response.json(); pm.expect(u.rol).to.eql("ciudadano"); pm.expect(u).to.not.have.property("hash_contrasena"); });']),
        req("Registro con correo repetido -> 409", "POST", "/api/usuarios/registro",
            body={"nombre": "Vecino Postman", "correo": "{{correo}}", "contrasena": "Clave2026", "telefono": "3120001122"},
            tests=[codigo(409), FORMATO_ERROR]),
        req("PF-02 Login ciudadano", "POST", "/api/usuarios/login",
            body={"correo": "{{correo}}", "contrasena": "Clave2026"},
            tests=[codigo(200), 'const r = pm.response.json(); pm.collectionVariables.set("token_ciudadano", r.token);',
                   'pm.test("Devuelve token y usuario", () => { pm.expect(r.token).to.be.a("string"); pm.expect(r.usuario.rol).to.eql("ciudadano"); });']),
        req("Login supervisor (seed)", "POST", "/api/usuarios/login",
            body={"correo": "supervisor@urbansync.co", "contrasena": "{{claveDemo}}"},
            tests=[codigo(200), 'pm.collectionVariables.set("token_supervisor", pm.response.json().token);']),
        req("Login ente de infraestructura (seed)", "POST", "/api/usuarios/login",
            body={"correo": "ente.infra@urbansync.co", "contrasena": "{{claveDemo}}"},
            tests=[codigo(200), 'const r = pm.response.json(); pm.collectionVariables.set("token_ente", r.token); pm.collectionVariables.set("ente_id", r.usuario.id);']),
        req("Perfil propio (GET /me)", "GET", "/api/usuarios/me", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("Correo del perfil", () => pm.expect(pm.response.json().correo).to.eql(pm.collectionVariables.get("correo")));']),
        req("Sin token -> 401", "GET", "/api/usuarios/me", tests=[codigo(401), FORMATO_ERROR]),
        req("PI-04 Ciudadano en bandeja del supervisor -> 403", "GET", "/api/incidentes", token="token_ciudadano",
            tests=[codigo(403), FORMATO_ERROR]),
        req("Ciudadano intenta cambiar su rol -> 400", "PUT", "/api/usuarios/me", token="token_ciudadano",
            body={"rol": "admin"}, tests=[codigo(400)]),
    ]),
    ("2. Clasificación y ubicaciones", [
        req("Categorías", "GET", "/api/categorias", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("Tres categorías", () => pm.expect(pm.response.json().datos).to.have.length(3));']),
        req("PF-03 Crear incidente", "POST", "/api/incidentes", token="token_ciudadano",
            headers=[("Idempotency-Key", "{{idem_key}}")],
            body={"titulo": "Fuga de agua en el andén", "descripcion": "Sale agua desde anoche", "categoria": "infraestructura",
                  "subcategoria": "fuga_agua", "lat": "{{lat}}", "lng": -74.0817, "radio_m": 60},
            pre=['pm.collectionVariables.set("idem_key", pm.variables.replaceIn("{{$guid}}"));',
                 'pm.collectionVariables.set("lat", (4.55 + Math.random() * 0.3).toFixed(6));',
                 '// el body usa "{{lat}}" como texto: se convierte en número',
                 'pm.request.body.raw = pm.request.body.raw.replace(\'"{{lat}}"\', pm.collectionVariables.get("lat"));'],
            tests=[codigo(201), 'const i = pm.response.json(); pm.collectionVariables.set("incidente_id", i.id);',
                   'pm.test("Pendiente con prioridad calculada", () => { pm.expect(i.estado).to.eql("pendiente"); pm.expect(["baja","media","alta"]).to.include(i.prioridad); });',
                   'pm.test("Responde en menos de 3 s (RNF-REN-01)", () => pm.expect(pm.response.responseTime).to.be.below(3000));']),
        req("PC-03 Reenvío con la misma Idempotency-Key -> 200", "POST", "/api/incidentes", token="token_ciudadano",
            headers=[("Idempotency-Key", "{{idem_key}}")],
            body={"titulo": "Fuga de agua en el andén", "categoria": "infraestructura", "lat": 4.6, "lng": -74.0817},
            tests=[codigo(200), 'pm.test("Mismo incidente", () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get("incidente_id")));']),
        req("Crear sin Idempotency-Key -> 400", "POST", "/api/incidentes", token="token_ciudadano",
            body={"titulo": "Sin clave", "categoria": "seguridad", "lat": 4.6, "lng": -74.08}, tests=[codigo(400), FORMATO_ERROR]),
        req("Mis reportes", "GET", "/api/incidentes/mios?pagina=1&limite=10", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("Paginado", () => pm.expect(pm.response.json()).to.have.keys("datos", "paginacion"));']),
        req("Bandeja del supervisor (filtros)", "GET", "/api/incidentes?estado=pendiente&categoria=infraestructura", token="token_supervisor",
            tests=[codigo(200)]),
        req("Detalle con historial (dueño)", "GET", "/api/incidentes/{{incidente_id}}", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("Tiene historial", () => pm.expect(pm.response.json().historial).to.have.length.above(0));']),
        req("RF-CLA-05 Supervisor confirma (version 1)", "PATCH", "/api/incidentes/{{incidente_id}}/clasificacion", token="token_supervisor",
            body={"confirmar": True, "comentario": "Confirmado desde Postman", "version": 1},
            tests=[codigo(200), 'pm.test("Confirmado y version 2", () => { const i = pm.response.json(); pm.expect(i.estado).to.eql("confirmado"); pm.expect(i.version).to.eql(2); });']),
        req("Confirmar con versión vieja -> 409", "PATCH", "/api/incidentes/{{incidente_id}}/clasificacion", token="token_supervisor",
            body={"prioridad": "alta", "version": 1}, tests=[codigo(409), FORMATO_ERROR]),
        req("Mapa de incidentes", "GET", "/api/ubicaciones/mapa?lat=4.6097&lng=-74.0817&radio_m=50000", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("Máximo 200 puntos", () => pm.expect(pm.response.json().datos.length).to.be.at.most(200));']),
        req("Similares (supervisor)", "GET", "/api/ubicaciones/{{incidente_id}}/similares", token="token_supervisor", tests=[codigo(200)]),
    ]),
    ("3. Asignación y notificaciones", [
        req("PF-05 Asignar al ente", "POST", "/api/asignaciones", token="token_supervisor",
            body={"incidenteId": "{{incidente_id}}", "enteId": "{{ente_id}}"},
            tests=[codigo(201), 'pm.collectionVariables.set("asignacion_id", pm.response.json().id);']),
        req("PC-02 Segunda asignación activa -> 409", "POST", "/api/asignaciones", token="token_supervisor",
            body={"incidenteId": "{{incidente_id}}", "enteId": "{{ente_id}}"}, tests=[codigo(409), FORMATO_ERROR]),
        req("Bandeja del ente", "GET", "/api/asignaciones/mias", token="token_ente", pre=[ESPERA],
            tests=[codigo(200), 'pm.test("Incluye la asignación", () => pm.expect(pm.response.json().datos.map(a => a.id)).to.include(pm.collectionVariables.get("asignacion_id")));']),
        req("PI-02 El incidente pasó a 'asignado' (evento)", "GET", "/api/incidentes/{{incidente_id}}", token="token_ente",
            tests=[codigo(200), 'pm.test("Estado asignado", () => pm.expect(pm.response.json().estado).to.eql("asignado"));']),
        req("Ente: en atención (version 1)", "PATCH", "/api/asignaciones/{{asignacion_id}}/estado", token="token_ente",
            body={"estado": "en_atencion", "comentario": "Cuadrilla en camino", "version": 1}, tests=[codigo(200)]),
        req("Ente: resolver sin solución -> 400", "PATCH", "/api/asignaciones/{{asignacion_id}}/estado", token="token_ente",
            body={"estado": "resuelto", "comentario": "Listo", "version": 2}, tests=[codigo(400), FORMATO_ERROR]),
        req("PF-06 Ente: resuelto (version 2)", "PATCH", "/api/asignaciones/{{asignacion_id}}/estado", token="token_ente",
            body={"estado": "resuelto", "comentario": "Trabajo terminado", "solucion": "Se cambió la válvula", "version": 2},
            tests=[codigo(200), 'pm.test("Resuelto", () => pm.expect(pm.response.json().estado).to.eql("resuelto"));']),
        req("Historial de asignaciones (supervisor)", "GET", "/api/asignaciones/incidente/{{incidente_id}}", token="token_supervisor",
            tests=[codigo(200)]),
        req("PI-03 El ciudadano ve su reporte resuelto", "GET", "/api/incidentes/{{incidente_id}}", token="token_ciudadano", pre=[ESPERA],
            tests=[codigo(200), 'pm.test("Estado resuelto", () => pm.expect(pm.response.json().estado).to.eql("resuelto"));']),
        req("RF-NOT-01 Conteo de no leídas del ciudadano", "GET", "/api/notificaciones/no-leidas/conteo", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("4 notificaciones (confirmado, asignado, en atención, resuelto)", () => pm.expect(pm.response.json().conteo).to.eql(4));']),
        req("RF-NOT-04 Historial de notificaciones", "GET", "/api/notificaciones?limite=10", token="token_ciudadano",
            tests=[codigo(200), 'pm.collectionVariables.set("notificacion_id", pm.response.json().datos[0].id);']),
        req("Otro usuario no puede marcar mi notificación -> 404", "PATCH", "/api/notificaciones/{{notificacion_id}}/leida", token="token_ente",
            tests=[codigo(404)]),
        req("Marcar todas como leídas", "PATCH", "/api/notificaciones/leer-todas", token="token_ciudadano",
            tests=[codigo(200), 'pm.test("4 actualizadas", () => pm.expect(pm.response.json().actualizadas).to.eql(4));']),
    ]),
]

coleccion = {
    "info": {
        "name": "URBANSYNC - API (MVP)",
        "description": "Flujo completo ciudadano -> supervisor -> ente a través del gateway. Ejecutar en orden (Runner o newman).",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "variable": [{"key": k, "value": v} for k, v in [
        ("baseUrl", "http://localhost:8080"), ("claveDemo", "Urbansync2026*"), ("correo", ""), ("token_ciudadano", ""),
        ("token_supervisor", ""), ("token_ente", ""), ("ente_id", ""), ("idem_key", ""), ("lat", "4.6097"),
        ("incidente_id", ""), ("asignacion_id", ""), ("notificacion_id", "")]],
    "item": [{"name": n, "item": items} for n, items in carpetas],
}
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    json.dump(coleccion, f, ensure_ascii=False, indent=2)
print(sum(len(i) for _, i in carpetas), "peticiones")
