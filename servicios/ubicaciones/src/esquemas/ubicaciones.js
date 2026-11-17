/** Validación de entradas del servicio de Ubicaciones (zod). */
const { z } = require('zod');

const CATEGORIAS = ['infraestructura', 'seguridad', 'desastre_natural'];
const lat = z.coerce.number({ invalid_type_error: 'La latitud debe ser un número' })
  .min(-90, 'La latitud debe estar entre -90 y 90').max(90, 'La latitud debe estar entre -90 y 90');
const lng = z.coerce.number({ invalid_type_error: 'La longitud debe ser un número' })
  .min(-180, 'La longitud debe estar entre -180 y 180').max(180, 'La longitud debe estar entre -180 y 180');
const radio = z.coerce.number().int('El radio debe ser un número entero')
  .min(25, 'El radio debe estar entre 25 y 200 metros').max(200, 'El radio debe estar entre 25 y 200 metros');

const esquemaId = z.string().uuid('El identificador del incidente no es válido');

// POST /internal/ubicaciones (lo llama Clasificación)
const esquemaRegistro = z.object({
  incidenteId: esquemaId,
  categoria: z.enum(CATEGORIAS),
  lat,
  lng,
  radio_m: radio.default(50),
});

// GET /api/ubicaciones/mapa
const esquemaMapa = z.object({
  lat: lat.optional(),
  lng: lng.optional(),
  radio_m: z.coerce.number().int().min(25).max(50000, 'El radio del mapa debe ser máximo 50000 m').default(500),
  categoria: z.enum(CATEGORIAS).optional(),
  desde: z.coerce.date({ invalid_type_error: 'La fecha "desde" no es válida' }).optional(),
  hasta: z.coerce.date({ invalid_type_error: 'La fecha "hasta" no es válida' }).optional(),
}).refine((q) => (q.lat === undefined) === (q.lng === undefined), {
  message: 'Debes enviar lat y lng juntos', path: ['lat'],
});

const esquemaRadio = z.object({ radio_m: radio }).strict();

module.exports = { CATEGORIAS, esquemaId, esquemaRegistro, esquemaMapa, esquemaRadio };
