/** Validación de entradas del servicio de Clasificación (zod). */
const { z } = require('zod');

const CATEGORIAS = ['infraestructura', 'seguridad', 'desastre_natural'];
const PRIORIDADES = ['baja', 'media', 'alta'];
const ESTADOS = ['pendiente', 'confirmado', 'asignado', 'en_atencion', 'resuelto'];

const esquemaId = z.string().uuid('El identificador del incidente no es válido');

// Encabezado Idempotency-Key: lo genera la app (uuid) y lo reutiliza en los reintentos.
const esquemaIdempotencyKey = z.string({ required_error: 'El encabezado Idempotency-Key es obligatorio' })
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'El encabezado Idempotency-Key debe tener entre 8 y 64 caracteres alfanuméricos');

const esquemaCrear = z.object({
  titulo: z.string({ required_error: 'El título es obligatorio' }).trim()
    .min(3, 'El título debe tener al menos 3 caracteres').max(120, 'El título debe tener máximo 120 caracteres'),
  descripcion: z.string().trim().max(1000, 'La descripción debe tener máximo 1000 caracteres').optional(),
  categoria: z.enum(CATEGORIAS),
  subcategoria: z.string().trim().max(30).optional(),
  lat: z.number({ required_error: 'La ubicación (lat) es obligatoria', invalid_type_error: 'La latitud debe ser un número' })
    .min(-90).max(90),
  lng: z.number({ required_error: 'La ubicación (lng) es obligatoria', invalid_type_error: 'La longitud debe ser un número' })
    .min(-180).max(180),
  radio_m: z.number().int().min(25, 'El radio debe estar entre 25 y 200 metros')
    .max(200, 'El radio debe estar entre 25 y 200 metros').default(50),
}).strict();

const esquemaFiltros = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  estado: z.enum(ESTADOS).optional(),
}).passthrough();

// PATCH /:id/clasificacion (RF-CLA-05)
const esquemaClasificacion = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
  subcategoria: z.string().trim().max(30).nullable().optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  confirmar: z.boolean().default(true),
  comentario: z.string().trim().max(1000).optional(),
  version: z.number({ required_error: 'La versión es obligatoria (control de concurrencia)' }).int().min(1),
}).strict();

module.exports = {
  CATEGORIAS, PRIORIDADES, ESTADOS,
  esquemaId, esquemaIdempotencyKey, esquemaCrear, esquemaFiltros, esquemaClasificacion,
};
