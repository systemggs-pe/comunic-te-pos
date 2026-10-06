import {
  attachUserToContext,
  createRequestContext,
  logRequestError,
  logRequestStart,
  logRequestSuccess,
} from './_observability.mjs';
import {enforceMemoryRateLimit, enforcePersistentRateLimit} from './_rateLimit.mjs';
import {getAdminAuth, getAdminDb} from './_firebaseAdmin.mjs';
import {resolveUserAccess} from './_roles.mjs';

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
export const DEFAULT_EXTERNAL_TIMEOUT_MS = 10 * 1000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://comunicate-tacna.web.app',
  'https://comunicate-tacna.firebaseapp.com',
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
].filter(Boolean);
export function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Expose-Headers': 'X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
  };

  if (allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  return headers;
}

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function getHeader(event, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] || '';
}

export function parseBody(event, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const body = String(event.body || '');
  const contentLength = Number(getHeader(event, 'content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error('CUERPO_MUY_GRANDE'), {status: 413});
  }
  if (Buffer.byteLength(body, 'utf8') > maxBytes) {
    throw Object.assign(new Error('CUERPO_MUY_GRANDE'), {status: 413});
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error('JSON invalido'), {status: 400});
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_EXTERNAL_TIMEOUT_MS);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('UPSTREAM_TIMEOUT'), {status: 504, code: 'UPSTREAM_TIMEOUT'});
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requireFirebaseUser(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error('No autorizado'), {status: 401});

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1], true);
    const user = {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: Boolean(decoded.email_verified),
    };
    return await resolveUserAccess(getAdminDb(), user);
  } catch (error) {
    if (error?.status === 403 || error?.status === 500) throw error;
    throw Object.assign(new Error('Sesion invalida'), {status: 401});
  }
}

export async function handlePost(event, callback, options = {}) {
  const context = createRequestContext(event, options);
  const headers = {
    ...corsHeaders(event),
    'X-Request-Id': context.requestId,
  };
  logRequestStart(context);

  if (event.httpMethod === 'OPTIONS') {
    logRequestSuccess(context, {statusCode: 204});
    return {statusCode: 204, headers, body: ''};
  }
  if (event.httpMethod !== 'POST') {
    const error = Object.assign(new Error('Metodo no permitido'), {status: 405});
    logRequestError(context, error);
    return json(405, {error: error.message, requestId: context.requestId}, headers);
  }

  try {
    const user = await requireFirebaseUser(event);
    attachUserToContext(context, user);
    const contentType = getHeader(event, 'content-type');
    if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw Object.assign(new Error('MIME_NO_PERMITIDO'), {status: 415});
    }
    const body = parseBody(event, options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
    const rateLimit = options.rateLimit || {};
    const rateLimitHeaders = rateLimit.distributed
      ? await enforcePersistentRateLimit(user, context, rateLimit)
      : enforceMemoryRateLimit(user, context, rateLimit);
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

export function valueOrEmpty(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('*') || /^data in credit$/i.test(text)) return '';
  return text;
}
