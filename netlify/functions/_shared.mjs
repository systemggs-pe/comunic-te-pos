const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
];

export function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (allowedOrigins.includes(origin) || /^https:\/\/.+\.netlify\.app$/.test(origin)) {
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
  return {uid: user.localId, email: user.email || ''};
}

export async function handlePost(event, callback) {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers, body: ''};
  }
  if (event.httpMethod !== 'POST') {
    return json(405, {error: 'Metodo no permitido'}, headers);
  }

  try {
    await requireFirebaseUser(event);
    const body = parseBody(event);
    return json(200, await callback(body), headers);
  } catch (error) {
    return json(error.status || 500, {
      error: error.message || 'Error interno',
      ...(error.payload ? {details: error.payload} : {}),
    }, headers);
  }
}

export function valueOrEmpty(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('*') || /^data in credit$/i.test(text)) return '';
  return text;
}
