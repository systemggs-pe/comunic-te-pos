import {existsSync, readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const routeModules = {
  '/api/analizarCajaGemini': '../netlify/functions/analizarCajaGemini.mjs',
  '/api/boletasExtranjeras': '../netlify/functions/boletasExtranjeras.mjs',
  '/api/clientes': '../netlify/functions/clientes.mjs',
  '/api/dniFotos': '../netlify/functions/dniFotos.mjs',
  '/api/legalConsent': '../netlify/functions/legalConsent.mjs',
  '/api/registros': '../netlify/functions/registros.mjs',
  '/api/reniec': '../netlify/functions/reniec.mjs',
  '/api/ventas': '../netlify/functions/ventas.mjs',
};
const shellEnvKeys = new Set(Object.keys(process.env));

function logLocal(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'local-api',
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

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

function sendJson(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8', ...headers});
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
    for (const hint of hints) {
      logLocal('warn', 'local.config_warning', {message: hint});
    }
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
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  const startedAt = Date.now();
  logLocal('info', 'local.request_start', {requestId, method: req.method, path: pathname});

  try {
    const handler = await getHandler(pathname);
    if (!handler) {
      logLocal('warn', 'local.request_error', {requestId, method: req.method, path: pathname, statusCode: 404});
      sendJson(res, 404, {error: 'API_LOCAL_ROUTE_NOT_FOUND', path: pathname, requestId}, {'X-Request-Id': requestId});
      return;
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readRequestBody(req);
    const response = await handler({
      httpMethod: req.method,
      path: pathname,
      rawUrl: url.href,
      headers: {...req.headers, 'x-request-id': requestId},
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
    logLocal(statusCode >= 400 ? 'warn' : 'info', statusCode >= 400 ? 'local.request_error' : 'local.request_success', {
      requestId,
      method: req.method,
      path: pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
    });
    if (statusCode >= 400) {
      logLocal('warn', 'local.response_body', {requestId, body: response?.body || ''});
    }
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logLocal('error', 'local.unhandled_error', {
      requestId,
      method: req.method,
      path: pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
      errorMessage: error.message,
    });
    sendJson(res, statusCode, {error: error.message || 'API_LOCAL_ERROR', requestId}, {'X-Request-Id': requestId});
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    logLocal('error', 'local.port_in_use', {
      port,
      errorMessage: `El puerto ${port} ya esta en uso. Cierra la otra API local o cambia BACKEND_PORT.`,
    });
    process.exit(1);
  }
  logLocal('error', 'local.server_error', {errorMessage: error.message, errorCode: error.code || ''});
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  logLocal('info', 'local.server_ready', {
    url: `http://127.0.0.1:${port}`,
    endpoints: Object.keys(routeModules),
  });
});
