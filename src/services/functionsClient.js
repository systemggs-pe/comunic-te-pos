import { auth } from '../lib/firebase.js';
import {APPLE_RECEIPT_MESSAGES} from '../features/registros/appleReceiptValidation.js';

const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');
const IS_LOCAL_API_PROXY = import.meta.env.DEV && !BACKEND_BASE_URL;

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

export async function llamarFuncionSegura(nombre, payload, {signal} = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const resp = await fetch(`${BACKEND_BASE_URL}/api/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    ...(signal ? {signal} : {}),
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

export async function llamarFuncionPublica(nombre, payload, {signal} = {}) {
  const resp = await fetch(`${BACKEND_BASE_URL}/api/${nombre}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    ...(signal ? {signal} : {}),
  });

  const text = await resp.text();
  const requestId = resp.headers.get('x-request-id') || '';
  if (looksLikeHtml(text)) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
    error.requestId = requestId;
    throw error;
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error('BACKEND_INVALID_RESPONSE');
    error.requestId = requestId;
    throw error;
  }
  if (resp.status === 404 && !data.error) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
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
  CELULARES_DUPLICADOS: 'el celular 2 debe ser diferente del celular 1',
  CIUDAD_REQUERIDA: 'la ciudad es obligatoria',
  COLOR_REQUERIDO: 'el color es obligatorio',
  DECLARACION_REQUERIDA: 'debes confirmar la declaración',
  EQUIPO_REQUERIDO: 'el nombre del equipo es obligatorio',
  FECHA_COMPRA_INVALIDA: 'la fecha de compra no es válida',
  MEMORIA_REQUERIDA: 'la memoria es obligatoria',
  NOMBRES_REQUERIDOS: 'los nombres y apellidos son obligatorios',
  RAM_REQUERIDA: 'la RAM es obligatoria',
  LINK_EXPIRADO: 'el link ya vencio',
  LINK_NO_ENCONTRADO: 'el link no existe o fue revocado',
  LINK_YA_USADO: 'este link ya fue usado',
  PROVINCIA_REQUERIDA: 'la provincia es obligatoria',
  SOLICITUD_NO_ENCONTRADA: 'la solicitud no existe',
  SOLICITUD_NO_LISTA: 'el cliente aun no completo la solicitud',
  SOLICITUD_TERMINADA_NO_ELIMINABLE: 'no se puede eliminar un link que ya genero un registro',
  TOKEN_INVALIDO: 'el link de solicitud no es valido',
  TRAMITE_INVALIDO: 'el tramite no es valido',

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
  IMEI2_NO_COINCIDE: 'el IMEI 2 del equipo no coincide con el registro',
  IMEIS_DUPLICADOS: 'el IMEI 1 y el IMEI 2 deben ser diferentes',
  IMEI_REGISTRADO_NO_PERTENECE: 'elige como IMEI a registrar uno de los IMEI del equipo',
  IMEI_DUAL_PRINCIPAL_REQUERIDO: 'el registro doble debe comenzar con el IMEI 1',
  IMEI2_REQUERIDO: 'ingresa el IMEI 2 para crear las dos solicitudes',
  IMEI_YA_REGISTRADO: 'el IMEI ya tiene un registro activo',
  IMEI_YA_VENDIDO: 'el IMEI ya tiene una venta registrada',
  ITEM_CANTIDAD_INVALIDA: 'la cantidad del item debe ser mayor a 0',
  ITEM_NOMBRE_REQUERIDO: 'el nombre del item es obligatorio',
  ITEMS_MUY_LARGOS: 'hay demasiados items adicionales',
  CONTACTOS_MUY_LARGOS: 'hay demasiados contactos registrados',
  MARCA_REQUERIDA: 'la marca es obligatoria',
  MARCA_NO_COINCIDE: 'la marca del equipo no coincide con el registro',
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
  TIPO_SAMSUNG_REQUERIDO: 'para Samsung elige TIENDA o EXTERNO',
  REGISTRO_DUAL_SOLO_SAMSUNG: 'el registro doble solo esta disponible para equipos Samsung',
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
  celular2: 'Celular 2',
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
  provincia: 'Provincia',
  ram: 'RAM',

};

function prettifyValidationIssue(issue = {}) {
  const label = FIELD_LABELS[issue.path] || issue.path?.replace(/venta\.itemsAdicionales\.\d+\./, 'Item ') || issue.path || 'Dato';
  const message = VALIDATION_MESSAGES[issue.message] || issue.message || 'valor invalido';
  return `${label}: ${message}`;
}

export function obtenerMensajeErrorFuncion(error, fallback = 'Error de servidor') {
  if (APPLE_RECEIPT_MESSAGES[error?.message] && error?.message !== 'IMEI_INVALIDO' && error?.message !== 'UPSTREAM_TIMEOUT') return APPLE_RECEIPT_MESSAGES[error.message];
  const issues = error?.payload?.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    return prettifyValidationIssue(issues[0]);
  }
  if (error?.message === 'AUTH_REQUIRED') return 'Debes iniciar sesion nuevamente';
  if (error?.message === 'API_LOCAL_ERROR') return 'La API local devolvio un error. Revisa la terminal de npm run dev';
  if (error?.message === 'API_LOCAL_NO_DISPONIBLE') return 'La API local no esta disponible. Ejecuta npm run dev';
  if (VALIDATION_MESSAGES[error?.message]) return VALIDATION_MESSAGES[error.message];
  if (error?.message === 'BACKEND_ERROR') return fallback;
  if (error?.message === 'PERMISO_INSUFICIENTE') return 'Tu usuario no tiene permisos para esta accion';
  if (error?.message === 'USUARIO_DESHABILITADO') return 'Tu usuario esta deshabilitado';
  if (error?.message === 'ROL_INVALIDO') return 'El rol elegido no es valido';
  if (error?.message === 'NO_EDITAR_PROPIO_ROL') return 'No puedes cambiar tu propio rol';
  if (error?.message === 'NO_ELIMINAR_PROPIO_ROL') return 'No puedes eliminar tu propio acceso';
  if (error?.message === 'BACKEND_INVALID_RESPONSE') return 'Respuesta invalida de Netlify Functions';
  if (error?.message === 'BACKEND_NOT_DEPLOYED') return 'Funciones Netlify no desplegadas';
  if (error?.message === 'CUERPO_MUY_GRANDE') return 'La solicitud supera el limite permitido';
  if (error?.message === 'MIME_NO_PERMITIDO') return 'El tipo de archivo o solicitud no esta permitido';
  if (error?.message === 'UPSTREAM_TIMEOUT') return 'El servicio externo tardo demasiado; intenta nuevamente';
  if (error?.message === 'GEMINI_NOT_CONFIGURED') return 'Falta configurar GEMINI_API_KEY en el servidor';
  if (error?.message === 'GEMINI_KEY_INVALID') return 'La clave de Gemini no es valida o vencio. Actualiza GEMINI_API_KEY en el servidor';
  if (error?.message === 'GEMINI_MODEL_INVALID' || error?.message === 'GEMINI_MODEL_UNAVAILABLE') return 'Revisa GEMINI_MODEL en el servidor; el modelo no esta disponible';
  if (error?.message === 'GEMINI_ACCESS_DENIED') return 'Gemini rechazo el acceso. Revisa la clave y sus permisos en el servidor';
  if (error?.message === 'GEMINI_RATE_LIMIT') return 'Gemini alcanzo su limite de uso. Espera o revisa la cuota del proyecto';
  if (error?.message === 'GEMINI_UPSTREAM_ERROR') return 'No se pudo conectar con Gemini. Intenta nuevamente en unos momentos';
  if (error?.message === 'GEMINI_INVALID_RESPONSE') return 'Gemini no devolvio datos validos. Repite la foto con la etiqueta enfocada';
  if (error?.message === 'GEMINI_NO_DATA') return 'No se encontraron datos legibles. Acerca la etiqueta y evita reflejos';
  if (error?.message === 'GEMINI_IMAGE_REJECTED') return 'Gemini no pudo procesar esa imagen. Usa una foto solo de la etiqueta';
  if (error?.message === 'BOLETA_EQUIPO_YA_EXISTE') {
    const imei = error?.payload?.details?.imei || error?.payload?.imei;
    return imei ? `El equipo ${imei} ya tiene una boleta extranjera` : 'Ese equipo ya tiene una boleta extranjera';
  }
  if (error?.message === 'BOLETA_NOT_FOUND') return 'No se encontro la boleta para editar';
  if (error?.message === 'BOLETA_APPLE_NO_ENCONTRADA' || error?.message === 'BOLETA_APPLE_REQUERIDA') {
    return 'No existe una boleta extranjera para el IMEI del equipo APPLE';
  }
  if (error?.message === 'APPLE_RECEIPTS_NOT_CONFIGURED') return 'Falta configurar APPLE_RECEIPTS_API_URL o APPLE_RECEIPTS_API_KEY en el servidor';
  if (error?.message === 'APPLE_RECEIPTS_ACCESS_DENIED') return 'El servicio externo de boletas rechazo las credenciales';
  if (error?.message === 'APPLE_RECEIPTS_RATE_LIMIT') return 'El servicio externo de boletas esta ocupado; intenta nuevamente';
  if (error?.message === 'APPLE_RECEIPTS_INVALID_RESPONSE') return 'El servicio externo devolvio una boleta invalida';
  if (error?.message === 'APPLE_RECEIPTS_UPSTREAM_ERROR') return 'No se pudo consultar la base externa de boletas';
  if (error?.message === 'BOLETA_SIN_EQUIPO' || error?.message === 'BOLETA_SIN_IMEI') return 'La boleta debe tener un equipo valido';
  if (error?.message === 'CODART_TOKEN_MISSING') return 'Falta configurar CODART_TOKEN o RENIEC_TOKEN en .env local';
  if (error?.message === 'CODART_TOKEN_INVALID') return 'El token de CODART no es valido o ya vencio';
  if (error?.message === 'CODART_CREDITOS_INSUFICIENTES') return 'No hay creditos suficientes en CODART';
  if (error?.message === 'CODART_RATE_LIMIT') return 'CODART recibio demasiadas consultas; intenta nuevamente en unos minutos';
  if (error?.message === 'ACTION_INVALIDA') return 'La accion solicitada no es valida';
  if (error?.message === 'DNI_FOTOS_UPSTREAM_ERROR') return 'No se pudo consultar la foto del DNI';
  if (error?.message === 'DNI_FOTOS_TIMEOUT') return 'CODART no entrego las imagenes dentro del tiempo de espera. La consulta puede haberse cobrado. No se reintentara automaticamente; revisa el movimiento en CODART.';
  if (error?.message === 'DNI_FOTOS_INVALID_RESPONSE') return 'CODART respondio sin imagenes utilizables. La consulta puede haberse cobrado. Revisa el movimiento antes de volver a consultar.';
  if (error?.message === 'DNI_FOTOS_IN_PROGRESS') return 'Este DNI ya se está consultando en otra ventana. Espera a que termine para volver a consultar.';
  if (error?.message === 'DNI_FOTO_TIPO_INVALIDO') return 'El tipo de foto DNI no es valido';
  if (error?.message === 'DNI_INVALIDO') return 'El DNI debe tener 8 digitos';
  if (error?.message === 'FIREBASE_ADMIN_CONFIG_MISSING') return 'Falta configurar Firebase Admin en .env local';
  if (error?.message === 'DNI_NO_VERIFICADO') return 'Verifica nuevamente el DNI antes de enviar';
  if (error?.message === 'EVIDENCIA_REQUERIDA') return 'Faltan ambas caras del DNI o la evidencia del IMEI lógico';
  if (error?.message === 'EVIDENCIA_FORMATO_INVALIDO') return 'Una evidencia tiene un formato no permitido';
  if (error?.message === 'EVIDENCIA_MUY_GRANDE') return 'Una imagen es demasiado pesada; toma otra con menor resolución';
  if (error?.message === 'EVIDENCIAS_MUY_GRANDES') return 'Las imágenes juntas son demasiado pesadas';
  if (error?.message === 'IMAGEN_MUY_GRANDE') return 'La imagen supera el limite permitido';
  if (error?.message === 'IMAGEN_BASE64_INVALIDA') return 'La imagen no tiene un formato valido';
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
  if (error?.message === 'fetch failed') return 'No se pudo conectar con el servicio externo';
  return error?.message || fallback;
}

export function consultarClienteParaRegistro(payload, options = {}) {
  return llamarFuncionSegura('clientes', {...payload, action: 'forRegistration'}, options);
}

export function consultarReniecDni(dni, options = {}) {
  return llamarFuncionSegura('reniec', {dni: String(dni)}, options);
}

export function consultarDniFotos(dni, tipo = 'azul', {refresh = false} = {}) {
  return llamarFuncionSegura('dniFotos', {dni: String(dni), tipo, ...(refresh ? {refresh: true} : {})});
}

export async function consultarComprobanteApplePorImei(imei) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {controller.abort(); reject(new Error('APPLE_RECEIPTS_TIMEOUT'));}, 25_000);
  });
  try {
    return await Promise.race([
      llamarFuncionSegura('comprobanteApple', {imei: String(imei)}, {signal: controller.signal}),
      deadline,
    ]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('APPLE_RECEIPTS_TIMEOUT');
    throw error;
  } finally {clearTimeout(timer);}
}

const CLIENTES_QUERY_TTL_MS = 20_000;
const clientesQueryCache = new Map();
const clientesQueryRequests = new Map();
const historialQueryCache = new Map();
const historialQueryRequests = new Map();

function invalidateClientesQueryCache() {
  clientesQueryCache.clear();
  historialQueryCache.clear();
}

async function runClientMutation(nombre, payload) {
  const result = await llamarFuncionSegura(nombre, payload);
  invalidateClientesQueryCache();
  registroImeiStatusCache.clear();
  return result;
}

export function crearRegistro(payload) {
  return runClientMutation('registros', {action: 'create', ...payload});
}

export function crearRegistroSamsungDual(payload) {
  return runClientMutation('registros', {action: 'createSamsungDual', ...payload});
}

export function actualizarRegistro(payload) {
  return runClientMutation('registros', {action: 'update', ...payload});
}

export function eliminarRegistro(id) {
  return runClientMutation('registros', {action: 'delete', id});
}

const registroImeiStatusCache = new Map();
const REGISTRO_IMEI_STATUS_TTL_MS = 20_000;

export function consultarEstadosRegistroImeis(imeis = []) {
  const values = Array.from(new Set(imeis.map(value => String(value || '').trim()).filter(Boolean))).sort();
  if (!values.length) return Promise.resolve({registeredImeis: []});
  const key = `${auth.currentUser?.uid || ''}|${values.join(',')}`;
  const cached = registroImeiStatusCache.get(key);
  if (cached?.expiresAt > Date.now()) return Promise.resolve(cached.data);

  return llamarFuncionSegura('registros', {action: 'checkImeis', imeis: values})
    .then(data => {
      if (registroImeiStatusCache.size >= 20) registroImeiStatusCache.clear();
      registroImeiStatusCache.set(key, {data, expiresAt: Date.now() + REGISTRO_IMEI_STATUS_TTL_MS});
      return data;
    });
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

export function generarSolicitudPublicaLink(dni) {
  return llamarFuncionSegura('solicitudesPublicas', {action: 'createLink', dni: String(dni)});
}

export function listarSolicitudesPublicas() {
  return llamarFuncionSegura('solicitudesPublicas', {action: 'list'});
}

export function terminarSolicitudPublica(payload) {
  return runClientMutation('solicitudesPublicas', {action: 'complete', ...payload});
}

export function marcarSolicitudPublicaRegistroTerminado(payload) {
  return runClientMutation('solicitudesPublicas', {action: 'completeExisting', ...payload});
}

export function eliminarSolicitudPublica(id) {
  return runClientMutation('solicitudesPublicas', {action: 'delete', id: String(id)});
}

export function cargarSolicitudPublica(token, options = {}) {
  return llamarFuncionPublica('solicitudesPublicas', {action: 'load', token: String(token)}, options);
}

export function consultarImeiSolicitudPublica(token, imei, options = {}) {
  return llamarFuncionPublica('solicitudesPublicas', {action: 'lookupImei', token: String(token), imei: String(imei)}, options);
}

export function enviarSolicitudPublica(token, data, options = {}) {
  return llamarFuncionPublica('solicitudesPublicas', {action: 'submit', token: String(token), data}, options);
}

export function crearVenta(payload) {
  return runClientMutation('ventas', {action: 'create', ...payload});
}

export function actualizarVenta(payload) {
  return runClientMutation('ventas', {action: 'update', ...payload});
}

export function eliminarVenta(id) {
  return runClientMutation('ventas', {action: 'delete', id});
}

export function actualizarCliente(payload) {
  return runClientMutation('clientes', {action: 'update', ...payload});
}

export function eliminarCliente(dni) {
  return runClientMutation('clientes', {action: 'delete', dni});
}

export function consultarClientesOperativos(payload = {}) {
  const userId = auth.currentUser?.uid || '';
  const key = `${userId}|${JSON.stringify(payload)}`;
  const now = Date.now();
  const cached = clientesQueryCache.get(key);
  if (cached?.expiresAt > now) return Promise.resolve(cached.data);
  if (clientesQueryRequests.has(key)) return clientesQueryRequests.get(key);

  const promise = llamarFuncionSegura('clientes', {action: 'queryOperational', ...payload})
    .then(data => {
      const isSearch = Boolean(String(payload.searchTerm || '').trim());
      const hasResults = Array.isArray(data?.clientes) && data.clientes.length > 0;
      if (!isSearch || hasResults) {
        if (clientesQueryCache.size >= 30) clientesQueryCache.clear();
        clientesQueryCache.set(key, {data, expiresAt: Date.now() + CLIENTES_QUERY_TTL_MS});
      }
      return data;
    })
    .finally(() => clientesQueryRequests.delete(key));
  clientesQueryRequests.set(key, promise);
  return promise;
}

export function consultarHistorialOperativo(payload = {}) {
  const userId = auth.currentUser?.uid || '';
  const key = `${userId}|${JSON.stringify(payload)}`;
  const now = Date.now();
  const cached = historialQueryCache.get(key);
  if (cached?.expiresAt > now) return Promise.resolve(cached.data);
  if (historialQueryRequests.has(key)) return historialQueryRequests.get(key);

  const promise = llamarFuncionSegura('clientes', {action: 'queryHistory', ...payload})
    .then(data => {
      const hasResults = ['clientes', 'ventas', 'registros']
        .some(name => Array.isArray(data?.[name]) && data[name].length > 0);
      if (hasResults) {
        if (historialQueryCache.size >= 30) historialQueryCache.clear();
        historialQueryCache.set(key, {data, expiresAt: Date.now() + CLIENTES_QUERY_TTL_MS});
      }
      return data;
    })
    .finally(() => historialQueryRequests.delete(key));
  historialQueryRequests.set(key, promise);
  return promise;
}

export function registrarConsentimientoLegal(payload) {
  return llamarFuncionSegura('legalConsent', payload);
}

export function obtenerSesionUsuario() {
  return llamarFuncionSegura('usuarios', {action: 'me'});
}

export function listarUsuariosSistema() {
  return llamarFuncionSegura('usuarios', {action: 'list'});
}

export function guardarUsuarioSistema(payload) {
  return llamarFuncionSegura('usuarios', {action: 'save', ...payload});
}

export function eliminarUsuarioSistema(email) {
  return llamarFuncionSegura('usuarios', {action: 'delete', email: String(email)});
}
