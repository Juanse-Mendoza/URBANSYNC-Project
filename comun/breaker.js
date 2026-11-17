/**
 * Circuit breaker propio por fallos consecutivos (Tabla 15, DECISIONES.md #11).
 *
 *            fallos consecutivos >= umbral
 *  CERRADO ---------------------------------> ABIERTO
 *     ^                                          |
 *     | 1 éxito                                  | pasan esperaMs
 *     |                                          v
 *     +------------------------------------- SEMIABIERTO
 *                 (1 fallo -> vuelve a ABIERTO)
 *
 * - CERRADO: las llamadas pasan normalmente; se cuentan los fallos seguidos.
 * - ABIERTO: se rechaza de inmediato (sin esperar el timeout) -> el servicio aplica su plan B.
 * - SEMIABIERTO: se deja pasar UNA llamada de prueba; si funciona se cierra, si no se reabre.
 */
const { AppError } = require('./errores');

const ESTADOS = Object.freeze({ CERRADO: 'cerrado', ABIERTO: 'abierto', SEMIABIERTO: 'semiabierto' });

class CircuitBreaker {
  constructor({
    nombre,
    umbral = Number(process.env.CB_FALLOS_UMBRAL) || 5,
    esperaMs = Number(process.env.CB_ESPERA_MS) || 30000,
    logger = null,
    ahora = () => Date.now(), // inyectable para los tests
  }) {
    this.nombre = nombre;
    this.umbral = umbral;
    this.esperaMs = esperaMs;
    this.logger = logger;
    this.ahora = ahora;
    this.estado = ESTADOS.CERRADO;
    this.fallosConsecutivos = 0;
    this.abiertoEn = null;
    this.pruebaEnCurso = false;
  }

  /** Ejecuta fn() protegida por el breaker. */
  async ejecutar(fn) {
    if (this.estado === ESTADOS.ABIERTO) {
      if (this.ahora() - this.abiertoEn >= this.esperaMs) {
        this._cambiarEstado(ESTADOS.SEMIABIERTO);
      } else {
        throw this._errorAbierto();
      }
    }

    // En semiabierto solo se permite una llamada de prueba a la vez.
    const esPrueba = this.estado === ESTADOS.SEMIABIERTO;
    if (esPrueba) {
      if (this.pruebaEnCurso) throw this._errorAbierto();
      this.pruebaEnCurso = true;
    }

    try {
      const resultado = await fn();
      this._registrarExito();
      return resultado;
    } catch (err) {
      this._registrarFallo();
      throw err;
    } finally {
      if (esPrueba) this.pruebaEnCurso = false;
    }
  }

  _registrarExito() {
    this.fallosConsecutivos = 0;
    if (this.estado !== ESTADOS.CERRADO) this._cambiarEstado(ESTADOS.CERRADO);
  }

  _registrarFallo() {
    this.fallosConsecutivos += 1;
    const debeAbrir = this.estado === ESTADOS.SEMIABIERTO || this.fallosConsecutivos >= this.umbral;
    if (debeAbrir) {
      this.abiertoEn = this.ahora();
      if (this.estado !== ESTADOS.ABIERTO) this._cambiarEstado(ESTADOS.ABIERTO);
    }
  }

  _cambiarEstado(nuevo) {
    const anterior = this.estado;
    this.estado = nuevo;
    // Este log es la evidencia del breaker en la sustentación.
    if (this.logger) {
      this.logger.warn(
        { breaker: this.nombre, de: anterior, a: nuevo, fallosConsecutivos: this.fallosConsecutivos },
        `Circuit breaker "${this.nombre}": ${anterior} -> ${nuevo}`,
      );
    }
  }

  _errorAbierto() {
    const err = new AppError(
      503,
      'SERVICIO_NO_DISPONIBLE',
      `El servicio de ${this.nombre} no está disponible en este momento, intenta más tarde`,
    );
    err.breakerAbierto = true;
    return err;
  }
}

module.exports = { CircuitBreaker, ESTADOS };
