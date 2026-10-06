import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';

const production = process.argv.includes('--production');
const database = process.argv.includes('--database');
const children = [];
const results = [];
async function probe(base, path, method = 'GET', origin = '') {
  const url = new URL(path, base);
  try {
    const response = await fetch(url, {
      method,
      headers: {...(origin ? {Origin: origin} : {}), ...(method === 'POST' ? {'Content-Type': 'application/json'} : {})},
      ...(method === 'POST' ? {body: '{}'} : {}),
      signal: AbortSignal.timeout(15000),
    });
    const type = response.headers.get('content-type') || '';
    results.push({url: url.href, method, origin, status: response.status, contentType: type,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      requestIdPresent: Boolean(response.headers.get('x-request-id'))});
    await response.body?.cancel();
  } catch (error) {
    results.push({url: url.href, method, status: 'NO VERIFICADO', error: error.name});
  }
}
async function inspectFrontend(base) {
  try {
    const response = await fetch(base, {signal: AbortSignal.timeout(15000)});
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]);
    const netlifyHosts = new Set();
    const apiOrigins = new Set();
    for (const asset of assets) {
      const assetResponse = await fetch(new URL(asset, base), {signal: AbortSignal.timeout(15000)});
      const js = await assetResponse.text();
      for (const match of js.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.netlify\.app/g)) netlifyHosts.add(match[0]);
      for (const match of js.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.netlify\.app[^\s"'`]{0,100}/g)) {
        if (match[0].includes('/api/')) apiOrigins.add(new URL(match[0]).origin);
      }
    }
    results.push({frontend: base, status: response.status, assets, netlifyHosts: [...netlifyHosts], apiOrigins: [...apiOrigins]});
  } catch (error) {
    results.push({frontend: base, status: 'NO VERIFICADO', error: error.name});
  }
}
async function start(args, port) {
  const child = spawn(process.execPath, args, {
    env: {...process.env, BACKEND_PORT: String(port)}, stdio: 'ignore',
  });
  children.push(child);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Servidor local no pudo arrancar');
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(1000)});
      await response.body?.cancel();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw new Error('Servidor local no disponible dentro del plazo');
}
try {
  if (database) {
    const {getAdminDb} = await import('../netlify/functions/_firebaseAdmin.mjs');
    const db = getAdminDb();
    db.settings({timeoutSeconds: 15});
    for (const name of ['clientes', 'equipos', 'registros', 'ventas', 'userRoles']) {
      const snapshot = await db.collection('artifacts').doc('comunicate-pos').collection('users').doc('shared').collection(name).limit(1).get();
      results.push({collection: name, read: 'VERIFICADO', documentsReturned: snapshot.size});
    }
  } else if (production) {
    const backend = process.env.VITE_BACKEND_BASE_URL || process.env.URL;
    const bases = new Set(['https://comunicate-tacna.web.app']);
    if (backend) bases.add(new URL(backend).origin);
    for (const base of bases) {
      await inspectFrontend(base);
      await probe(base, '/');
      await probe(base, '/api/usuarios', 'POST');
      await probe(base, '/api/registros', 'OPTIONS', 'https://comunicate-tacna.web.app');
      await probe(base, '/api/registros', 'OPTIONS', 'https://baseline-invalid.example');
      await probe(base, '/api/health');
    }
  } else {
    await start(['scripts/local-api.mjs'], 43101);
    await start(['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '43102', '--strictPort'], 43102);
    await probe('http://127.0.0.1:43102', '/');
    const config = readFileSync('scripts/local-api.mjs', 'utf8');
    for (const [, path] of config.matchAll(/'(\/api\/[^']+)':/g)) {
      await probe('http://127.0.0.1:43101', path, 'POST');
    }
    await probe('http://127.0.0.1:43101', '/api/registros', 'OPTIONS', 'http://localhost:5173');
    await probe('http://127.0.0.1:43101', '/api/registros', 'OPTIONS', 'https://baseline-invalid.example');
    await probe('http://127.0.0.1:43101', '/api/health');
  }
} catch (error) {
  results.push({status: 'FALLÓ', errorCode: error.code || error.name});
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
  console.log(JSON.stringify(results, null, 2));
}
