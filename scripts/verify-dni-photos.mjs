// Isolated browser/API harness. Default: synthetic images, zero paid calls.
// --live DNI explicitly enables ONE real CODART call; never retries it.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync, readFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {build} from 'esbuild';
import {__test, DNI_PHOTO_TYPES} from '../netlify/functions/dniFotos.mjs';

const liveIndex = process.argv.indexOf('--live');
const live = liveIndex !== -1;
const dni = live ? process.argv[liveIndex + 1] : '12345678';
assert.match(dni || '', /^\d{8}$/);
if (live) {
  const env = parseEnv(readFileSync('.env', 'utf8'));
  for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value;
} else {
  process.env.CODART_TOKEN = 'fixture-token';
}
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {DniFotosPage} from './src/features/dniFotos/DniFotosPage.jsx';
      createRoot(document.getElementById('root')).render(<DniFotosPage />);`,
    resolveDir: process.cwd(), loader: 'jsx',
  },
  bundle: true, write: false, format: 'iife',
  define: {'import.meta.env': JSON.stringify({DEV: true})},
  plugins: [{name: 'isolated-auth-fixture', setup(plugin) {
    plugin.onResolve({filter: /lib\/firebase\.js$/}, () => ({path: 'auth', namespace: 'qa'}));
    plugin.onLoad({filter: /.*/, namespace: 'qa'}, () => ({
      contents: 'export const auth = {currentUser: {uid: "qa", getIdToken: async () => "qa"}};',
    }));
  }}],
});
const cssFile = readdirSync('dist/assets').find(name => /^index-.*\.css$/.test(name));
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8');
const originalFetch = globalThis.fetch;
let providerCalls = 0;
let apiCalls = 0;
let fixtureImage = '';
let failureMode = false;
let releaseFirstFixture;
let notifyFirstFixture;
const firstFixtureStarted = new Promise(resolve => {notifyFirstFixture = resolve;});
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(DNI_PHOTO_TYPES.azul.url)) throw new Error('Unexpected provider endpoint');
  providerCalls++;
  if (live) {
    assert.equal(providerCalls, 1, 'Never repeat a paid query during verification');
    return originalFetch(url, options);
  }
  if (providerCalls === 1) {
    await new Promise(resolve => {
      releaseFirstFixture = resolve;
      notifyFirstFixture();
    });
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  if (failureMode) throw Object.assign(new Error('Aborted'), {name: 'AbortError'});
  return new Response(JSON.stringify({success: true, data: {
    images: [{data_uri: fixtureImage}, {data_uri: fixtureImage}],
  }}));
};
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle.outputFiles[0].text);
  } else if (req.url === '/api/dniFotos') {
    apiCalls++;
    assert.equal(req.headers.authorization, 'Bearer qa');
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    try {
      const data = live
        ? await __test.dispatchDniFotos(payload)
        : await __test.fetchDniFotos(payload.dni, payload.tipo, {refresh: payload.refresh === true, claim: async () => async () => {}});
      res.end(JSON.stringify(data));
    } catch (error) {
      res.statusCode = error.status || 502;
      res.end(JSON.stringify({error: error.message}));
    }
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main id="root"></main><script src="/bundle.js"></script></body></html>`);
  }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless: true, ...(process.env.QA_BROWSER_PATH ? {executablePath: process.env.QA_BROWSER_PATH} : {})});
  const page = await browser.newPage({viewport: {width: 1366, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  fixtureImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef2f7'; ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#334155'; ctx.font = '32px sans-serif';
    ctx.fillText('IMAGEN DE PRUEBA', 40, 200);
    return canvas.toDataURL('image/png');
  });
  await page.getByRole('textbox', {name: 'DNI', exact: true}).fill(dni);
  const started = Date.now();
  await page.getByRole('button', {name: 'Consultar DNI azul', exact: true}).click();
  if (!live) {
    await firstFixtureStarted;
    await page.getByRole('status', {name: 'Cargando imágenes del DNI'}).waitFor();
    await page.locator('form').evaluate(form => {form.requestSubmit(); form.requestSubmit();});
    const screenshotDir = mkdtempSync(join(tmpdir(), 'comunicate-dni-loading-'));
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({width, height: 900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({path: join(screenshotDir, `loading-${width}.png`)});
    }
    await page.evaluate(() => {document.documentElement.dataset.theme = 'dark';});
    await page.screenshot({path: join(screenshotDir, 'loading-dark.png')});
    await page.emulateMedia({reducedMotion: 'reduce'});
    assert.equal(await page.locator('.dni-photo-loading__document').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.evaluate(() => {delete document.documentElement.dataset.theme;});
    assert.equal(apiCalls, 1, 'Repeated submits during loading must be ignored');
    assert.equal(providerCalls, 1);
    console.log(JSON.stringify({loadingScreenshots: screenshotDir, reducedMotion: 'passed'}));
    releaseFirstFixture();
  }
  await page.waitForFunction(() => document.querySelector('img[alt="DNI Anverso"]') || document.querySelector('[role="alert"]'), null, {timeout: 65_000});
  const failure = await page.getByRole('alert').allTextContents();
  if (failure.length) throw new Error(`Photo flow: ${failure.join(' ')}; providerCalls=${providerCalls}`);
  await page.waitForFunction(() => [...document.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0));
  const dimensions = await page.locator('img').evaluateAll(imgs => imgs.map(img => ({width: img.naturalWidth, height: img.naturalHeight})));
  assert.ok(dimensions.length > 0);
  const repeatResponse = page.waitForResponse(response => response.url().endsWith('/api/dniFotos'));
  await page.getByRole('button', {name: 'Consultar DNI azul', exact: true}).click();
  await repeatResponse;
  await page.locator('img').first().waitFor();
  assert.equal(apiCalls, 2);
  assert.equal(providerCalls, 1);
  for (const width of [1366, 390]) {
    await page.setViewportSize({width, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
  }
  if (!live) {
    const refreshResponse = page.waitForResponse(response => response.url().endsWith('/api/dniFotos'));
    await page.getByRole('button', {name: 'Actualizar', exact: true}).click();
    await refreshResponse;
    await page.locator('img').first().waitFor();
    assert.equal(providerCalls, 2, 'Explicit refresh makes one new provider query');
    assert.equal(apiCalls, 3);
    await page.locator('img').first().evaluate(img => {img.src = 'data:image/png;base64,broken';});
    await page.getByRole('alert').filter({hasText: 'no se pudo mostrar'}).waitFor();
    assert.equal(providerCalls, 2, 'Image decode errors must not retry CODART');
    failureMode = true;
    await page.getByRole('textbox', {name: 'DNI', exact: true}).fill('22222222');
    await page.getByRole('button', {name: 'Consultar DNI azul', exact: true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(providerCalls, 3, 'No retry is triggered by the failure itself');
    const retryResponse = page.waitForResponse(response => response.url().endsWith('/api/dniFotos'));
    await page.getByRole('button', {name: 'Consultar DNI azul', exact: true}).click();
    await retryResponse;
    await page.getByRole('alert').waitFor();
    assert.equal(providerCalls, 4, 'Manual retry after a failure is allowed immediately');
    assert.equal(apiCalls, 5);
    failureMode = false;
    const recoveryResponse = page.waitForResponse(response => response.url().endsWith('/api/dniFotos'));
    await page.getByRole('button', {name: 'Consultar DNI azul', exact: true}).click();
    await recoveryResponse;
    await page.locator('img').first().waitFor();
    assert.equal(providerCalls, 5);
    assert.equal(apiCalls, 6);
    assert.equal(await page.getByRole('alert').count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({mode: live ? 'live-provider-isolated-auth' : 'fixture', providerCalls, apiCalls, imageDimensions: dimensions, elapsedMs: Date.now() - started, desktopAndMobile: 'passed'}));
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
