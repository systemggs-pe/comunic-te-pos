import {existsSync, readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const routeModules = {
  '/api/analizarCajaGemini': '../netlify/functions/analizarCajaGemini.mjs',
  '/api/clientes': '../netlify/functions/clientes.mjs',
  '/api/registros': '../netlify/functions/registros.mjs',
  '/api/reniec': '../netlify/functions/reniec.mjs',
  '/api/ventas': '../netlify/functions/ventas.mjs',
};
const shellEnvKeys = new Set(Object.keys(process.env));

function parseEnvValue(value) {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

function loadEnvFile(fileName) {
  const filePath = resolve(rootDir, fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || shellEnvKeys.has(key)) continue;

    process.env[key] = parseEnvValue(trimmed.slice(separator + 1));
  }
}

function ensureLocalAllowedOrigins() {
  const origins = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );

  for (let port = 5173; port <= 5185; port += 1) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }

  process.env.ALLOWED_ORIGINS = Array.from(origins).join(',');
}

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    const maxSize = 12 * 1024 * 1024;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        rejectBody(Object.assign(new Error('PAYLOAD_TOO_LARGE'), {statusCode: 413}));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

function getQueryParams(url) {
  return Object.fromEntries(url.searchParams.entries());
}

async function getHandler(pathname) {
  const modulePath = routeModules[pathname];
  if (!modulePath) return null;
  const moduleUrl = new URL(modulePath, import.meta.url);
  const module = await import(moduleUrl.href);
  return module.handler;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function hasFirebaseAdminConfig() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
  );
}

function logConfigHints() {
  const hints = [];
  if (!process.env.RENIEC_TOKEN) hints.push('RENIEC_TOKEN no esta configurado; /api/reniec fallara.');
  if (!process.env.GEMINI_API_KEY) hints.push('GEMINI_API_KEY no esta configurado; /api/analizarCajaGemini fallara.');
  if (!hasFirebaseAdminConfig()) {
    hints.push('Firebase Admin no esta configurado; /api/registros y /api/ventas fallaran.');
  }

  if (hints.length) {
    console.warn('Avisos de configuracion local:');
    for (const hint of hints) console.warn(`- ${hint}`);
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');
ensureLocalAllowedOrigins();
logConfigHints();

const port = Number(process.env.BACKEND_PORT || 3001);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${port}`}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  try {
    const handler = await getHandler(pathname);
    if (!handler) {
      sendJson(res, 404, {error: 'API_LOCAL_ROUTE_NOT_FOUND', path: pathname});
      return;
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readRequestBody(req);
    const response = await handler({
      httpMethod: req.method,
      path: pathname,
      rawUrl: url.href,
      headers: req.headers,
      body,
      queryStringParameters: getQueryParams(url),
    });

    const statusCode = response?.statusCode || 200;
    const headers = response?.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) res.setHeader(key, value);
    }
    res.statusCode = statusCode;
    res.end(response?.body || '');
    if (statusCode >= 400) {
      console.warn(`[API local] ${req.method} ${pathname} -> ${statusCode}: ${response?.body || ''}`);
    }
  } catch (error) {
    console.error(`[API local] ${req.method} ${pathname} -> ${error.statusCode || 500}: ${error.message}`);
    sendJson(res, error.statusCode || 500, {error: error.message || 'API_LOCAL_ERROR'});
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya esta en uso. Cierra la otra API local o cambia BACKEND_PORT.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`API local lista en http://127.0.0.1:${port}`);
  console.log(`Endpoints: ${Object.keys(routeModules).join(', ')}`);
});
