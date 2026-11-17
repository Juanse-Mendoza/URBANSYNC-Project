/** Validación de entradas del servicio de Asignación (zod). */
const { z } = require('zod');

const uuid = (campo) => z.string({ required_error: `El campo "${campo}" es obligatorio` })
  .uuid(`El campo "${campo}" no es un identificador válido`);

const esquemaId = uuid('id');

const esquemaCrear = z.object({
  incidenteId: uuid('incidenteId'),
  enteId: uuid('enteId'),
}).strict();

const esquemaEstado = z.object({
  estado: z.enum(['en_atencion', 'resuelto']),
  comentario: z.string({ required_error: 'El comentario es obligatorio' }).trim()
    .min(3, 'El comentario debe tener al menos 3 caracteres').max(1000),
  solucion: z.string().trim().min(3, 'La solución debe tener al menos 3 caracteres').max(1000).optional(),
  version: z.number({ required_error: 'La versión es obligatoria (control de concurrencia)' }).int().min(1),
}).strict();

const esquemaReasignar = z.object({
  enteId: uuid('enteId'),
  comentario: z.string().trim().max(1000).optional(),
}).strict();

const esquemaFiltroMias = z.object({
  estado: z.enum(['recibido', 'en_atencion', 'resuelto']).optional(),
}).passthrough();

module.exports = { esquemaId, esquemaCrear, esquemaEstado, esquemaReasignar, esquemaFiltroMias };
