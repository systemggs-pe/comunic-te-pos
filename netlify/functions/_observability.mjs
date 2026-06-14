import {randomUUID} from 'node:crypto';
import admin from 'firebase-admin';

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 25;
const MAX_OBJECT_KEYS = 50;
const SENSITIVE_KEYS = new Set([
  'authorization',
  'token',
  'idtoken',
  'password',
  'secret',
  'apikey',
  'api_key',
  'imagebase64',
  'dataurl',
  'pdfdniurl',
  'pdfcajaurl',
  'pdfrecibourl',
]);

export function getHeader(headers = {}, name) {
  const target = String(name || '').toLowerCase();
  const found = Object.entries(headers || {}).find(([key]) => String(key).toLowerCase() === target);
  return String(found?.[1] || '');
}

function safeString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value || '').slice(0, maxLength);
}

function getClientIp(event) {
  const forwarded = getHeader(event.headers, 'x-forwarded-for');
  const netlifyIp = getHeader(event.headers, 'x-nf-client-connection-ip');
  return safeString(netlifyIp || forwarded.split(',')[0] || '', 80);
}

function requestIdFromEvent(event) {
  return safeString(
    getHeader(event.headers, 'x-request-id') ||
    getHeader(event.headers, 'x-correlation-id') ||
    getHeader(event.headers, 'x-nf-request-id') ||
    randomUUID(),
    120,
  );
}

function functionNameFromEvent(event, options = {}) {
  return safeString(
    options.name ||
    options.rateLimit?.name ||
    String(event.path || '').split('/').filter(Boolean).at(-1) ||
    'netlify-function',
    80,
  );
}

export function createRequestContext(event, options = {}) {
  return {
    requestId: requestIdFromEvent(event),
    functionName: functionNameFromEvent(event, options),
    method: safeString(event.httpMethod || '', 12),
    path: safeString(event.path || event.rawUrl || '', 300),
    origin: safeString(getHeader(event.headers, 'origin'), 200),
    ipAddress: getClientIp(event),
    userAgent: safeString(getHeader(event.headers, 'user-agent'), 300),
    startedAtMs: Date.now(),
    user: null,
  };
}

export function attachUserToContext(context, user) {
  if (!context || !user) return context;
  context.user = {
    uid: safeString(user.uid, 160),
    email: safeString(user.email, 200),
  };
  return context;
}

function safeValue(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map(item => safeValue(item, depth + 1))
      .filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    if (depth >= 3) return '[object]';
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .filter(([key]) => !SENSITIVE_KEYS.has(String(key).toLowerCase()))
        .map(([key, item]) => [safeString(key, 80), safeValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return safeString(value);
}

export function sanitizeMetadata(metadata = {}) {
  return safeValue(metadata) || {};
}

function writeLog(level, eventName, context, fields = {}) {
  const durationMs = context?.startedAtMs ? Date.now() - context.startedAtMs : undefined;
  const entry = sanitizeMetadata({
    timestamp: new Date().toISOString(),
    level,
    event: eventName,
    service: 'netlify-functions',
    requestId: context?.requestId,
    functionName: context?.functionName,
    method: context?.method,
    path: context?.path,
    origin: context?.origin,
    ipAddress: context?.ipAddress,
    actorUid: context?.user?.uid,
    actorEmail: context?.user?.email,
    durationMs,
    ...fields,
  });

  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info(eventName, context, fields) {
    writeLog('info', eventName, context, fields);
  },
  warn(eventName, context, fields) {
    writeLog('warn', eventName, context, fields);
  },
  error(eventName, context, fields) {
    writeLog('error', eventName, context, fields);
  },
};

export function logRequestStart(context) {
  logger.info('request.start', context);
}

export function logRequestSuccess(context, fields = {}) {
  logger.info('request.success', context, fields);
}

export function logRequestError(context, error, fields = {}) {
  const statusCode = Number(error?.status || error?.statusCode || 500);
  logger[statusCode >= 500 ? 'error' : 'warn']('request.error', context, {
    statusCode,
    errorName: safeString(error?.name || 'Error', 120),
    errorMessage: safeString(error?.message || 'Error interno', 300),
    ...fields,
  });
  if (statusCode >= 500) {
    logger.error('monitoring.alert', context, {
      statusCode,
      errorMessage: safeString(error?.message || 'Error interno', 300),
    });
  }
}

export function queueAuditEvent(transaction, baseRef, context, event = {}) {
  if (!transaction || !baseRef) return '';
  const ref = baseRef.collection('auditEvents').doc();
  transaction.set(ref, {
    requestId: safeString(context?.requestId, 120),
    functionName: safeString(context?.functionName, 80),
    actorUid: safeString(context?.user?.uid, 160),
    actorEmail: safeString(context?.user?.email, 200),
    eventType: safeString(event.eventType || `${event.entityType || 'entity'}.${event.action || 'event'}`, 120),
    entityType: safeString(event.entityType, 80),
    entityId: safeString(event.entityId, 160),
    action: safeString(event.action, 80),
    status: safeString(event.status || 'success', 40),
    metadata: sanitizeMetadata(event.metadata || {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  });
  return ref.id;
}
