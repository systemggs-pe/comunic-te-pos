import {createHash, randomBytes} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {corsHeaders, json, parseBody, requireFirebaseUser} from './_shared.mjs';
import {createRequestContext, attachUserToContext, logRequestError, logRequestStart, logRequestSuccess, queueAuditEvent} from './_observability.mjs';
import {enforceMemoryRateLimit, enforcePersistentRateLimit} from './_rateLimit.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {createRegistro, deleteRegistro} from './registros.mjs';
import {findRemoteComprobanteAppleByImei} from './_appleReceiptsApi.mjs';
import {buildEquipoSearchTerms, buildMovimientoSearchTerms} from './_searchIndex.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const TOKEN_BYTES = 32;
const PUBLIC_MAX_BODY_BYTES = 24 * 1024;
const LINK_EXPIRATION_DAYS = 14;
const PUBLIC_ACTIONS = new Set(['load', 'submit', 'lookupImei']);
const AUTH_ACTIONS = new Set(['createLink', 'list', 'complete', 'delete']);

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function digits(value, max = 40) {
  return clean(value).replace(/\D/g, '').slice(0, max);
}

function luhn(value) {
  const imei = digits(value, 15);
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let index = 0; index < 15; index += 1) {
    let digit = Number(imei[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function tokenHash(token) {
  return createHash('sha256').update(clean(token)).digest('hex');
}

function generateToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function publicUrlFromEvent(event, token) {
  const origin = event.headers?.origin || event.headers?.Origin || process.env.URL || '';
  return `${String(origin || '').replace(/\/$/, '')}/solicitud/${token}`;
}

function validationError(issues) {
  throw Object.assign(new Error('VALIDATION_ERROR'), {status: 400, payload: {issues}});
}

function assertDni(value, path = 'dni') {
  const dni = digits(value, 8);
  if (!/^\d{8}$/.test(dni)) validationError([{path, message: 'DNI_INVALIDO'}]);
  return dni;
}

function assertRequiredUpper(payload, key, message, max = 180) {
  const value = upper(payload?.[key]).slice(0, max);
  if (!value) validationError([{path: key, message}]);
  return value;
}

function assertOptionalUpper(payload, key, max = 180) {
  return upper(payload?.[key]).slice(0, max);
}

function assertMoney(value, path) {
  const text = clean(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) < 0) {
    validationError([{path, message: 'PRECIO_INVALIDO'}]);
  }
  return text;
}

function assertPositiveMoney(value, path) {
  const text = assertMoney(value, path);
  if (Number(text) <= 0) validationError([{path, message: 'PRECIO_DEBE_SER_MAYOR_A_CERO'}]);
  return text;
}

function assertImei(value, path) {
  const imei = digits(value, 15);
  if (!/^\d{15}$/.test(imei)) validationError([{path, message: 'IMEI_INVALIDO'}]);
  if (!luhn(imei)) validationError([{path, message: 'IMEI_LUHN_INVALIDO'}]);
  return imei;
}

function optionalImei(value, path) {
  const imei = digits(value, 15);
  if (!imei) return '';
  if (!/^\d{15}$/.test(imei)) validationError([{path, message: 'IMEI_INVALIDO'}]);
  if (!luhn(imei)) validationError([{path, message: 'IMEI_LUHN_INVALIDO'}]);
  return imei;
}

function assertDate(value, path) {
  const text = clean(value);
  if (!text || Number.isNaN(Date.parse(text))) validationError([{path, message: 'FECHA_COMPRA_INVALIDA'}]);
  return new Date(text).toISOString();
}

function parseCreateLinkPayload(body) {
  return {dni: assertDni(body?.dni)};
}

function parseTokenPayload(body) {
  const token = clean(body?.token);
  if (!/^[A-Za-z0-9_-]{32,120}$/.test(token)) validationError([{path: 'token', message: 'TOKEN_INVALIDO'}]);
  return {token, tokenId: tokenHash(token)};
}

function parsePublicSubmission(body, link) {
  const tokenData = parseTokenPayload(body);
  const data = body?.data || {};
  const dni = assertDni(link.dni || data.dni);
  const imei1 = assertImei(data.imei1, 'imei1');
  const imei2 = optionalImei(data.imei2, 'imei2');
  if (imei2 && imei1 === imei2) validationError([{path: 'imei2', message: 'IMEIS_DUPLICADOS'}]);
  const imeiRegistrado = assertImei(data.imeiRegistrado || imei1, 'imeiRegistrado');
  if (![imei1, imei2].filter(Boolean).includes(imeiRegistrado)) validationError([{path: 'imeiRegistrado', message: 'IMEI_REGISTRADO_NO_PERTENECE'}]);
  const celular = digits(data.celular, 9);
  if (!/^9\d{8}$/.test(celular)) validationError([{path: 'celular', message: 'CELULAR_INVALIDO'}]);
  const correo = clean(data.correo).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) validationError([{path: 'correo', message: 'EMAIL_INVALIDO'}]);
  const fechaCompra = assertDate(data.fechaCompra, 'fechaCompra');
  return {
    ...tokenData,
    submission: {
      dni,
      nombres: assertRequiredUpper(data, 'nombres', 'NOMBRES_REQUERIDOS'),
      celular,
      correo,
      direccion: assertRequiredUpper(data, 'direccion', 'DIRECCION_REQUERIDA', 300),
      provincia: assertRequiredUpper(data, 'provincia', 'PROVINCIA_REQUERIDA', 120),
      imei1,
      imei2,
      imeiRegistrado,
      nombreEquipo: assertRequiredUpper(data, 'nombreEquipo', 'EQUIPO_REQUERIDO', 140),
      marca: assertRequiredUpper(data, 'marca', 'MARCA_REQUERIDA', 80),
      modelo: assertOptionalUpper(data, 'modelo', 100),
      ram: assertRequiredUpper(data, 'ram', 'RAM_REQUERIDA', 20),
      memoria: assertRequiredUpper(data, 'memoria', 'MEMORIA_REQUERIDA', 20),
      color: assertRequiredUpper(data, 'color', 'COLOR_REQUERIDO', 80),
      precioCompra: assertPositiveMoney(data.precioCompra, 'precioCompra'),
      fechaCompra,
      tieneCaja: data.tieneCaja === true || upper(data.tieneCaja) === 'SI',
      submittedAt: new Date().toISOString(),
    },
  };
}

function parseCompletePayload(body) {
  const id = clean(body?.id);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) validationError([{path: 'id', message: 'ID_INVALIDO'}]);
  const op = body?.operacion || {};
  const tramite = upper(op.tramite || 'REGISTRO');
  if (!['REGISTRO', 'DESBLOQUEO'].includes(tramite)) validationError([{path: 'tramite', message: 'TRAMITE_INVALIDO'}]);
  const tipo = upper(op.tipo || 'TIENDA');
  if (!['TIENDA', 'EXTERNO', 'PASE'].includes(tipo)) validationError([{path: 'tipo', message: 'TIPO_INVALIDO'}]);
  const operador = upper(op.operador || 'BITEL');
  if (!['CLARO', 'MOVISTAR', 'ENTEL', 'BITEL'].includes(operador)) validationError([{path: 'operador', message: 'OPERADOR_INVALIDO'}]);
  const imeiRegistrado = assertImei(op.imeiRegistrado, 'imeiRegistrado');
  const precio = tramite === 'DESBLOQUEO'
    ? assertPositiveMoney(op.precio, 'precio')
    : assertMoney(op.precio ?? '0', 'precio');
  if (tramite === 'DESBLOQUEO' && Number(precio) < 50) validationError([{path: 'precio', message: 'PRECIO_MINIMO_BLOQUEADO'}]);
  return {id, operacion: {tramite, tipo, operador, imeiRegistrado, precio}};
}

async function attachAppleReceiptForPublicRegistro(registro, context, options = {}) {
  if (String(registro?.marcaEquipo || '').toUpperCase() !== 'APPLE') return null;
  if (registro.boletaExtranjeraId) return null;
  const imei = registro.imeiRegistrado || registro.imeiEquipo;
  const comprobante = await findRemoteComprobanteAppleByImei(imei, {
    ...options,
    authorization: options.authorization || context?.authorization || '',
  });
  if (!comprobante?.id) {
    throw Object.assign(new Error('BOLETA_APPLE_NO_ENCONTRADA'), {
      status: 409,
      payload: {imei},
    });
  }
  registro.marcaEquipo = 'APPLE';
  registro.boletaExtranjeraId = comprobante.id;
  registro.boletaExtranjeraNro = String(comprobante.nBoleta || '');
  return comprobante;
}

function parseDeletePayload(body) {
  const id = clean(body?.id);
  if (!/^[a-f0-9]{64}$/.test(id)) validationError([{path: 'id', message: 'ID_INVALIDO'}]);
  return {id};
}

function parseLookupImeiPayload(body) {
  const tokenData = parseTokenPayload(body);
  return {...tokenData, imei: assertImei(body?.imei, 'imei')};
}

function sanitizeLink(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    dni: data.dni || '',
    nombreCliente: data.nombreCliente || '',
    status: data.status || '',
    publicUrl: data.publicUrl || '',
    createdAt: data.createdAtIso || '',
    submittedAt: data.submittedAt || '',
    completedAt: data.completedAt || '',
    completedRegistroId: data.completedRegistroId || '',
    completedNRegistro: data.completedNRegistro || '',
    submission: data.submission || null,
  };
}

async function findLinkByToken(db, token) {
  const ref = baseRef(db).collection('solicitudesPublicas').doc(tokenHash(token));
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('LINK_NO_ENCONTRADO'), {status: 404});
  return {ref, snap, data: snap.data() || {}};
}

async function findEquipmentByImei(base, imei) {
  const equiposRef = base.collection('equipos');
  const directSnap = await equiposRef.doc(imei).get();
  if (directSnap.exists) return {id: directSnap.id, data: directSnap.data() || {}};
  const secondarySnap = await equiposRef.where('imei2', '==', imei).limit(1).get();
  if (!secondarySnap.empty) {
    const doc = secondarySnap.docs[0];
    return {id: doc.id, data: doc.data() || {}};
  }
  return null;
}

async function getImeiRegistrationStatus(base, imeis) {
  const cleanImeis = [...new Set(imeis.map(imei => digits(imei, 15)).filter(imei => /^\d{15}$/.test(imei)))];
  if (!cleanImeis.length) return {};
  const registrosRef = base.collection('registros');
  const snapshots = await Promise.all(cleanImeis.flatMap(imei => [
    registrosRef.where('imeiRegistrado', '==', imei).limit(10).get(),
    registrosRef.where('imeiEquipo', '==', imei).limit(10).get(),
  ]));
  const statusByImei = Object.fromEntries(cleanImeis.map(imei => [imei, {registered: false, estadoSolicitud: ''}]));
  snapshots.flatMap(snapshot => snapshot.docs).forEach(doc => {
    const data = doc.data() || {};
    const registeredImei = digits(data.imeiRegistrado || data.imeiEquipo, 15);
    if (!statusByImei[registeredImei]) return;
    statusByImei[registeredImei] = {
      registered: true,
      estadoSolicitud: upper(data.estadoSolicitud || ''),
      registroId: doc.id,
    };
  });
  return statusByImei;
}

function publicEquipmentData(equipment) {
  const data = equipment?.data || {};
  return {
    imei1: digits(equipment?.id || data.idEquipo, 15),
    imei2: digits(data.imei2, 15),
    nombreEquipo: upper(data.nombreComercial || data.nombreEquipo || ''),
    marca: upper(data.marca || ''),
    modelo: upper(data.modelo || ''),
    ram: upper(data.ram || ''),
    memoria: upper(data.memoria || ''),
    color: upper(data.color || ''),
  };
}

async function lookupPublicImei(db, body) {
  const {token, imei} = parseLookupImeiPayload(body);
  const base = baseRef(db);
  const {data: linkData} = await findLinkByToken(db, token);
  const expired = linkData.expiresAt && Date.now() > Date.parse(linkData.expiresAt);
  if (expired) throw Object.assign(new Error('LINK_EXPIRADO'), {status: 410});
  if (['COMPLETADA', 'TERMINADA'].includes(linkData.status)) {
    throw Object.assign(new Error('LINK_YA_USADO'), {status: 409});
  }

  const equipment = await findEquipmentByImei(base, imei);
  const equipmentImeis = equipment
    ? [equipment.id, equipment.data?.idEquipo, equipment.data?.imei2]
    : [imei];
  const imeiStatuses = await getImeiRegistrationStatus(base, equipmentImeis);
  const ownerDni = digits(equipment?.data?.idDuenio || equipment?.data?.dniCliente || equipment?.data?.dni, 8);
  const belongsToRequester = Boolean(equipment && ownerDni && ownerDni === linkData.dni);

  return {
    ok: true,
    imei,
    found: Boolean(equipment),
    belongsToRequester,
    canAutofill: belongsToRequester,
    imeiStatuses,
    equipo: belongsToRequester ? publicEquipmentData(equipment) : null,
  };
}

async function createLink(db, body, user, context, event) {
  const {dni} = parseCreateLinkPayload(body);
  const base = baseRef(db);
  const token = generateToken();
  const tokenId = tokenHash(token);
  const clienteSnap = await base.collection('clientes').doc(dni).get();
  const nombreCliente = upper(clienteSnap.data()?.nombre || '');
  const publicUrl = publicUrlFromEvent(event, token);
  const nowIso = new Date().toISOString();
  const ref = base.collection('solicitudesPublicas').doc(tokenId);
  await ref.set({
    dni,
    nombreCliente,
    status: 'CREADA',
    publicUrl,
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: nowIso,
    expiresAt: new Date(Date.now() + LINK_EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    createdByUid: user.uid,
    createdByEmail: user.email,
  });
  const batch = db.batch();
  queueAuditEvent(batch, base, context, {
    entityType: 'solicitudPublica',
    entityId: tokenId,
    action: 'create-link',
    metadata: {dni, hasKnownClient: Boolean(nombreCliente)},
  });
  await batch.commit();
  return {id: tokenId, dni, nombreCliente, publicUrl, status: 'CREADA'};
}

async function listLinks(db) {
  const base = baseRef(db);
  const snap = await base
    .collection('solicitudesPublicas')
    .orderBy('createdAtIso', 'desc')
    .limit(80)
    .get();
  const batch = db.batch();
  let writes = 0;
  const solicitudes = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.status !== 'TERMINADA') {
      solicitudes.push(sanitizeLink(doc));
      continue;
    }
    const registro = await findCompletedRegistro(base, data);
    if (registro.exists) {
      if (!data.completedRegistroId && registro.id) {
        batch.set(doc.ref, {completedRegistroId: registro.id}, {merge: true});
        writes += 1;
      }
      solicitudes.push(sanitizeLink(doc));
      continue;
    }
    batch.delete(doc.ref);
    writes += 1;
  }
  if (writes > 0) await batch.commit();
  return {solicitudes};
}

async function findCompletedRegistro(base, solicitud) {
  const registrosRef = base.collection('registros');
  const completedRegistroId = clean(solicitud?.completedRegistroId);
  if (completedRegistroId) {
    const snap = await registrosRef.doc(completedRegistroId).get();
    if (snap.exists) return {exists: true, id: snap.id, data: snap.data() || {}};
  }
  const completedNRegistro = clean(solicitud?.completedNRegistro);
  if (completedNRegistro) {
    const snap = await registrosRef.where('nRegistro', '==', completedNRegistro).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return {exists: true, id: doc.id, data: doc.data() || {}};
    }
  }
  return {exists: false, id: '', data: null};
}

async function loadPublic(db, body) {
  const {token} = parseTokenPayload(body);
  const {data} = await findLinkByToken(db, token);
  const expired = data.expiresAt && Date.now() > Date.parse(data.expiresAt);
  if (expired && data.status !== 'COMPLETADA') {
    throw Object.assign(new Error('LINK_EXPIRADO'), {status: 410});
  }
  return {
    dni: data.dni || '',
    nombres: data.nombreCliente || '',
    status: data.status || 'CREADA',
    submitted: data.status === 'COMPLETADA' || data.status === 'TERMINADA',
  };
}

async function submitPublic(db, body, context) {
  const {token} = parseTokenPayload(body);
  const {ref, data} = await findLinkByToken(db, token);
  const parsed = parsePublicSubmission(body, data);
  const expired = data.expiresAt && Date.now() > Date.parse(data.expiresAt);
  if (expired) throw Object.assign(new Error('LINK_EXPIRADO'), {status: 410});
  if (['COMPLETADA', 'TERMINADA'].includes(data.status)) {
    throw Object.assign(new Error('LINK_YA_USADO'), {status: 409});
  }
  const imeiStatuses = await getImeiRegistrationStatus(baseRef(db), [parsed.submission.imeiRegistrado]);
  if (imeiStatuses[parsed.submission.imeiRegistrado]?.registered) {
    throw Object.assign(new Error('IMEI_YA_REGISTRADO'), {
      status: 409,
      payload: {imei: parsed.submission.imeiRegistrado},
    });
  }
  await ref.set({
    status: 'COMPLETADA',
    nombreCliente: parsed.submission.nombres,
    submission: parsed.submission,
    submittedAt: parsed.submission.submittedAt,
    submittedIpHash: createHash('sha256').update(clean(context.ipAddress)).digest('hex'),
  }, {merge: true});
  return {ok: true, status: 'COMPLETADA'};
}

async function completeRequest(db, body, user, context) {
  const {id, operacion} = parseCompletePayload(body);
  const base = baseRef(db);
  const ref = base.collection('solicitudesPublicas').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('SOLICITUD_NO_ENCONTRADA'), {status: 404});
  const solicitud = snap.data() || {};
  if (solicitud.status !== 'COMPLETADA') throw Object.assign(new Error('SOLICITUD_NO_LISTA'), {status: 409});
  const data = solicitud.submission || {};
  const imeis = [data.imei1, data.imei2].filter(Boolean);
  if (!imeis.includes(operacion.imeiRegistrado)) validationError([{path: 'imeiRegistrado', message: 'IMEI_REGISTRADO_NO_PERTENECE'}]);
  const estado = operacion.tramite === 'DESBLOQUEO' ? 'BLOQUEADO' : 'NO BLOQUEADO';
  const estadoSolicitud = estado === 'BLOQUEADO' ? '' : 'PENDIENTE';
  const fecha = new Date().toISOString();
  const cliente = {
    tipoDocumento: 'DNI',
    dni: data.dni,
    nombre: data.nombres,
    celular: data.celular,
    celularRef: '',
    correo: data.correo,
    direccion: `${data.direccion}, ${data.provincia}`,
    celulares: [data.celular],
    correos: [data.correo],
  };
  const equipo = {
    idEquipo: data.imei1,
    idDuenio: data.dni,
    imei2: data.imei2,
    sn: '',
    marca: data.marca,
    modelo: data.modelo,
    nombreComercial: data.nombreEquipo,
    ram: data.ram,
    memoria: data.memoria,
    color: data.color,
    isRegistrado: true,
    imei1Registrado: operacion.imeiRegistrado === data.imei1,
    imei2Registrado: operacion.imeiRegistrado === data.imei2,
  };
  const registro = {
    tipoDocumentoCliente: 'DNI',
    dniCliente: data.dni,
    celularCliente: data.celular,
    celularRef: '',
    correoCliente: data.correo,
    direccionCliente: cliente.direccion,
    imeiEquipo: data.imei1,
    imeiRegistrado: operacion.imeiRegistrado,
    imei2Equipo: data.imei2,
    modeloEquipo: data.modelo,
    marcaEquipo: data.marca,
    nombreComercialEquipo: data.nombreEquipo,
    estado,
    estadoSolicitud,
    operador: operacion.operador,
    tipo: operacion.tipo,
    tieneCaja: Boolean(data.tieneCaja),
    precio: operacion.precio,
    fecha,
    boletaExtranjeraId: '',
    boletaExtranjeraNro: '',
    pdfDniUrl: '',
    pdfCajaUrl: '',
    pdfReciboUrl: '',
  };
  const preverifiedAppleReceipt = await attachAppleReceiptForPublicRegistro(registro, context);
  const result = await createRegistro(db, {cliente, equipo, registro}, context, {
    authorization: context.authorization || '',
    ...(preverifiedAppleReceipt ? {preverifiedAppleReceipt} : {}),
  });
  await ref.set({
    status: 'TERMINADA',
    completedAt: new Date().toISOString(),
    completedByUid: user.uid,
    completedByEmail: user.email,
    completedRegistroId: result.id,
    completedNRegistro: result.registro?.nRegistro || '',
    completedOperacion: operacion,
    searchTerms: [
      ...buildEquipoSearchTerms(equipo, cliente.nombre),
      ...buildMovimientoSearchTerms(registro, cliente.nombre),
    ].slice(0, 80),
  }, {merge: true});
  return {ok: true, solicitudId: id, registro: result.registro};
}

async function deleteLink(db, body, user, context) {
  const {id} = parseDeletePayload(body);
  const base = baseRef(db);
  const ref = base.collection('solicitudesPublicas').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('SOLICITUD_NO_ENCONTRADA'), {status: 404});
  const data = snap.data() || {};
  const linkedRegistro = data.status === 'TERMINADA'
    ? await findCompletedRegistro(base, data)
    : {exists: false, id: ''};
  if (linkedRegistro.exists) {
    await deleteRegistro(db, {id: linkedRegistro.id}, context);
  }
  const batch = db.batch();
  batch.delete(ref);
  queueAuditEvent(batch, base, context, {
    entityType: 'solicitudPublica',
    entityId: id,
    action: 'delete-link',
    metadata: {
      dni: data.dni || '',
      status: data.status || '',
      deletedByEmail: user.email || '',
      hadSubmission: Boolean(data.submission),
      deletedRegistroId: linkedRegistro.id || '',
      completedNRegistro: data.completedNRegistro || '',
    },
  });
  await batch.commit();
  return {ok: true, deletedId: id, deletedRegistroId: linkedRegistro.id || ''};
}

async function handlePublicPost(event, callback, options = {}) {
  const context = createRequestContext(event, options);
  const headers = {...corsHeaders(event), 'X-Request-Id': context.requestId};
  logRequestStart(context);
  if (event.httpMethod === 'OPTIONS') {
    logRequestSuccess(context, {statusCode: 204});
    return {statusCode: 204, headers, body: ''};
  }
  if (event.httpMethod !== 'POST') return json(405, {error: 'Metodo no permitido', requestId: context.requestId}, headers);
  try {
    const body = parseBody(event, PUBLIC_MAX_BODY_BYTES);
    const action = clean(body?.action);
    let user = null;
    let rateLimitHeaders = {};
    if (PUBLIC_ACTIONS.has(action)) {
      rateLimitHeaders = enforceMemoryRateLimit({uid: 'public'}, context, {
        name: 'solicitudesPublicasPublic',
        max: 30,
        windowMs: 60 * 1000,
      });
    } else if (AUTH_ACTIONS.has(action)) {
      user = await requireFirebaseUser(event);
      attachUserToContext(context, user);
      context.authorization = event.headers?.authorization || event.headers?.Authorization || '';
      rateLimitHeaders = await enforcePersistentRateLimit(user, context, {
        name: 'solicitudesPublicas',
        max: 90,
        windowMs: 60 * 1000,
      });
    } else {
      throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
    }
    const result = await callback(body, user, context);
    logRequestSuccess(context, {statusCode: 200});
    return json(200, result, {...headers, ...rateLimitHeaders});
  } catch (error) {
    logRequestError(context, error);
    return json(error.status || 500, {
      error: error.message || 'Error interno',
      requestId: context.requestId,
      ...(error.payload ? {details: error.payload} : {}),
    }, {...headers, ...(error.responseHeaders || {})});
  }
}

async function dispatch(body, user, context, event) {
  const db = getAdminDb();
  const action = clean(body?.action);
  if (action === 'createLink') return createLink(db, body, user, context, event);
  if (action === 'list') return listLinks(db);
  if (action === 'load') return loadPublic(db, body);
  if (action === 'lookupImei') return lookupPublicImei(db, body);
  if (action === 'submit') return submitPublic(db, body, context);
  if (action === 'complete') return completeRequest(db, body, user, context);
  if (action === 'delete') return deleteLink(db, body, user, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const __test = {
  luhn,
  parseCreateLinkPayload,
  parsePublicSubmission,
  parseCompletePayload,
  parseDeletePayload,
  parseLookupImeiPayload,
  attachAppleReceiptForPublicRegistro,
  findCompletedRegistro,
  listLinks,
  deleteLink,
  publicEquipmentData,
  tokenHash,
};

export const handler = event => handlePublicPost(event, (body, user, context) => dispatch(body, user, context, event), {
  name: 'solicitudesPublicas',
});
