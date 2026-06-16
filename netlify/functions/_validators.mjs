import {z} from 'zod';

const tipoDocumentoSchema = z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC'], {message: 'TIPO_DOCUMENTO_INVALIDO'}).default('DNI');
const documentoSchema = z.string().trim().toUpperCase()
  .regex(/^[A-Z0-9-]{6,15}$/, 'DOCUMENTO_INVALIDO');

const phoneRequiredSchema = z.string().trim().regex(/^9\d{8}$/, 'CELULAR_INVALIDO');
const phoneOptionalSchema = z.string().trim()
  .refine(value => value === '' || /^9\d{8}$/.test(value), 'CELULAR_INVALIDO')
  .default('');
const phoneListSchema = z.array(phoneRequiredSchema).max(20, 'CONTACTOS_MUY_LARGOS').default([]);

const emailRequiredSchema = z.string().trim().toLowerCase().email('EMAIL_INVALIDO').max(180, 'EMAIL_MUY_LARGO');
const emailOptionalSchema = z.string().trim().toLowerCase()
  .refine(value => value === '' || z.string().email().safeParse(value).success, 'EMAIL_INVALIDO')
  .default('');
const emailListSchema = z.array(emailRequiredSchema).max(20, 'CONTACTOS_MUY_LARGOS').default([]);

const moneySchema = z.string().trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'PRECIO_INVALIDO')
  .max(20, 'PRECIO_MUY_LARGO')
  .refine(value => Number(value) > 0, 'PRECIO_DEBE_SER_MAYOR_A_CERO');

const optionalMoneySchema = z.string().trim()
  .refine(value => value === '' || /^\d+(\.\d{1,2})?$/.test(value), 'PRECIO_INVALIDO')
  .refine(value => value === '' || Number(value) > 0, 'PRECIO_DEBE_SER_MAYOR_A_CERO')
  .default('');

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
  tipoDocumento: tipoDocumentoSchema,
  dni: documentoSchema,
  nombre: requiredText('NOMBRE_REQUERIDO', 160),
  celular: phoneRequiredSchema,
  celularRef: phoneOptionalSchema,
  correo: emailRequiredSchema,
  direccion: requiredText('DIRECCION_REQUERIDA', 300),
  celulares: phoneListSchema,
  correos: emailListSchema,
}).strict().superRefine(validarDocumentoCliente);

const ventaClienteSchema = z.object({
  tipoDocumento: tipoDocumentoSchema,
  dni: documentoSchema,
  nombre: requiredText('NOMBRE_REQUERIDO', 160),
  celular: phoneOptionalSchema,
  correo: emailOptionalSchema,
  celulares: phoneListSchema,
  correos: emailListSchema,
}).strict().superRefine(validarDocumentoCliente);

const clienteUpdateSchema = z.object({
  tipoDocumento: tipoDocumentoSchema,
  dni: documentoSchema,
  nombre: requiredText('NOMBRE_REQUERIDO', 160),
  celular: phoneOptionalSchema,
  celularRef: phoneOptionalSchema,
  correo: emailOptionalSchema,
  direccion: optionalText(300),
  celulares: phoneListSchema,
  correos: emailListSchema,
}).strict().superRefine(validarDocumentoCliente);

const registroEquipoSchema = z.object({
  idEquipo: imeiSchema,
  idDuenio: documentoSchema,
  imei2: optionalImeiSchema,
  sn: optionalText(80),
  marca: requiredText('MARCA_REQUERIDA', 80),
  modelo: requiredText('MODELO_REQUERIDO', 100),
  nombreComercial: requiredText('NOMBRE_COMERCIAL_REQUERIDO', 140),
  ram: optionalText(12),
  memoria: optionalText(12),
  color: optionalText(80),
  isRegistrado: optionalBool,
  imei1Registrado: optionalBool,
  imei2Registrado: optionalBool,
}).strict();

const ventaEquipoSchema = z.object({
  idEquipo: imeiSchema,
  idDuenio: documentoSchema,
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
  tipoDocumentoCliente: tipoDocumentoSchema,
  dniCliente: documentoSchema,
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
  validarDocumentoMovimiento(registro.tipoDocumentoCliente, registro.dniCliente, ctx);
  if (registro.estado === 'BLOQUEADO' && Number(registro.precio) < 50) {
    ctx.addIssue({
      code: 'custom',
      path: ['precio'],
      message: 'PRECIO_MINIMO_BLOQUEADO',
    });
  }
});

const ventaSchema = z.object({
  tipoDocumentoCliente: tipoDocumentoSchema,
  dniCliente: documentoSchema,
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
  medioPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'], {message: 'MEDIO_PAGO_INVALIDO'}).default('EFECTIVO'),
  precioEquipo: optionalMoneySchema,
  itemsAdicionales: z.array(z.object({
    nombre: requiredText('ITEM_NOMBRE_REQUERIDO', 140),
    cantidad: z.string().trim()
      .regex(/^\d+$/, 'ITEM_CANTIDAD_INVALIDA')
      .refine(value => Number(value) > 0, 'ITEM_CANTIDAD_INVALIDA')
      .refine(value => Number(value) <= 999, 'ITEM_CANTIDAD_INVALIDA'),
    precio: moneySchema,
  }).strict()).max(20, 'ITEMS_MUY_LARGOS').default([]),
  fecha: dateSchema,
}).strict().superRefine((venta, ctx) => {
  validarDocumentoMovimiento(venta.tipoDocumentoCliente, venta.dniCliente, ctx);
});

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
const dniPayloadSchema = z.object({dni: documentoSchema}).passthrough();
const clienteUpdatePayloadSchema = z.object({cliente: clienteUpdateSchema}).passthrough();

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

function isValidDocumento(tipo, value) {
  if (tipo === 'DNI') return /^\d{8}$/.test(value);
  if (tipo === 'RUC') return /^\d{11}$/.test(value);
  if (tipo === 'CE') return /^[A-Z0-9-]{6,12}$/.test(value);
  if (tipo === 'PASAPORTE') return /^[A-Z0-9-]{6,15}$/.test(value);
  return false;
}

function validarDocumentoCliente(cliente, ctx) {
  if (!isValidDocumento(cliente.tipoDocumento, cliente.dni)) {
    ctx.addIssue({code: 'custom', path: ['dni'], message: 'DOCUMENTO_INVALIDO'});
  }
}

function validarDocumentoMovimiento(tipoDocumento, numero, ctx) {
  if (!isValidDocumento(tipoDocumento, numero)) {
    ctx.addIssue({code: 'custom', path: ['dniCliente'], message: 'DOCUMENTO_INVALIDO'});
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

export function parseClienteUpdatePayload(payload) {
  return parseOrThrow(clienteUpdatePayloadSchema, payload);
}
