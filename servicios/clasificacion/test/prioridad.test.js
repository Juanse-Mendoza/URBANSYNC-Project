const { calcularPrioridad, maxPrioridad } = require('../src/servicios/prioridad');

describe('calcularPrioridad(categoriaBase, similares)', () => {
  test('un solo reporte conserva la prioridad base', () => {
    expect(calcularPrioridad('baja', 1)).toBe('baja');
    expect(calcularPrioridad('media', 1)).toBe('media');
    expect(calcularPrioridad('alta', 1)).toBe('alta');
  });

  test('de 2 a 4 similares sube un nivel', () => {
    for (const n of [2, 3, 4]) {
      expect(calcularPrioridad('baja', n)).toBe('media');
      expect(calcularPrioridad('media', n)).toBe('alta');
      expect(calcularPrioridad('alta', n)).toBe('alta'); // no hay nivel superior
    }
  });

  test('5 o más similares siempre es alta', () => {
    expect(calcularPrioridad('baja', 5)).toBe('alta');
    expect(calcularPrioridad('media', 12)).toBe('alta');
  });

  test('PF-04: el quinto reporte de infraestructura a menos de 50 m es alta', () => {
    const secuencia = [1, 2, 3, 4, 5].map((n) => calcularPrioridad('baja', n));
    expect(secuencia).toEqual(['baja', 'media', 'media', 'media', 'alta']);
  });

  test('datos inválidos de similares devuelven la base', () => {
    expect(calcularPrioridad('media', 0)).toBe('media');
    expect(calcularPrioridad('media', undefined)).toBe('media');
    expect(calcularPrioridad('media', 2.5)).toBe('media');
  });

  test('una prioridad base desconocida lanza error', () => {
    expect(() => calcularPrioridad('urgente', 1)).toThrow();
  });
});

describe('maxPrioridad', () => {
  test('devuelve la mayor', () => {
    expect(maxPrioridad('baja', 'alta')).toBe('alta');
    expect(maxPrioridad('media', 'baja')).toBe('media');
  });
});
