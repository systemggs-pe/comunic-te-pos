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

export async function llamarFuncionPublica(nombre, payload) {
  const resp = await fetch(`${BACKEND_BASE_URL}/api/${nombre}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  const requestId = resp.headers.get('x-request-id') || '';

  if (resp.status === 404 && looksLikeHtml(text)) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
    error.requestId = requestId;
    throw error;
  }
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error(IS_LOCAL_API_PROXY ? 'API_LOCAL_NO_DISPONIBLE' : 'BACKEND_INVALID_RESPONSE');
    error.status = resp.status;
    error.requestId = requestId;
    throw error;
  }
  if (!resp.ok) {
    const error = new Error(data.error || 'BACKEND_ERROR');
    error.status = resp.status;
    error.requestId = requestId || data.requestId || '';
    error.payload = data;
    throw error;
  }
  return data;
}

const VALIDATION_MESSAGES = {
  CELULAR_INVALIDO: 'el celular debe tener 9 digitos y empezar con 9',
  CIUDAD_REQUERIDA: 'la ciudad es obligatoria',
  COLOR_REQUERIDO: 'el color es obligatorio',
  DECLARACION_REQUERIDA: 'debes confirmar la declaración',
  EQUIPO_REQUERIDO: 'el nombre del equipo es obligatorio',
  FECHA_COMPRA_INVALIDA: 'la fecha de compra no es válida',
  MEMORIA_REQUERIDA: 'la memoria es obligatoria',
  NOMBRES_REQUERIDOS: 'los nombres y apellidos son obligatorios',
  RAM_REQUERIDA: 'la RAM es obligatoria',

  DIRECCION_REQUERIDA: 'la direccion es obligatoria',
  DOCUMENTO_INVALIDO: 'el numero de documento no es valido para el tipo elegido',
  DNI_INVALIDO: 'el DNI debe tener 8 digitos',
  DNI_NO_COINCIDE: 'el documento del cliente no coincide con el equipo o registro',
  EMAIL_INVALIDO: 'el correo electronico no es valido',
  EMAIL_MUY_LARGO: 'el correo electronico es demasiado largo',
  ESTADO_INVALIDO: 'el estado no es valido',
  ESTADO_SOLICITUD_INVALIDO: 'el estado de solicitud no es valido',
  ESTADO_SOLICITUD_REQUERIDO: 'elige PENDIENTE o REALIZADO',
  ESTADO_SOLICITUD_NO_APLICA: 'el estado de solicitud solo aplica a equipos no bloqueados',
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
  ORIGEN_EQUIPO_INVALIDO: 'elige TIENDA o PASE',
  PRECIO_DEBE_SER_MAYOR_A_CERO: 'el precio debe ser mayor a cero',
  PRECIO_INVALIDO: 'el precio debe tener maximo 2 decimales',
  PRECIO_MINIMO_BLOQUEADO: 'el precio minimo para un equipo bloqueado es S/. 50.00',
  PRECIO_MUY_LARGO: 'el precio es demasiado largo',
  PROVEEDOR_PASE_REQUERIDO: 'indica quién nos pasó el equipo',
  PROVEEDOR_PASE_NO_APLICA: 'solo corresponde cuando el origen es PASE',
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
  'registro.boletaExtranjeraId': 'Boleta extranjera APPLE',
  'registro.dniCliente': 'Documento',
  'registro.tipoDocumentoCliente': 'Tipo de documento',
  'registro.estado': 'Estado',
  'registro.estadoSolicitud': 'Estado de solicitud',
  'registro.fecha': 'Fecha',
  'registro.imeiEquipo': 'IMEI del equipo',
  'registro.imeiRegistrado': 'IMEI a registrar',
  'registro.imei2Equipo': 'IMEI 2',
  'registro.marcaEquipo': 'Marca',
  'registro.modeloEquipo': 'Modelo',
  'registro.nombreComercialEquipo': 'Nombre comercial',
  'registro.operador': 'Operador',
  'registro.precio': 'Precio',
  'registro.tieneCaja': 'Tiene caja',
  'registro.tipo': 'Tipo',
  'venta.celularCliente': 'Celular',
  'venta.precio': 'Precio',
  'venta.precioEquipo': 'Precio del equipo',
  'venta.medioPago': 'Medio de pago',
  'venta.origenEquipo': 'Origen del equipo',
  'venta.proveedorPase': 'Quién nos pasó el equipo',
  'venta.tipoDocumentoCliente': 'Tipo de documento',
  celular: 'Celular',
  ciudad: 'Ciudad',
  color: 'Color',
  correo: 'Correo',
  declaracionAceptada: 'Confirmación',
  direccion: 'Dirección',
  dni: 'DNI',
  fechaCompra: 'Fecha de compra',
  imei: 'IMEI',
  memoria: 'Memoria',
  nombreEquipo: 'Nombre del equipo',
  nombres: 'Nombres y apellidos',
  precioCompra: 'Precio de compra',
  ram: 'RAM',

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
  if (error?.message === 'BOLETA_APPLE_NO_ENCONTRADA' || error?.message === 'BOLETA_APPLE_REQUERIDA') {
    return 'No existe una boleta extranjera para el IMEI del equipo APPLE';
  }
  if (error?.message === 'BOLETA_SIN_EQUIPO' || error?.message === 'BOLETA_SIN_IMEI') return 'La boleta debe tener un equipo valido';
  if (error?.message === 'CODART_TOKEN_MISSING') return 'Falta configurar CODART_TOKEN o RENIEC_TOKEN en .env local';
  if (error?.message === 'ACTION_INVALIDA') return 'La accion solicitada no es valida';
  if (error?.message === 'DNI_FOTO_HISTORIAL_NO_ENCONTRADO') return 'No se encontro la consulta en el historial';
  if (error?.message === 'DNI_FOTO_SUCCESS_PROTEGIDA') return 'Las consultas exitosas no se pueden borrar';
  if (error?.message === 'DNI_FOTOS_UPSTREAM_ERROR') return 'No se pudo consultar la foto del DNI';
  if (error?.message === 'DNI_FOTO_TIPO_INVALIDO') return 'El tipo de foto DNI no es valido';
  if (error?.message === 'DNI_INVALIDO') return 'El DNI debe tener 8 digitos';
  if (error?.message === 'FIREBASE_ADMIN_CONFIG_MISSING') return 'Falta configurar Firebase Admin en .env local';
  if (error?.message === 'DNI_NO_VERIFICADO') return 'Verifica nuevamente el DNI antes de enviar';
  if (error?.message === 'EVIDENCIA_REQUERIDA') return 'Faltan ambas caras del DNI o la evidencia del IMEI lógico';
  if (error?.message === 'EVIDENCIA_FORMATO_INVALIDO') return 'Una evidencia tiene un formato no permitido';
  if (error?.message === 'EVIDENCIA_MUY_GRANDE') return 'Una imagen es demasiado pesada; toma otra con menor resolución';
  if (error?.message === 'EVIDENCIAS_MUY_GRANDES') return 'Las imágenes juntas son demasiado pesadas';
  if (error?.message?.startsWith('ENLACE_')) {
    if (error.message === 'ENLACE_VENCIDA') return 'El enlace venció; solicita uno nuevo a la tienda';
    if (error.message === 'ENLACE_BLOQUEADA') return 'El enlace está bloqueado';
    if (error.message === 'ENLACE_COMPLETADA') return 'La solicitud ya fue enviada';
    if (error.message === 'ENLACE_REVOCADA') return 'La tienda revocó este enlace';
    return 'El enlace no es válido';
  }

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
  if (error?.message === 'RENIEC_PERSONA_NO_ENCONTRADA') return 'RENIEC no encontró nombres y apellidos para este DNI';
  if (error?.message === 'RENIEC_NO_VERIFICADO') return 'Verifica nuevamente tus datos con RENIEC';
  if (error?.message === 'RENIEC_UPSTREAM_ERROR') return 'RENIEC no está disponible en este momento';
  if (error?.message === 'SOLICITUD_NO_ENCONTRADA') return 'No se encontró la solicitud del cliente';
  if (error?.message === 'SOLICITUD_NO_REVISABLE') return 'Esta solicitud ya no se puede revisar';
  if (error?.message === 'SOLICITUD_YA_PROCESADA') return 'Esta solicitud ya fue convertida en registro';
  if (error?.message === 'fetch failed') return 'No se pudo conectar con el servicio externo';
  return error?.message || fallback;
}

export function consultarReniecDni(dni) {
  return llamarFuncionSegura('reniec', {dni: String(dni)});
}

export function consultarDniFotos(dni, tipo = 'azul') {
  return llamarFuncionSegura('dniFotos', {action: 'consult', dni: String(dni), tipo});
}

export function consultarComprobanteApplePorImei(imei) {
  return llamarFuncionSegura('comprobanteApple', {imei: String(imei)});
}

export function listarDniFotosHistorial() {
  return llamarFuncionSegura('dniFotos', {action: 'list'});
}

export function obtenerDniFotoHistorial(id) {
  return llamarFuncionSegura('dniFotos', {action: 'get', id});
}

export function eliminarDniFotoHistorial(id) {
  return llamarFuncionSegura('dniFotos', {action: 'delete', id});
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

export function actualizarEstadoSolicitudRegistro(id, estadoSolicitud) {
  return llamarFuncionSegura('registros', {action: 'updateRequestStatus', id, estadoSolicitud});
}

export function marcarTodosRegistrosRealizados() {
  return llamarFuncionSegura('registros', {action: 'completeAllRequestStatuses'});
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

export function crearInvitacionAutoRegistro(dni, expiresDays = 7) {
  return llamarFuncionSegura('autoRegistros', {action: 'create', dni, expiresDays});
}

export function listarInvitacionesAutoRegistro() {
  return llamarFuncionSegura('autoRegistros', {action: 'list'});
}

export function revocarInvitacionAutoRegistro(id) {
  return llamarFuncionSegura('autoRegistros', {action: 'revoke', id});
}

export function obtenerSolicitudAutoRegistro(id) {
  return llamarFuncionSegura('autoRegistros', {action: 'getSubmission', id});
}

export function iniciarRevisionAutoRegistro(id) {
  return llamarFuncionSegura('autoRegistros', {action: 'startReview', id});
}

export function consultarEstadoAutoRegistro(token) {
  return llamarFuncionPublica('autoRegistros', {action: 'status', token});
}

export function verificarDniAutoRegistro(token, dni) {
  return llamarFuncionPublica('autoRegistros', {action: 'verify', token, dni});
}

export function enviarSolicitudAutoRegistro(payload) {
  return llamarFuncionPublica('autoRegistros', {action: 'submit', ...payload});
}
