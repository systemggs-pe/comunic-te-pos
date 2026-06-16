import { auth } from '../lib/firebase.js';

const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');
const IS_LOCAL_API_PROXY = import.meta.env.DEV && !BACKEND_BASE_URL;

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

export async function llamarFuncionSegura(nombre, payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const resp = await fetch(`${BACKEND_BASE_URL}/api/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  const requestId = resp.headers.get('x-request-id') || '';
  if (resp.status === 404) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
    error.requestId = requestId;
    throw error;
  }

  if (looksLikeHtml(text)) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
    error.requestId = requestId;
    throw error;
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (IS_LOCAL_API_PROXY && resp.status >= 500) {
      const error = new Error('API_LOCAL_NO_DISPONIBLE');
      error.status = resp.status;
      error.requestId = requestId;
      throw error;
    }
    const error = new Error('BACKEND_INVALID_RESPONSE');
    error.requestId = requestId;
    throw error;
  }
  if (!resp.ok) {
    const message = data.error || (IS_LOCAL_API_PROXY ? 'API_LOCAL_ERROR' : 'BACKEND_ERROR');
    const error = new Error(message);
    error.status = resp.status;
    error.requestId = requestId || data.requestId || '';
    error.payload = data;
    throw error;
  }
  return data;
}

const VALIDATION_MESSAGES = {
  CELULAR_INVALIDO: 'el celular debe tener 9 digitos y empezar con 9',
  DIRECCION_REQUERIDA: 'la direccion es obligatoria',
  DOCUMENTO_INVALIDO: 'el numero de documento no es valido para el tipo elegido',
  DNI_INVALIDO: 'el DNI debe tener 8 digitos',
  DNI_NO_COINCIDE: 'el documento del cliente no coincide con el equipo o registro',
  EMAIL_INVALIDO: 'el correo electronico no es valido',
  EMAIL_MUY_LARGO: 'el correo electronico es demasiado largo',
  ESTADO_INVALIDO: 'el estado no es valido',
  FECHA_INVALIDA: 'la fecha no es valida',
  ID_INVALIDO: 'el identificador no es valido',
  IMEI_INVALIDO: 'el IMEI debe tener 15 digitos',
  IMEI_LUHN_INVALIDO: 'el IMEI no pasa la validacion',
  IMEI_NO_COINCIDE: 'el IMEI del equipo no coincide con el registro',
  IMEI_YA_REGISTRADO: 'el IMEI ya tiene un registro activo',
  IMEI_YA_VENDIDO: 'el IMEI ya tiene una venta registrada',
  ITEM_CANTIDAD_INVALIDA: 'la cantidad del item debe ser mayor a 0',
  ITEM_NOMBRE_REQUERIDO: 'el nombre del item es obligatorio',
  ITEMS_MUY_LARGOS: 'hay demasiados items adicionales',
  CONTACTOS_MUY_LARGOS: 'hay demasiados contactos registrados',
  MARCA_REQUERIDA: 'la marca es obligatoria',
  MODELO_REQUERIDO: 'el modelo es obligatorio',
  NOMBRE_COMERCIAL_REQUERIDO: 'el nombre comercial es obligatorio',
  NOMBRE_REQUERIDO: 'el nombre del cliente es obligatorio',
  OPERADOR_INVALIDO: 'el operador no es valido',
  PRECIO_DEBE_SER_MAYOR_A_CERO: 'el precio debe ser mayor a cero',
  PRECIO_INVALIDO: 'el precio debe tener maximo 2 decimales',
  PRECIO_MINIMO_BLOQUEADO: 'el precio minimo para un equipo bloqueado es S/. 50.00',
  PRECIO_MUY_LARGO: 'el precio es demasiado largo',
  TIPO_INVALIDO: 'el tipo de registro no es valido',
  TIPO_DOCUMENTO_INVALIDO: 'el tipo de documento no es valido',
  MEDIO_PAGO_INVALIDO: 'el medio de pago no es valido',
};

const FIELD_LABELS = {
  'cliente.celular': 'Celular',
  'cliente.celularRef': 'Celular de referencia',
  'cliente.correo': 'Correo',
  'cliente.correos': 'Correos',
  'cliente.direccion': 'Direccion',
  'cliente.dni': 'Documento',
  'cliente.nombre': 'Nombre',
  'cliente.celulares': 'Celulares',
  'cliente.tipoDocumento': 'Tipo de documento',
  'equipo.idDuenio': 'DNI del equipo',
  'equipo.idEquipo': 'IMEI del equipo',
  'equipo.imei2': 'IMEI 2',
  'equipo.marca': 'Marca',
  'equipo.modelo': 'Modelo',
  'equipo.nombreComercial': 'Nombre comercial',
  'registro.celularCliente': 'Celular',
  'registro.celularRef': 'Celular de referencia',
  'registro.dniCliente': 'Documento',
  'registro.tipoDocumentoCliente': 'Tipo de documento',
  'registro.estado': 'Estado',
  'registro.fecha': 'Fecha',
  'registro.imeiEquipo': 'IMEI del equipo',
  'registro.imeiRegistrado': 'IMEI a registrar',
  'registro.imei2Equipo': 'IMEI 2',
  'registro.marcaEquipo': 'Marca',
  'registro.modeloEquipo': 'Modelo',
  'registro.nombreComercialEquipo': 'Nombre comercial',
  'registro.operador': 'Operador',
  'registro.precio': 'Precio',
  'registro.tipo': 'Tipo',
  'venta.precio': 'Precio',
  'venta.precioEquipo': 'Precio del equipo',
  'venta.medioPago': 'Medio de pago',
  'venta.tipoDocumentoCliente': 'Tipo de documento',
};

function prettifyValidationIssue(issue = {}) {
  const label = FIELD_LABELS[issue.path] || issue.path?.replace(/venta\.itemsAdicionales\.\d+\./, 'Item ') || issue.path || 'Dato';
  const message = VALIDATION_MESSAGES[issue.message] || issue.message || 'valor invalido';
  return `${label}: ${message}`;
}

export function obtenerMensajeErrorFuncion(error, fallback = 'Error de servidor') {
  const issues = error?.payload?.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    return prettifyValidationIssue(issues[0]);
  }
  if (error?.message === 'AUTH_REQUIRED') return 'Debes iniciar sesion nuevamente';
  if (error?.message === 'API_LOCAL_ERROR') return 'La API local devolvio un error. Revisa la terminal de npm run dev';
  if (error?.message === 'API_LOCAL_NO_DISPONIBLE') return 'La API local no esta disponible. Ejecuta npm run dev';
  if (error?.message === 'BACKEND_ERROR') return fallback;
  if (error?.message === 'BACKEND_INVALID_RESPONSE') return 'Respuesta invalida de Netlify Functions';
  if (error?.message === 'BACKEND_NOT_DEPLOYED') return 'Funciones Netlify no desplegadas';
  if (error?.message === 'BOLETA_EQUIPO_YA_EXISTE') {
    const imei = error?.payload?.details?.imei || error?.payload?.imei;
    return imei ? `El equipo ${imei} ya tiene una boleta extranjera` : 'Ese equipo ya tiene una boleta extranjera';
  }
  if (error?.message === 'BOLETA_NOT_FOUND') return 'No se encontro la boleta para editar';
  if (error?.message === 'BOLETA_SIN_EQUIPO' || error?.message === 'BOLETA_SIN_IMEI') return 'La boleta debe tener un equipo valido';
  if (error?.message === 'CODART_TOKEN_MISSING') return 'Falta configurar CODART_TOKEN o RENIEC_TOKEN en .env local';
  if (error?.message === 'DNI_FOTOS_UPSTREAM_ERROR') return 'No se pudo consultar la foto del DNI';
  if (error?.message === 'DNI_FOTO_TIPO_INVALIDO') return 'El tipo de foto DNI no es valido';
  if (error?.message === 'DNI_INVALIDO') return 'El DNI debe tener 8 digitos';
  if (error?.message === 'FIREBASE_ADMIN_CONFIG_MISSING') return 'Falta configurar Firebase Admin en .env local';
  if (error?.message === 'FIREBASE_SERVICE_ACCOUNT_INVALID') return 'FIREBASE_SERVICE_ACCOUNT no es un JSON valido';
  if (error?.message === 'IMEI_YA_REGISTRADO') {
    const imei = error?.payload?.details?.imei;
    return imei ? `El IMEI ${imei} ya tiene un registro activo` : 'Ese IMEI ya tiene un registro activo';
  }
  if (error?.message === 'IMEI_YA_VENDIDO') {
    const imei = error?.payload?.details?.imei;
    return imei ? `El IMEI ${imei} ya tiene una venta registrada` : 'Ese IMEI ya tiene una venta registrada';
  }
  if (error?.message === 'RENIEC_TOKEN_MISSING') return 'Falta configurar RENIEC_TOKEN en .env local';
  if (error?.message === 'fetch failed') return 'No se pudo conectar con el servicio externo';
  return error?.message || fallback;
}

export function consultarReniecDni(dni) {
  return llamarFuncionSegura('reniec', {dni: String(dni)});
}

export function consultarDniFotos(dni, tipo = 'azul') {
  return llamarFuncionSegura('dniFotos', {dni: String(dni), tipo});
}

export function guardarBoletaExtranjera(payload) {
  return llamarFuncionSegura('boletasExtranjeras', payload);
}

export function crearRegistro(payload) {
  return llamarFuncionSegura('registros', {action: 'create', ...payload});
}

export function actualizarRegistro(payload) {
  return llamarFuncionSegura('registros', {action: 'update', ...payload});
}

export function eliminarRegistro(id) {
  return llamarFuncionSegura('registros', {action: 'delete', id});
}

export function desbloquearRegistro(id) {
  return llamarFuncionSegura('registros', {action: 'unlock', id});
}

export function crearVenta(payload) {
  return llamarFuncionSegura('ventas', {action: 'create', ...payload});
}

export function actualizarVenta(payload) {
  return llamarFuncionSegura('ventas', {action: 'update', ...payload});
}

export function eliminarVenta(id) {
  return llamarFuncionSegura('ventas', {action: 'delete', id});
}

export function actualizarCliente(payload) {
  return llamarFuncionSegura('clientes', {action: 'update', ...payload});
}

export function eliminarCliente(dni) {
  return llamarFuncionSegura('clientes', {action: 'delete', dni});
}

export function consultarClientesOperativos(payload = {}) {
  return llamarFuncionSegura('clientes', {action: 'queryOperational', ...payload});
}

export function registrarConsentimientoLegal(payload) {
  return llamarFuncionSegura('legalConsent', payload);
}
