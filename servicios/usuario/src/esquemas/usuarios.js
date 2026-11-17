/** Validación de entradas del servicio de Usuario (zod). */
const { z } = require('zod');

const CATEGORIAS = ['infraestructura', 'seguridad', 'desastre_natural'];

const correo = z.string({ required_error: 'El correo es obligatorio' })
  .trim().toLowerCase().max(150)
  .email('El correo no tiene un formato válido');

// Mínimo 8 caracteres con al menos una letra y un número (máx. 72: límite de bcrypt).
const contrasena = z.string({ required_error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña debe tener máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'La contraseña debe contener al menos una letra')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número');

const nombre = z.string({ required_error: 'El nombre es obligatorio' }).trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres').max(100);

const telefono = z.string().trim()
  .regex(/^\+?[0-9 ]{7,20}$/, 'El teléfono solo puede contener números (7 a 20 dígitos)');

const barrio = z.string().trim().min(2).max(100);

const esquemaRegistro = z.object({
  nombre,
  correo,
  contrasena,
  telefono,
  barrio: barrio.optional(),
}).strict();

const esquemaLogin = z.object({
  correo,
  contrasena: z.string({ required_error: 'La contraseña es obligatoria' }).min(1).max(72),
}).strict();

const esquemaRecuperar = z.object({ correo }).strict();

const esquemaRestablecer = z.object({
  token: z.string({ required_error: 'El token es obligatorio' }).regex(/^[a-f0-9]{64}$/, 'El token no es válido'),
  nuevaContrasena: contrasena,
}).strict();

// Lista blanca: solo estos campos se pueden editar. .strict() rechaza "rol", "correo", etc.
const esquemaActualizarPerfil = z.object({
  nombre: nombre.optional(),
  telefono: telefono.optional(),
  barrio: barrio.nullable().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Debes enviar al menos un campo para actualizar' });

// Creación de cuentas institucionales por el admin (RF-USU-06).
const esquemaCrearUsuario = z.object({
  nombre,
  correo,
  contrasena,
  telefono: telefono.optional(),
  rol: z.enum(['supervisor', 'ente_gestion']),
  categoria_atencion: z.enum(CATEGORIAS).optional(),
}).strict().refine((d) => d.rol !== 'ente_gestion' || d.categoria_atencion, {
  message: 'Un ente de gestión debe tener categoria_atencion',
  path: ['categoria_atencion'],
});

const esquemaFiltroEntes = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
}).passthrough();

const esquemaFiltroInterno = z.object({
  rol: z.enum(['ciudadano', 'supervisor', 'ente_gestion', 'admin']),
}).passthrough();

const esquemaId = z.string().uuid('El identificador no es válido');

module.exports = {
  CATEGORIAS,
  esquemaRegistro,
  esquemaLogin,
  esquemaRecuperar,
  esquemaRestablecer,
  esquemaActualizarPerfil,
  esquemaCrearUsuario,
  esquemaFiltroEntes,
  esquemaFiltroInterno,
  esquemaId,
};
