const { CircuitBreaker, ESTADOS } = require('../breaker');

// Reloj falso para controlar el paso del tiempo sin esperar 30 s reales.
function crear(umbral = 3, esperaMs = 1000) {
  const reloj = { t: 0 };
  const cb = new CircuitBreaker({ nombre: 'prueba', umbral, esperaMs, ahora: () => reloj.t });
  return { cb, reloj };
}
const falla = () => Promise.reject(new Error('caído'));
const funciona = () => Promise.resolve('ok');

describe('CircuitBreaker', () => {
  test('empieza cerrado y deja pasar las llamadas', async () => {
    const { cb } = crear();
    expect(cb.estado).toBe(ESTADOS.CERRADO);
    await expect(cb.ejecutar(funciona)).resolves.toBe('ok');
  });

  test('se abre tras N fallos consecutivos', async () => {
    const { cb } = crear(3);
    for (let i = 0; i < 3; i++) await expect(cb.ejecutar(falla)).rejects.toThrow('caído');
    expect(cb.estado).toBe(ESTADOS.ABIERTO);
  });

  test('un éxito reinicia el contador de fallos consecutivos', async () => {
    const { cb } = crear(3);
    await cb.ejecutar(falla).catch(() => {});
    await cb.ejecutar(falla).catch(() => {});
    await cb.ejecutar(funciona);
    await cb.ejecutar(falla).catch(() => {});
    expect(cb.estado).toBe(ESTADOS.CERRADO);
    expect(cb.fallosConsecutivos).toBe(1);
  });

  test('abierto: rechaza de inmediato con 503 sin ejecutar la función', async () => {
    const { cb } = crear(1);
    await cb.ejecutar(falla).catch(() => {});
    const fn = jest.fn(funciona);
    await expect(cb.ejecutar(fn)).rejects.toMatchObject({ status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', breakerAbierto: true });
    expect(fn).not.toHaveBeenCalled();
  });

  test('tras la espera pasa a semiabierto y un éxito lo cierra', async () => {
    const { cb, reloj } = crear(1, 1000);
    await cb.ejecutar(falla).catch(() => {});
    reloj.t = 1000;
    await expect(cb.ejecutar(funciona)).resolves.toBe('ok');
    expect(cb.estado).toBe(ESTADOS.CERRADO);
  });

  test('en semiabierto un fallo lo vuelve a abrir', async () => {
    const { cb, reloj } = crear(5, 1000);
    for (let i = 0; i < 5; i++) await cb.ejecutar(falla).catch(() => {});
    reloj.t = 1500;
    await cb.ejecutar(falla).catch(() => {});
    expect(cb.estado).toBe(ESTADOS.ABIERTO);
    reloj.t = 2000; // aún no pasan 1000 ms desde la reapertura
    await expect(cb.ejecutar(funciona)).rejects.toMatchObject({ breakerAbierto: true });
  });
});
