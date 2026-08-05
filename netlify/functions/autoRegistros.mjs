import {createHash, randomBytes} from 'node:crypto';
import {z} from 'zod';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {enforceMemoryRateLimit} from './_rateLimit.mjs';
import {
  attachUserToContext,
  createRequestContext,
  logRequestError,
  logRequestStart,
  logRequestSuccess,
  queueAuditEvent,
} from './_observability.mjs';
import {corsHeaders, json, parseBody, requireFirebaseUser} from './_shared.mjs';
import {consultarReniecDniSeguro} from './reniec.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const MAX_DNI_ATTEMPTS = 2;
const MAX_EVIDENCE_BYTES = 650 * 1024;
const MAX_TOTAL_EVIDENCE_BYTES = 3 * 1024 * 1024;
const PUBLIC_ACTIONS = new Set(['status', 'verify', 'submit']);
const EVIDENCE_FIELDS = new Set(['dniFrente', 'dniReverso', 'reciboCompra', 'cajaEquipo', 'imeiLogico']);
const REQUIRED_EVIDENCE_FIELDS = ['dniFrente', 'dniReverso', 'imeiLogico'];
const REGISTRATION_STATUSES = new Set(['PENDIENTE', 'EN_REVISION', 'REGISTRADO']);

const tokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{40,100}$/, 'TOKEN_INVALIDO');
const dniSchema = z.string().trim().regex(/^\d{8}$/, 'DNI_INVALIDO');
const invitationCreateSchema = z.object({
  dni: dniSchema,
  expiresDays: z.number().int().min(1).max(30).default(7),
}).strict();

const submissionSchema = z.object({
  token: tokenSchema,
  dni: dniSchema,
  nombres: z.string().trim().min(3, 'NOMBRES_REQUERIDOS').max(160, 'NOMBRES_MUY_LARGOS'),
  celular: z.string().trim().regex(/^9\d{8}$/, 'CELULAR_INVALIDO'),
  correo: z.string().trim().toLowerCase().email('EMAIL_INVALIDO').max(180, 'EMAIL_MUY_LARGO'),
  direccion: z.string().trim().min(4, 'DIRECCION_REQUERIDA').max(300, 'DIRECCION_MUY_LARGA'),
  ciudad: z.string().trim().min(2, 'CIUDAD_REQUERIDA').max(100, 'CIUDAD_MUY_LARGA'),
  imei: z.string().trim().regex(/^\d{15}$/, 'IMEI_INVALIDO').refine(luhn, 'IMEI_LUHN_INVALIDO'),
  nombreEquipo: z.string().trim().min(2, 'EQUIPO_REQUERIDO').max(140, 'EQUIPO_MUY_LARGO'),
  fechaCompra: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'FECHA_COMPRA_INVALIDA'),
  precioCompra: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'PRECIO_INVALIDO')
    .refine(value => Number(value) > 0, 'PRECIO_DEBE_SER_MAYOR_A_CERO'),
  color: z.string().trim().min(2, 'COLOR_REQUERIDO').max(80, 'COLOR_MUY_LARGO'),
  memoria: z.string().trim().min(1, 'MEMORIA_REQUERIDA').max(20, 'MEMORIA_MUY_LARGA'),
  ram: z.string().trim().min(1, 'RAM_REQUERIDA').max(20, 'RAM_MUY_LARGA'),
  declaracionAceptada: z.literal(true, {message: 'DECLARACION_REQUERIDA'}),
  evidencias: z.record(z.string(), z.unknown()),
}).strict().superRefine((value, ctx) => {
  const purchaseDate = new Date(`${value.fechaCompra}T00:00:00.000Z`);
  if (Number.isNaN(purchaseDate.getTime()) || purchaseDate.getTime() > Date.now()) {
    ctx.addIssue({code: 'custom', path: ['fechaCompra'], message: 'FECHA_COMPRA_INVALIDA'});
  }
});

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function luhn(value) {
  let sum = 0;
  let shouldDouble = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw Object.assign(new Error('VALIDATION_ERROR'), {
    status: 400,
    payload: {
      issues: result.error.issues.map(issue => ({path: issue.path.join('.'), message: issue.message})),
    },
  });
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function invitationState(invitation, nowMs = Date.now()) {
  if (!invitation) return 'NO_ENCONTRADA';
  if (invitation.status === 'ELIMINADA') return 'ELIMINADA';
  if (invitation.status === 'COMPLETADA') return 'COMPLETADA';
  if (invitation.status === 'REVOCADA') return 'REVOCADA';
  if (invitation.status === 'BLOQUEADA' || Number(invitation.failedAttempts || 0) >= Number(invitation.maxAttempts || MAX_DNI_ATTEMPTS)) {
    return 'BLOQUEADA';
  }
  if (new Date(invitation.expiresAt || 0).getTime() <= nowMs) return 'VENCIDA';
  return 'ACTIVA';
}

function assertActiveInvitation(invitation) {
  const state = invitationState(invitation);
  if (state !== 'ACTIVA') {
    throw Object.assign(new Error(`ENLACE_${state}`), {status: state === 'NO_ENCONTRADA' ? 404 : 410});
  }
}

function publicInvitation(invitation) {
  const maxAttempts = Number(invitation.maxAttempts || MAX_DNI_ATTEMPTS);
  const failedAttempts = Number(invitation.failedAttempts || 0);
  return {
    state: invitationState(invitation),
    expiresAt: invitation.expiresAt || '',
    attemptsRemaining: Math.max(maxAttempts - failedAttempts, 0),
    verified: Boolean(invitation.verifiedAt),
    registrationStatus: REGISTRATION_STATUSES.has(invitation.registrationStatus)
      ? invitation.registrationStatus
      : '',
    nRegistro: invitation.nRegistro || '',
    statusUpdatedAt: invitation.statusUpdatedAt || invitation.submittedAt || '',
  };
}

function hasPreviousOperations(...snapshots) {
  return snapshots.some(snapshot => Number(snapshot?.size || 0) > 0 || snapshot?.empty === false);
}

function validateEvidence(evidencias) {
  const clean = {};
  let totalBytes = 0;

  for (const [key, rawEvidence] of Object.entries(evidencias || {})) {
    if (!EVIDENCE_FIELDS.has(key) || !rawEvidence) continue;
    if (!rawEvidence || typeof rawEvidence !== 'object') {
      throw Object.assign(new Error('EVIDENCIA_INVALIDA'), {status: 400});
    }
    const dataUrl = String(rawEvidence.dataUrl || '');
    const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw Object.assign(new Error('EVIDENCIA_FORMATO_INVALIDO'), {status: 400});
    const bytes = Buffer.byteLength(match[2], 'base64');
    if (!bytes || bytes > MAX_EVIDENCE_BYTES) {
      throw Object.assign(new Error('EVIDENCIA_MUY_GRANDE'), {status: 413});
    }
    totalBytes += bytes;
    clean[key] = {
      dataUrl,
      name: String(rawEvidence.name || `${key}.jpg`).slice(0, 160),
      type: `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`,
      size: bytes,
      width: Math.max(0, Math.min(Number(rawEvidence.width || 0), 10000)),
      height: Math.max(0, Math.min(Number(rawEvidence.height || 0), 10000)),
    };
  }

  for (const key of REQUIRED_EVIDENCE_FIELDS) {
    if (!clean[key]) {
      throw Object.assign(new Error('EVIDENCIA_REQUERIDA'), {status: 400, payload: {field: key}});
    }
  }
  if (totalBytes > MAX_TOTAL_EVIDENCE_BYTES) {
    throw Object.assign(new Error('EVIDENCIAS_MUY_GRANDES'), {status: 413});
  }
  return clean;
}

function parseSubmissionBody(body) {
  const {action: _action, ...payload} = body || {};
  return parseOrThrow(submissionSchema, payload);
}

function serializeInvitation(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    dni: data.dni || '',
    status: invitationState(data),
    failedAttempts: Number(data.failedAttempts || 0),
    maxAttempts: Number(data.maxAttempts || MAX_DNI_ATTEMPTS),
    createdAt: data.createdAt || '',
    expiresAt: data.expiresAt || '',
    submittedAt: data.submittedAt || '',
    submissionId: data.submissionId || '',
    registrationStatus: REGISTRATION_STATUSES.has(data.registrationStatus)
      ? data.registrationStatus
      : '',
    nRegistro: data.nRegistro || '',
  };
}

async function createInvitation(db, body, user, context) {
  const {dni, expiresDays} = parseOrThrow(invitationCreateSchema, {
    dni: body.dni,
    expiresDays: Number(body.expiresDays || 7),
  });
  const base = baseRef(db);
  const invitationsRef = base.collection('autoRegistroInvitaciones');
  const activeSnap = await invitationsRef.where('dni', '==', dni).limit(20).get();
  const batch = db.batch();
  const now = new Date();
  activeSnap.docs.forEach(doc => {
    if (invitationState(doc.data(), now.getTime()) === 'ACTIVA') {
      batch.set(doc.ref, {status: 'REVOCADA', revokedAt: now.toISOString(), revokedBy: user.email}, {merge: true});
    }
  });

  const token = randomBytes(32).toString('base64url');
  const invitationRef = invitationsRef.doc(hashToken(token));
  const invitation = {
    dni,
    status: 'ACTIVA',
    maxAttempts: MAX_DNI_ATTEMPTS,
    failedAttempts: 0,
    createdAt: now.toISOString(),
    createdBy: user.email,
    expiresAt: new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000).toISOString(),
  };
  batch.set(invitationRef, invitation);
  queueAuditEvent(batch, base, context, {
    entityType: 'autoRegistroInvitacion',
    entityId: invitationRef.id,
    action: 'create',
    metadata: {dni, expiresDays},
  });
  await batch.commit();
  return {invitation: {id: invitationRef.id, ...invitation}, token};
}

async function listInvitations(db) {
  const snapshot = await baseRef(db).collection('autoRegistroInvitaciones')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();
  return {invitations: snapshot.docs.filter(doc => doc.data()?.status !== 'ELIMINADA').map(serializeInvitation)};
}

async function revokeInvitation(db, body, user, context) {
  const id = String(body.id || '').trim();
  if (!/^[a-f0-9]{64}$/.test(id)) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});
  const base = baseRef(db);
  const ref = base.collection('autoRegistroInvitaciones').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('INVITACION_NO_ENCONTRADA'), {status: 404});
  if (invitationState(snapshot.data()) !== 'ACTIVA') {
    throw Object.assign(new Error('INVITACION_NO_ACTIVA'), {status: 409});
  }
  const batch = db.batch();
  batch.set(ref, {status: 'REVOCADA', revokedAt: new Date().toISOString(), revokedBy: user.email}, {merge: true});
  queueAuditEvent(batch, base, context, {
    entityType: 'autoRegistroInvitacion',
    entityId: id,
    action: 'revoke',
    metadata: {dni: snapshot.data()?.dni || ''},
  });
  await batch.commit();
  return {ok: true};
}

async function deleteInvitation(db, body, user, context) {
  const id = String(body.id || '').trim();
  if (!/^[a-f0-9]{64}$/.test(id)) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});
  const base = baseRef(db);
  const ref = base.collection('autoRegistroInvitaciones').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('INVITACION_NO_ENCONTRADA'), {status: 404});
  const data = snapshot.data() || {};
  if (data.status === 'ELIMINADA') return {ok: true, alreadyDeleted: true};
  const batch = db.batch();
  batch.set(ref, {
    status: 'ELIMINADA',
    deletedAt: new Date().toISOString(),
    deletedBy: user.email,
  }, {merge: true});
  queueAuditEvent(batch, base, context, {
    entityType: 'autoRegistroInvitacion',
    entityId: id,
    action: 'delete',
    metadata: {dni: data.dni || '', previousStatus: data.status || ''},
  });
  await batch.commit();
  return {ok: true};
}

async function getSubmission(db, body) {
  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});
  const ref = baseRef(db).collection('autoRegistroSolicitudes').doc(id);
  const [snapshot, evidenceSnapshot] = await Promise.all([ref.get(), ref.collection('evidencias').get()]);
  if (!snapshot.exists) throw Object.assign(new Error('SOLICITUD_NO_ENCONTRADA'), {status: 404});
  return {
    submission: {id: snapshot.id, ...snapshot.data()},
    evidencias: Object.fromEntries(evidenceSnapshot.docs.map(doc => [doc.id, doc.data()])),
  };
}

async function startSubmissionReview(db, body, user) {
  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});
  const base = baseRef(db);
  const submissionRef = base.collection('autoRegistroSolicitudes').doc(id);

  await db.runTransaction(async transaction => {
    const submissionSnapshot = await transaction.get(submissionRef);
    if (!submissionSnapshot.exists) throw Object.assign(new Error('SOLICITUD_NO_ENCONTRADA'), {status: 404});
    const submission = submissionSnapshot.data() || {};
    if (['EN_REVISION', 'REGISTRADO'].includes(submission.status)) return;
    if (!['PENDIENTE', 'EN_REVISION'].includes(submission.status)) {
      throw Object.assign(new Error('SOLICITUD_NO_REVISABLE'), {status: 409});
    }
    const invitationId = String(submission.invitationId || '');
    if (!/^[a-f0-9]{64}$/.test(invitationId)) {
      throw Object.assign(new Error('INVITACION_NO_ENCONTRADA'), {status: 404});
    }
    const invitationRef = base.collection('autoRegistroInvitaciones').doc(invitationId);
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists) throw Object.assign(new Error('INVITACION_NO_ENCONTRADA'), {status: 404});
    const now = new Date().toISOString();
    transaction.set(submissionRef, {
      status: 'EN_REVISION',
      reviewStartedAt: submission.reviewStartedAt || now,
      reviewStartedBy: user.email,
      updatedAt: now,
    }, {merge: true});
    transaction.set(invitationRef, {
      registrationStatus: 'EN_REVISION',
      statusUpdatedAt: now,
    }, {merge: true});
  });

  return getSubmission(db, {id});
}

async function getPublicStatus(db, body) {
  const token = parseOrThrow(tokenSchema, body.token);
  const snapshot = await baseRef(db).collection('autoRegistroInvitaciones').doc(hashToken(token)).get();
  if (!snapshot.exists) return {state: 'NO_ENCONTRADA', attemptsRemaining: 0, verified: false, expiresAt: ''};
  return publicInvitation(snapshot.data() || {});
}

async function verifyDni(db, body) {
  const token = parseOrThrow(tokenSchema, body.token);
  const dni = parseOrThrow(dniSchema, body.dni);
  const ref = baseRef(db).collection('autoRegistroInvitaciones').doc(hashToken(token));

  const verification = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw Object.assign(new Error('ENLACE_NO_ENCONTRADA'), {status: 404});
    const invitation = snapshot.data() || {};
    assertActiveInvitation(invitation);
    const maxAttempts = Number(invitation.maxAttempts || MAX_DNI_ATTEMPTS);
    const failedAttempts = Number(invitation.failedAttempts || 0);

    if (invitation.dni !== dni) {
      const nextAttempts = failedAttempts + 1;
      const blocked = nextAttempts >= maxAttempts;
      transaction.set(ref, {
        failedAttempts: nextAttempts,
        status: blocked ? 'BLOQUEADA' : 'ACTIVA',
        lastFailedAt: new Date().toISOString(),
      }, {merge: true});
      return {verified: false, state: blocked ? 'BLOQUEADA' : 'ACTIVA', attemptsRemaining: Math.max(maxAttempts - nextAttempts, 0)};
    }

    if (!invitation.verifiedAt) {
      transaction.set(ref, {verifiedAt: new Date().toISOString()}, {merge: true});
    }
    return {
      verified: true,
      state: 'ACTIVA',
      attemptsRemaining: Math.max(maxAttempts - failedAttempts, 0),
      cachedProfile: invitation.reniecName
        ? {fullName: invitation.reniecName, isReturningCustomer: Boolean(invitation.isReturningCustomer)}
        : null,
    };
  });

  if (!verification.verified || verification.cachedProfile) {
    return {
      verified: verification.verified,
      state: verification.state,
      attemptsRemaining: verification.attemptsRemaining,
      ...(verification.cachedProfile || {}),
    };
  }

  const base = baseRef(db);
  const [reniec, registroSnapshot, ventaSnapshot] = await Promise.all([
    consultarReniecDniSeguro(dni),
    base.collection('registros').where('dniCliente', '==', dni).limit(1).get(),
    base.collection('ventas').where('dniCliente', '==', dni).limit(1).get(),
  ]);
  const fullName = reniec.result.full_name;
  const isReturningCustomer = hasPreviousOperations(registroSnapshot, ventaSnapshot);
  await ref.set({
    reniecName: fullName,
    isReturningCustomer,
    reniecVerifiedAt: new Date().toISOString(),
  }, {merge: true});

  return {
    verified: true,
    state: verification.state,
    attemptsRemaining: verification.attemptsRemaining,
    fullName,
    isReturningCustomer,
  };
}

async function submitRequest(db, body, context) {
  const payload = parseSubmissionBody(body);
  const evidencias = validateEvidence(payload.evidencias);
  const base = baseRef(db);
  const invitationRef = base.collection('autoRegistroInvitaciones').doc(hashToken(payload.token));
  const submissionRef = base.collection('autoRegistroSolicitudes').doc();
  const now = new Date().toISOString();

  await db.runTransaction(async transaction => {
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists) throw Object.assign(new Error('ENLACE_NO_ENCONTRADA'), {status: 404});
    const invitation = invitationSnapshot.data() || {};
    assertActiveInvitation(invitation);
    if (!invitation.verifiedAt) throw Object.assign(new Error('DNI_NO_VERIFICADO'), {status: 403});
    if (invitation.dni !== payload.dni) throw Object.assign(new Error('DNI_NO_COINCIDE'), {status: 403});
    if (!invitation.reniecName) throw Object.assign(new Error('RENIEC_NO_VERIFICADO'), {status: 409});

    const {token: _token, evidencias: _evidencias, declaracionAceptada, ...requestData} = payload;
    transaction.set(submissionRef, {
      ...requestData,
      nombres: invitation.reniecName,
      isReturningCustomer: Boolean(invitation.isReturningCustomer),
      status: 'PENDIENTE',
      declaracionAceptada,
      penaltyNoticeAccepted: declaracionAceptada,
      penaltyAmountPerIncorrectField: 10,
      invitationId: invitationRef.id,
      createdAt: now,
      evidenceKeys: Object.keys(evidencias),
    });
    for (const [key, evidence] of Object.entries(evidencias)) {
      transaction.set(submissionRef.collection('evidencias').doc(key), evidence);
    }
    transaction.set(invitationRef, {
      status: 'COMPLETADA',
      registrationStatus: 'PENDIENTE',
      submittedAt: now,
      statusUpdatedAt: now,
      submissionId: submissionRef.id,
    }, {merge: true});
    queueAuditEvent(transaction, base, context, {
      entityType: 'autoRegistroSolicitud',
      entityId: submissionRef.id,
      action: 'submit',
      metadata: {dni: payload.dni, imei: payload.imei, evidenceKeys: Object.keys(evidencias)},
    });
  });

  return {ok: true, submissionId: submissionRef.id};
}

async function dispatchAdmin(db, body, user, context) {
  if (body.action === 'create') return createInvitation(db, body, user, context);
  if (body.action === 'list') return listInvitations(db);
  if (body.action === 'revoke') return revokeInvitation(db, body, user, context);
  if (body.action === 'delete') return deleteInvitation(db, body, user, context);
  if (body.action === 'getSubmission') return getSubmission(db, body);
  if (body.action === 'startReview') return startSubmissionReview(db, body, user);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

async function dispatchPublic(db, body, context) {
  if (body.action === 'status') return getPublicStatus(db, body);
  if (body.action === 'verify') return verifyDni(db, body);
  if (body.action === 'submit') return submitRequest(db, body, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export async function handler(event) {
  const context = createRequestContext(event, {name: 'autoRegistros'});
  const headers = {...corsHeaders(event), 'X-Request-Id': context.requestId};
  logRequestStart(context);

  if (event.httpMethod === 'OPTIONS') {
    logRequestSuccess(context, {statusCode: 204});
    return {statusCode: 204, headers, body: ''};
  }
  if (event.httpMethod !== 'POST') {
    return json(405, {error: 'Metodo no permitido', requestId: context.requestId}, headers);
  }

  try {
    const body = parseBody(event);
    const isPublic = PUBLIC_ACTIONS.has(body.action);
    let rateHeaders = {};
    let result;
    const db = getAdminDb();

    if (isPublic) {
      rateHeaders = enforceMemoryRateLimit({uid: 'public-auto-registro'}, context, {
        name: 'autoRegistros-public',
        max: 30,
        windowMs: 60 * 1000,
      });
      result = await dispatchPublic(db, body, context);
    } else {
      const user = await requireFirebaseUser(event);
      attachUserToContext(context, user);
      rateHeaders = enforceMemoryRateLimit(user, context, {
        name: 'autoRegistros-admin',
        max: 90,
        windowMs: 60 * 1000,
      });
      result = await dispatchAdmin(db, body, user, context);
    }

    logRequestSuccess(context, {statusCode: 200});
    return json(200, result, {...headers, ...rateHeaders});
  } catch (error) {
    logRequestError(context, error);
    return json(error.status || 500, {
      error: error.message || 'Error interno',
      requestId: context.requestId,
      ...(error.payload ? {details: error.payload} : {}),
    }, {...headers, ...(error.responseHeaders || {})});
  }
}

export const __test = {
  hasPreviousOperations,
  hashToken,
  invitationState,
  luhn,
  parseSubmissionBody,
  publicInvitation,
  validateEvidence,
};
