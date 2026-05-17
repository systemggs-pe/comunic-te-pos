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
const DEFAULT_ALLOWED_EMAILS = [
  'brand050103@gmail.com',
  'lauryruyz50@gmail.com',
];
const rateLimits = new Map();

function getAllowedEmails() {
  const configured = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_EMAILS);
}

function requireAllowedUser(user) {
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || !user.emailVerified || !getAllowedEmails().has(email)) {
    throw Object.assign(new Error('No autorizado'), {status: 403});
  }
}

export function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

export function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw Object.assign(new Error('JSON invalido'), {status: 400});
  }
}

export async function requireFirebaseUser(event) {
  const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBLosM4ocr9OBLcpcRUc5QF3k8eVc4h5mA';
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error('No autorizado'), {status: 401});

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({idToken: match[1]}),
  });
  const data = await response.json().catch(() => ({}));
  const user = data.users?.[0];
  if (!response.ok || !user?.localId) {
    throw Object.assign(new Error('Sesion invalida'), {status: 401});
  }
  requireAllowedUser(user);
  return {uid: user.localId, email: user.email || ''};
}

function enforceRateLimit(user, rateLimit = {}) {
  if (!rateLimit.name || !rateLimit.max) return {};

  const windowMs = rateLimit.windowMs || 60 * 1000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${rateLimit.name}:${user.uid}:${bucket}`;
  const current = rateLimits.get(key) || 0;
  const resetSeconds = Math.ceil(((bucket + 1) * windowMs - now) / 1000);
  const headers = {
    'X-RateLimit-Limit': String(rateLimit.max),
    'X-RateLimit-Remaining': String(Math.max(rateLimit.max - current - 1, 0)),
    'X-RateLimit-Reset': String(resetSeconds),
  };

  if (current >= rateLimit.max) {
    throw Object.assign(new Error('Demasiadas solicitudes. Intenta de nuevo en unos segundos.'), {
      status: 429,
      responseHeaders: headers,
    });
  }
  rateLimits.set(key, current + 1);
  return headers;
}

export async function handlePost(event, callback, options = {}) {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers, body: ''};
  }
  if (event.httpMethod !== 'POST') {
    return json(405, {error: 'Metodo no permitido'}, headers);
  }

  try {
    const user = await requireFirebaseUser(event);
    const rateLimitHeaders = enforceRateLimit(user, options.rateLimit);
    const body = parseBody(event);
    return json(200, await callback(body, user), {...headers, ...rateLimitHeaders});
  } catch (error) {
    return json(error.status || 500, {
      error: error.message || 'Error interno',
      ...(error.payload ? {details: error.payload} : {}),
    }, {...headers, ...(error.responseHeaders || {})});
  }
}

export function valueOrEmpty(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('*') || /^data in credit$/i.test(text)) return '';
  return text;
}
