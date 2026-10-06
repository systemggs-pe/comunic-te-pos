// Requests without authentication only; never invokes a business operation.
const netlify = process.argv[2];
if (netlify && !/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(netlify)) throw new Error('Use a public HTTPS Netlify origin.');
const base = netlify || 'https://us-central1-comunicate-tacna.cloudfunctions.net';
const endpoints = netlify ? ['api/usuarios', 'api/registros', 'api/reniec', '.netlify/functions/usuarios'] : ['consultarReniec', 'analizarCajaGemini'];
const origins = [
  'https://comunicate-tacna.web.app',
  ...(netlify ? [netlify] : []),
  'http://localhost:5173',
  'https://stabilization-invalid.example',
];
const observations = [];
async function inspect(url, method, origin = '') {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
    const response = await fetch(url, {
      method,
      headers: {...(origin ? {Origin: origin} : {}), ...(method === 'POST' ? {'Content-Type': 'application/json'} : {})},
      ...(method === 'POST' ? {body: '{}'} : {}),
      signal: AbortSignal.timeout(30000),
    });
    observations.push({url, origin, method, status: response.status,
      contentType: response.headers.get('content-type'),
      allowOrigin: response.headers.get('access-control-allow-origin'),
      allowMethods: response.headers.get('access-control-allow-methods'),
      allowHeaders: response.headers.get('access-control-allow-headers'),
      allowCredentials: response.headers.get('access-control-allow-credentials'),
      vary: response.headers.get('vary'),
    });
    await response.body?.cancel();
    return;
    } catch (error) {
      if (attempt === 1) observations.push({url, origin, method, status: 'NO VERIFICADO', error: error.name});
    }
  }
}
if (netlify) {
  await inspect(`${base}/`, 'GET');
  await inspect(`${base}/api/health`, 'GET');
}
for (const endpoint of endpoints) {
  await inspect(`${base}/${endpoint}`, 'POST');
  for (const origin of origins) await inspect(`${base}/${endpoint}`, 'OPTIONS', origin);
}
console.log(JSON.stringify({base, source: netlify ? 'Public Netlify site supplied by user' : 'Deployed /assets/index-DukDfu43.js fetch wrapper vE, projectId and call sites',
  preview: 'Real deploy-preview URL not supplied or discovered; NO VERIFICADO', healthcheck: 'Not present in repository; do not interpret SPA HTML as health', observations}, null, 2));
