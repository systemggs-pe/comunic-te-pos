import {z} from 'zod';

const dniSchema = z.string().trim().regex(/^\d{8}$/, 'DNI_INVALIDO');

const phoneRequiredSchema = z.string().trim().regex(/^9\d{8}$/, 'CELULAR_INVALIDO');
const phoneOptionalSchema = z.string().trim()
  .refine(value => value === '' || /^9\d{8}$/.test(value), 'CELULAR_INVALIDO')
  .default('');

const emailRequiredSchema = z.string().trim().toLowerCase().email('EMAIL_INVALIDO').max(180, 'EMAIL_MUY_LARGO');
const emailOptionalSchema = z.string().trim().toLowerCase()
  .refine(value => value === '' || z.string().email().safeParse(value).success, 'EMAIL_INVALIDO')
  .default('');

const moneySchema = z.string().trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'PRECIO_INVALIDO')
  .max(20, 'PRECIO_MUY_LARGO')
  .refine(value => Number(value) > 0, 'PRECIO_DEBE_SER_MAYOR_A_CERO');

const dateSchema = z.string().trim()
  .refine(value => !Number.isNaN(Date.parse(value)), 'FECHA_INVALIDA')
  .transform(value => new Date(value).toISOString());

const requiredText = (message, max = 160) => z.string().trim().min(1, message).max(max, `${message}_MUY_LARGO`);
const optionalText = (max = 160) => z.string().trim().max(max, 'TEXTO_MUY_LARGO').default('');
const optionalBool = z.boolean().default(false);

const imeiSchema = z.string().trim()
  .regex(/^\d{15}$/, 'IMEI_INVALIDO')
  .refine(luhn, 'IMEI_LUHN_INVALIDO');

const optionalImeiSchema = z.string().trim()
  .refine(value => value === '' || /^\d{15}$/.test(value), 'IMEI_INVALIDO')
  .refine(value => value === '' || luhn(value), 'IMEI_LUHN_INVALIDO')
  .default('');

const idSchema = z.string().trim().min(1, 'ID_INVALIDO').max(160, 'ID_INVALIDO').regex(/^[A-Za-z0-9_-]+$/, 'ID_INVALIDO');

const registroClienteSchema = z.object({
  dni: dniSchema,
  nombre: requiredText('NOMBRE_REQUERIDO', 160),
  celular: phoneRequiredSchema,
  celularRef: phoneOptionalSchema,
  correo: emailRequiredSchema,
  direccion: requiredText('DIRECCION_REQUERIDA', 300),
}).strict();

const ventaClienteSchema = z.object({
  dni: dniSchema,
  nombre: requiredText('NOMBRE_REQUERIDO', 160),
  celular: phoneOptionalSchema,
  correo: emailOptionalSchema,
}).strict();

const registroEquipoSchema = z.object({
  idEquipo: imeiSchema,
  idDuenio: dniSchema,
  imei2: optionalImeiSchema,
  sn: optionalText(80),
  marca: requiredText('MARCA_REQUERIDA', 80),
  modelo: requiredText('MODELO_REQUERIDO', 100),
  nombreComercial: requiredText('NOMBRE_COMERCIAL_REQUERIDO', 140),
  isRegistrado: optionalBool,
  imei1Registrado: optionalBool,
  imei2Registrado: optionalBool,
}).strict();

const ventaEquipoSchema = z.object({
  idEquipo: imeiSchema,
  idDuenio: dniSchema,
  imei2: optionalImeiSchema,
  sn: optionalText(80),
  nombreComercial: requiredText('NOMBRE_COMERCIAL_REQUERIDO', 140),
  marca: optionalText(80),
  modelo: optionalText(100),
  ram: optionalText(12),
  memoria: optionalText(12),
  color: optionalText(80),
  isVendido: optionalBool,
}).strict();

const registroSchema = z.object({
  dniCliente: dniSchema,
  celularCliente: phoneRequiredSchema,
  celularRef: phoneOptionalSchema,
  imeiEquipo: imeiSchema,
  imeiRegistrado: imeiSchema,
  imei2Equipo: optionalImeiSchema,
  modeloEquipo: requiredText('MODELO_REQUERIDO', 100),
  marcaEquipo: requiredText('MARCA_REQUERIDA', 80),
  nombreComercialEquipo: requiredText('NOMBRE_COMERCIAL_REQUERIDO', 140),
  estado: z.enum(['NO BLOQUEADO', 'BLOQUEADO'], {message: 'ESTADO_INVALIDO'}),
  operador: z.enum(['CLARO', 'MOVISTAR', 'ENTEL', 'BITEL'], {message: 'OPERADOR_INVALIDO'}),
  tipo: z.enum(['TIENDA', 'EXTERNO', 'PASE'], {message: 'TIPO_INVALIDO'}),
  precio: moneySchema,
  fecha: dateSchema,
  pdfDniUrl: optionalText(1200),
  pdfCajaUrl: optionalText(1200),
  pdfReciboUrl: optionalText(1200),
}).strict().superRefine((registro, ctx) => {
  if (registro.estado === 'BLOQUEADO' && Number(registro.precio) < 50) {
    ctx.addIssue({
      code: 'custom',
      path: ['precio'],
      message: 'PRECIO_MINIMO_BLOQUEADO',
    });
  }
});

const ventaSchema = z.object({
  dniCliente: dniSchema,
  imeiEquipo: imeiSchema,
  imei2Equipo: optionalImeiSchema,
  sn: optionalText(80),
  modeloEquipo: optionalText(100),
  marcaEquipo: optionalText(80),
  nombreComercial: requiredText('NOMBRE_COMERCIAL_REQUERIDO', 140),
  ram: optionalText(12),
  memoria: optionalText(12),
  color: optionalText(80),
  precio: moneySchema,
  fecha: dateSchema,
}).strict();

const registroPayloadSchema = z.object({
  cliente: registroClienteSchema,
  equipo: registroEquipoSchema,
  registro: registroSchema,
}).passthrough().superRefine((payload, ctx) => {
  ensureSame(payload.cliente.dni, payload.equipo.idDuenio, ['equipo', 'idDuenio'], ctx, 'DNI_NO_COINCIDE');
  ensureSame(payload.cliente.dni, payload.registro.dniCliente, ['registro', 'dniCliente'], ctx, 'DNI_NO_COINCIDE');
  ensureSame(payload.equipo.idEquipo, payload.registro.imeiEquipo, ['registro', 'imeiEquipo'], ctx, 'IMEI_NO_COINCIDE');
});

const ventaPayloadSchema = z.object({
  cliente: ventaClienteSchema,
  equipo: ventaEquipoSchema,
  venta: ventaSchema,
}).passthrough().superRefine((payload, ctx) => {
  ensureSame(payload.cliente.dni, payload.equipo.idDuenio, ['equipo', 'idDuenio'], ctx, 'DNI_NO_COINCIDE');
  ensureSame(payload.cliente.dni, payload.venta.dniCliente, ['venta', 'dniCliente'], ctx, 'DNI_NO_COINCIDE');
  ensureSame(payload.equipo.idEquipo, payload.venta.imeiEquipo, ['venta', 'imeiEquipo'], ctx, 'IMEI_NO_COINCIDE');
});

const idPayloadSchema = z.object({id: idSchema}).passthrough();
const dniPayloadSchema = z.object({dni: dniSchema}).passthrough();

function luhn(value) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function ensureSame(left, right, path, ctx, message) {
  if (left !== right) {
    ctx.addIssue({code: 'custom', path, message});
  }
}

function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  throw Object.assign(new Error('VALIDATION_ERROR'), {
    status: 400,
    payload: {
      issues: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}

export function parseRegistroPayload(payload) {
  return parseOrThrow(registroPayloadSchema, payload);
}

export function parseVentaPayload(payload) {
  return parseOrThrow(ventaPayloadSchema, payload);
}

export function parseIdPayload(payload) {
  return parseOrThrow(idPayloadSchema, payload);
}

export function parseDniPayload(payload) {
  return parseOrThrow(dniPayloadSchema, payload);
}
