import {createServer} from 'node:http';
import {readFileSync, existsSync, createReadStream} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = join(rootDir, 'dist');

loadEnv(join(rootDir, '.env'));
loadEnv(join(rootDir, 'functions', '.env'));

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 3001);
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBLosM4ocr9OBLcpcRUc5QF3k8eVc4h5mA';
const RENIEC_URL = 'https://api-codart.cgrt.org/api/v1/consultas/reniec/dni';
const rateLimits = new Map();

function loadEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(Object.assign(new Error('Payload demasiado grande'), {status: 413}));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON invalido'), {status: 400}));
      }
    });
    req.on('error', reject);
  });
}

async function verifyFirebaseToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error('No autorizado'), {status: 401});

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
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

function enforceRateLimit(res, user, name, max = 60, windowMs = 60 * 1000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${name}:${user.uid}:${bucket}`;
  const current = rateLimits.get(key) || 0;
  const resetSeconds = Math.ceil(((bucket + 1) * windowMs - now) / 1000);

  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(max - current - 1, 0)));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));

  if (current >= max) {
    throw Object.assign(new Error('Demasiadas solicitudes. Intenta de nuevo en unos segundos.'), {status: 429});
  }
  rateLimits.set(key, current + 1);
}

function valueOrEmpty(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('*') || /^data in credit$/i.test(text)) return '';
  return text;
}

function normalizeReniecResponse(data, dni) {
  const result = data?.result || data?.data || data?.persona || data || {};
  const nombres = valueOrEmpty(result.nombres || result.first_name);
  const apellidoPaterno = valueOrEmpty(result.apellidoPaterno || result.apellido_paterno || result.first_last_name);
  const apellidoMaterno = valueOrEmpty(result.apellidoMaterno || result.apellido_materno || result.second_last_name);
  const fullName = valueOrEmpty(
    result.full_name ||
    result.nombreCompleto ||
    result.nombre_completo ||
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' '),
  );

  return {
    success: Boolean(data?.success ?? fullName),
    source: data?.source || 'RENIEC_BACKEND',
    result: {
      ...result,
      document_number: valueOrEmpty(result.document_number || result.dni || dni),
      first_name: nombres,
      first_last_name: apellidoPaterno,
      second_last_name: apellidoMaterno,
      full_name: fullName,
      address: valueOrEmpty(result.address || result.direccion),
      phone: valueOrEmpty(result.phone || result.telefono),
      email: valueOrEmpty(result.email || result.correo),
    },
  };
}

async function consultarReniec(body) {
  const dni = String(body?.dni || '').replace(/\D/g, '').slice(0, 8);
  if (dni.length !== 8) throw Object.assign(new Error('DNI invalido'), {status: 400});
  if (!process.env.RENIEC_TOKEN) throw Object.assign(new Error('RENIEC_TOKEN_MISSING'), {status: 500});

  const response = await fetch(`${RENIEC_URL}/${dni}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RENIEC_TOKEN}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || data.message || 'RENIEC_UPSTREAM_ERROR'), {status: response.status});
  }
  return normalizeReniecResponse(data, dni);
}

async function analizarCajaGemini(body) {
  const imageBase64 = String(body?.imageBase64 || '');
  if (!imageBase64) throw Object.assign(new Error('Falta imageBase64'), {status: 400});
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('Falta configurar GEMINI_API_KEY en functions/.env'), {status: 500});
  }

  const prompt = `Eres un experto en OCR de cajas de celulares. La imagen puede estar oscura, borrosa o con reflejo. Tu tarea es extraer TODOS los datos que puedas leer, aunque sean parciales.

REGLA MAS IMPORTANTE: Siempre responde con un JSON valido. NUNCA digas que no puedes leer. Si un dato es ilegible, deja el campo vacio "". Pero si puedes leer ALGO del campo, ponlo aunque no estes 100% seguro.

Responde UNICAMENTE con este JSON (sin backticks, sin explicaciones):
{"imei1":"","imei2":"","sn":"","marca":"","modelo":"","nombreComercial":"","ram":"","memoria":"","color":""}

Guia de extraccion:
- imei1: numero de 15 digitos cerca de la palabra "IMEI" o "IMEI 1". Solo digitos.
- imei2: segundo numero de 15 digitos cerca de "IMEI 2". Solo digitos. Si no hay, "".
- sn: alfanumerico junto a "S/N", "SN:", "Serial No" o "Serial Number".
- marca: SAMSUNG / XIAOMI / MOTOROLA / APPLE / OPPO / REALME / HUAWEI / VIVO / TECNO / INFINIX / ONEPLUS / NOKIA. En mayusculas.
- modelo: codigo tecnico como SM-A566E, 23053RN02A, XT2343-1. En mayusculas.
- nombreComercial: nombre de marketing como GALAXY A56, REDMI NOTE 13. En mayusculas.
- ram: solo numero en GB. Si dice "8GB RAM" -> "8".
- memoria: solo numero en GB de almacenamiento. Si dice "256GB" -> "256".
- color: color en mayusculas. Ej: NEGRO, AZUL, BLANCO.

Aunque la imagen sea dificil de leer, SIEMPRE devuelve el JSON con lo que puedas extraer.`;

  const modelo = 'gemini-flash-latest';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: 'image/jpeg', data: imageBase64}},
        {text: prompt},
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 1024},
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || data.error || 'GEMINI_UPSTREAM_ERROR'), {
      status: response.status,
      payload: data,
    });
  }
  return data;
}

async function handleApi(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, {error: 'Metodo no permitido'});
    return;
  }

  try {
    const user = await verifyFirebaseToken(req);
    const body = await readBody(req);
    const path = new URL(req.url, 'http://localhost').pathname;

    if (path === '/api/reniec') {
      enforceRateLimit(res, user, 'reniec', 60);
      sendJson(res, 200, await consultarReniec(body));
      return;
    }

    if (path === '/api/analizarCajaGemini') {
      enforceRateLimit(res, user, 'gemini', 15);
      sendJson(res, 200, await analizarCajaGemini(body));
      return;
    }

    sendJson(res, 404, {error: 'API_NOT_FOUND'});
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || 'Error interno',
      ...(error.payload ? {details: error.payload} : {}),
    });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = resolve(join(distDir, requested));
  const safePath = filePath.startsWith(distDir) && existsSync(filePath) ? filePath : join(distDir, 'index.html');
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  }[extname(safePath)] || 'application/octet-stream';

  res.writeHead(200, {'Content-Type': type});
  createReadStream(safePath).pipe(res);
}

createServer((req, res) => {
  if (req.url === '/health') {
    sendJson(res, 200, {ok: true});
    return;
  }
  if (req.url?.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Backend listo en http://localhost:${PORT}`);
});
