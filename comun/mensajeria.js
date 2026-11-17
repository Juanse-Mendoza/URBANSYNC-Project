/**
 * Mensajería asíncrona con RabbitMQ (sección 9 de CLAUDE.md).
 *
 * Topología (la declara cualquier servicio al conectarse, así existe aunque el
 * consumidor esté caído y los mensajes se acumulan en su cola -> PT-01):
 *
 *   urbansync.eventos (topic) --incidente.creado, incidente.confirmado, asignacion.*--> notificacion.eventos
 *                             --asignacion.creada, asignacion.estado_actualizado-----> clasificacion.eventos
 *   colas con x-dead-letter-exchange = urbansync.dlx (fanout) ----> urbansync.dlq
 *
 * - Publicación con canal de confirmación (el broker confirma que guardó el mensaje).
 * - Mensajes persistentes, prefetch(10), ack manual.
 * - Reintentos del consumidor: se republica con encabezado x-reintentos+1 tras 200/400/800 ms;
 *   al cuarto fallo -> nack(requeue=false) -> DLQ.
 * - Reconexión automática si se cierra la conexión.
 */
const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const EXCHANGE = 'urbansync.eventos';
const DLX = 'urbansync.dlx';
const DLQ = 'urbansync.dlq';
const COLAS = Object.freeze({
  'notificacion.eventos': ['incidente.creado', 'incidente.confirmado', 'asignacion.*'],
  'clasificacion.eventos': ['asignacion.creada', 'asignacion.estado_actualizado', 'asignacion.reasignada'],
});
const ESPERAS_REINTENTO_MS = [200, 400, 800];
const MAX_REINTENTOS = ESPERAS_REINTENTO_MS.length; // 1 intento + 3 reintentos = 4 fallos -> DLQ
const TIMEOUT_CONFIRMACION_MS = 5000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sobre estándar de todos los eventos. */
function crearSobre(tipo, incidenteId, datos) {
  return { eventoId: randomUUID(), tipo, emitidoEn: new Date().toISOString(), incidenteId, datos };
}

async function declararTopologia(canal) {
  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertExchange(DLX, 'fanout', { durable: true });
  await canal.assertQueue(DLQ, { durable: true });
  await canal.bindQueue(DLQ, DLX, '');
  for (const [cola, claves] of Object.entries(COLAS)) {
    await canal.assertQueue(cola, { durable: true, arguments: { 'x-dead-letter-exchange': DLX } });
    for (const clave of claves) await canal.bindQueue(cola, EXCHANGE, clave);
  }
}

class Mensajeria {
  constructor({ url, logger }) {
    this.url = url;
    this.logger = logger;
    this.conexion = null;
    this.canalConfirmacion = null; // para publicar (y republicar reintentos)
    this.consumidores = [];        // [{ cola, manejador }] se re-registran al reconectar
    this.reconectando = false;
    this.cerrando = false;
  }

  estaConectado() {
    return Boolean(this.canalConfirmacion);
  }

  /** Conecta con hasta intentosMax intentos; si no lo logra sigue intentando en segundo plano. */
  async conectar(intentosMax = 10) {
    for (let intento = 1; intento <= intentosMax; intento++) {
      try {
        await this._abrir();
        return true;
      } catch (err) {
        const espera = Math.min(500 * 2 ** (intento - 1), 10000);
        this.logger.warn({ intento, esperaMs: espera, motivo: err.message }, 'RabbitMQ no disponible, reintentando');
        await dormir(espera);
      }
    }
    this.logger.error('No se pudo conectar a RabbitMQ; se seguirá intentando en segundo plano');
    this._programarReconexion();
    return false;
  }

  async _abrir() {
    const conexion = await amqp.connect(this.url);
    try {
      const canal = await conexion.createConfirmChannel();
      await declararTopologia(canal);

      conexion.on('error', (err) => this.logger.error({ motivo: err.message }, 'Error en la conexión AMQP'));
      conexion.on('close', () => {
        this.conexion = null;
        this.canalConfirmacion = null;
        if (!this.cerrando) {
          this.logger.warn('Conexión con RabbitMQ cerrada; reconectando');
          this._programarReconexion();
        }
      });
      // Si el canal se cierra por un error, se cierra la conexión para reconstruir todo.
      canal.on('close', () => { if (this.conexion === conexion) conexion.close().catch(() => {}); });

      this.conexion = conexion;
      this.canalConfirmacion = canal;
      for (const c of this.consumidores) await this._iniciarConsumidor(c);
      this.logger.info('Conectado a RabbitMQ');
    } catch (err) {
      await conexion.close().catch(() => {});
      throw err;
    }
  }

  _programarReconexion() {
    if (this.reconectando || this.cerrando) return;
    this.reconectando = true;
    const intentar = async (n) => {
      try {
        await this._abrir();
        this.reconectando = false;
      } catch (err) {
        const espera = Math.min(1000 * 2 ** n, 10000);
        this.logger.warn({ esperaMs: espera, motivo: err.message }, 'Reconexión a RabbitMQ fallida');
        setTimeout(() => intentar(n + 1), espera);
      }
    };
    setTimeout(() => intentar(0), 1000);
  }

  /** Espera la confirmación del broker para una publicación. */
  _confirmar(enviar) {
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => reject(new Error('Sin confirmación del broker')), TIMEOUT_CONFIRMACION_MS);
      enviar((err) => {
        clearTimeout(temporizador);
        if (err) reject(err instanceof Error ? err : new Error('Mensaje rechazado por el broker'));
        else resolve();
      });
    });
  }

  /** Publica un sobre en el exchange usando su tipo como routing key. Lanza error si el broker no está. */
  async publicar(sobre) {
    const canal = this.canalConfirmacion;
    if (!canal) throw new Error('Broker no disponible');
    const contenido = Buffer.from(JSON.stringify(sobre));
    const propiedades = {
      persistent: true,
      contentType: 'application/json',
      messageId: sobre.eventoId,
      type: sobre.tipo,
      timestamp: Math.floor(Date.now() / 1000),
    };
    await this._confirmar((cb) => canal.publish(EXCHANGE, sobre.tipo, contenido, propiedades, cb));
  }

  /**
   * Registra un consumidor. manejador(sobre) debe ser idempotente; si lanza error se reintenta.
   */
  async consumir(cola, manejador) {
    const consumidor = { cola, manejador };
    this.consumidores.push(consumidor);
    if (this.conexion) await this._iniciarConsumidor(consumidor);
  }

  async _iniciarConsumidor({ cola, manejador }) {
    const canal = await this.conexion.createChannel();
    await canal.prefetch(10);
    await canal.consume(cola, async (msg) => {
      if (!msg) return; // el broker canceló el consumidor
      const headers = msg.properties.headers || {};
      const reintentos = Number(headers['x-reintentos'] || 0);

      let sobre;
      try {
        sobre = JSON.parse(msg.content.toString());
      } catch {
        this.logger.error({ cola }, 'Mensaje con JSON inválido, enviado a la DLQ');
        canal.nack(msg, false, false);
        return;
      }

      const log = this.logger.child({ cola, eventoId: sobre.eventoId, tipo: sobre.tipo, reintentos });
      try {
        await manejador(sobre);
        canal.ack(msg);
      } catch (err) {
        try {
          if (reintentos < MAX_REINTENTOS) {
            // Reintento: se republica una copia con x-reintentos+1 y se confirma el original.
            const espera = ESPERAS_REINTENTO_MS[reintentos];
            log.warn({ motivo: err.message, esperaMs: espera }, 'Fallo al procesar evento, se reintentará');
            await dormir(espera);
            await this._confirmar((cb) => this.canalConfirmacion.sendToQueue(cola, msg.content, {
              persistent: true,
              contentType: msg.properties.contentType,
              messageId: msg.properties.messageId,
              type: msg.properties.type,
              headers: { ...headers, 'x-reintentos': reintentos + 1 },
            }, cb));
            canal.ack(msg);
          } else {
            log.error({ motivo: err.message }, 'Evento falló 4 veces, enviado a la DLQ');
            canal.nack(msg, false, false); // requeue=false -> dead-letter exchange -> DLQ
          }
        } catch (errReintento) {
          // Si no se pudo republicar (broker caído), el mensaje sin ack vuelve a la cola solo.
          log.error({ motivo: errReintento.message }, 'No se pudo gestionar el reintento');
        }
      }
    }, { noAck: false });
    this.logger.info({ cola }, 'Consumidor registrado');
  }

  async cerrar() {
    this.cerrando = true;
    if (this.conexion) await this.conexion.close().catch(() => {});
  }
}

module.exports = { Mensajeria, crearSobre, EXCHANGE, DLX, DLQ, COLAS };
