import { auth } from '../lib/firebase.js';

const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');

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
  if (resp.status === 404) {
    throw new Error('BACKEND_NOT_DEPLOYED');
  }

  if (looksLikeHtml(text)) {
    throw new Error('BACKEND_NOT_DEPLOYED');
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('BACKEND_INVALID_RESPONSE');
  }
  if (!resp.ok) {
    const error = new Error(data.error || 'BACKEND_ERROR');
    error.status = resp.status;
    error.payload = data;
    throw error;
  }
  return data;
}

const VALIDATION_MESSAGES = {
  CELULAR_INVALIDO: 'el celular debe tener 9 digitos y empezar con 9',
  DIRECCION_REQUERIDA: 'la direccion es obligatoria',
  DNI_INVALIDO: 'el DNI debe tener 8 digitos',
  DNI_NO_COINCIDE: 'el DNI del cliente no coincide con el equipo o registro',
  EMAIL_INVALIDO: 'el correo electronico no es valido',
  EMAIL_MUY_LARGO: 'el correo electronico es demasiado largo',
  ESTADO_INVALIDO: 'el estado no es valido',
  FECHA_INVALIDA: 'la fecha no es valida',
  ID_INVALIDO: 'el identificador no es valido',
  IMEI_INVALIDO: 'el IMEI debe tener 15 digitos',
  IMEI_LUHN_INVALIDO: 'el IMEI no pasa la validacion',
  IMEI_NO_COINCIDE: 'el IMEI del equipo no coincide con el registro',
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
};

const FIELD_LABELS = {
  'cliente.celular': 'Celular',
  'cliente.celularRef': 'Celular de referencia',
  'cliente.correo': 'Correo',
  'cliente.direccion': 'Direccion',
  'cliente.dni': 'DNI',
  'cliente.nombre': 'Nombre',
  'equipo.idDuenio': 'DNI del equipo',
  'equipo.idEquipo': 'IMEI del equipo',
  'equipo.imei2': 'IMEI 2',
  'equipo.marca': 'Marca',
  'equipo.modelo': 'Modelo',
  'equipo.nombreComercial': 'Nombre comercial',
  'registro.celularCliente': 'Celular',
  'registro.celularRef': 'Celular de referencia',
  'registro.dniCliente': 'DNI',
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
};

function prettifyValidationIssue(issue = {}) {
  const label = FIELD_LABELS[issue.path] || issue.path || 'Dato';
  const message = VALIDATION_MESSAGES[issue.message] || issue.message || 'valor invalido';
  return `${label}: ${message}`;
}

export function obtenerMensajeErrorFuncion(error, fallback = 'Error de servidor') {
  const issues = error?.payload?.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    return prettifyValidationIssue(issues[0]);
  }
  if (error?.message === 'AUTH_REQUIRED') return 'Debes iniciar sesion nuevamente';
  if (error?.message === 'BACKEND_INVALID_RESPONSE') return 'Respuesta invalida de Netlify Functions';
  if (error?.message === 'BACKEND_NOT_DEPLOYED') return 'Funciones Netlify no desplegadas';
  return error?.message || fallback;
}

export function consultarReniecDni(dni) {
  return llamarFuncionSegura('reniec', {dni: String(dni)});
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
