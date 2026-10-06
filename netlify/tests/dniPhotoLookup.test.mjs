import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createDniPhotoLookup, dniPhotoErrorMessage} from '../../src/features/dniFotos/dniPhotoLookup.js';

const result = dni => ({success: true, data: {dni, nombres: 'PERSONA DE PRUEBA', images: []}});
test('page cache is bounded to a recent result, expires and explicit refresh bypasses it', async () => {
  let time = 1; let calls = 0;
  const lookup = createDniPhotoLookup(async dni => {calls++; return result(dni);}, {now: () => time, ttlMs: 100});
  assert.equal((await lookup.lookup('12345678', 'azul')).cache, 'MISS');
  assert.equal((await lookup.lookup('12345678', 'azul')).cache, 'HIT'); assert.equal(calls, 1);
  time = 102; assert.equal((await lookup.lookup('12345678', 'azul')).cache, 'EXPIRED'); assert.equal(calls, 2);
  await lookup.lookup('12345678', 'azul', {refresh: true}); assert.equal(calls, 3);
  lookup.dispose(); await lookup.lookup('12345678', 'azul'); assert.equal(calls, 4);
});
test('rapid taps and Enter do not issue duplicate requests; changing DNI invalidates old results', async () => {
  let finish; let calls = 0;
  const lookup = createDniPhotoLookup(dni => {calls++; return new Promise(resolve => {finish = () => resolve(result(dni));});});
  const first = lookup.lookup('12345678', 'azul');
  assert.equal((await lookup.lookup('12345678', 'azul')).duplicate, true);
  lookup.invalidate(); assert.equal((await lookup.lookup('87654321', 'azul')).duplicate, true);
  finish(); assert.equal((await first).current, false); assert.equal(calls, 1);
  const second = lookup.lookup('87654321', 'azul'); finish();
  assert.equal((await second).json.data.dni, '87654321'); assert.equal(calls, 2);
});
test('unmounted page discards pending results and old errors', async () => {
  let reject; const lookup = createDniPhotoLookup(() => new Promise((_resolve, fail) => {reject = fail;}));
  const pending = lookup.lookup('12345678', 'azul'); lookup.dispose(); reject(new Error('DNI_FOTOS_TIMEOUT'));
  assert.equal((await pending).current, false);
});
test('invalid DNI never calls transport and mismatched responses are not cached', async () => {
  let calls = 0; const lookup = createDniPhotoLookup(async () => {calls++; return result('87654321');});
  assert.equal((await lookup.lookup('123', 'azul')).error.message, 'DNI_INVALIDO'); assert.equal(calls, 0);
  assert.equal((await lookup.lookup('12345678', 'azul')).error.message, 'DNI_FOTOS_INVALID_RESPONSE');
  await lookup.lookup('12345678', 'azul'); assert.equal(calls, 2);
});
test('technical errors, network failures and provider categories have safe user messages', () => {
  assert.match(dniPhotoErrorMessage(new TypeError('Failed to fetch')), /conexión/);
  for (const code of ['DNI_INVALIDO','DNI_FOTOS_NOT_FOUND','DNI_FOTOS_TIMEOUT','DNI_FOTOS_UNAVAILABLE','CODART_RATE_LIMIT','CODART_TOKEN_INVALID','DNI_FOTOS_INVALID_RESPONSE','DNI_FOTOS_INTERNAL_ERROR']) {
    assert.notEqual(dniPhotoErrorMessage(new Error(code)), code);
  }
  assert.ok(!dniPhotoErrorMessage(new Error('ECONNRESET stack secret')).includes('ECONNRESET'));
});

async function fixtureClient() {
  const source = (await readFile(new URL('../../src/services/functionsClient.js',import.meta.url),'utf8'))
    .replace("import { auth } from '../lib/firebase.js';", "const auth = {currentUser: {getIdToken: async () => 'fixture-token'}};")
    .replace("'../features/registros/appleReceiptValidation.js'", JSON.stringify(new URL('../../src/features/registros/appleReceiptValidation.js', import.meta.url).href))
    .replaceAll('import.meta.env', '({DEV: false})');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
test('photo API keeps JSON not-found distinct from a missing backend route', async () => {
  const client = await fixtureClient(); const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"error":"DNI_FOTOS_NOT_FOUND"}',{status:404});
    await assert.rejects(client.consultarDniFotos('12345678'),/DNI_FOTOS_NOT_FOUND/);
    globalThis.fetch = async () => new Response('<html>missing route</html>',{status:404});
    await assert.rejects(client.consultarDniFotos('12345678'),/BACKEND_NOT_DEPLOYED/);
  } finally {globalThis.fetch = fetch;}
});
test('client deadline aborts an unresponsive transport without retrying it', async () => {
  const client = await fixtureClient(); const fetch = globalThis.fetch; const set = globalThis.setTimeout; const clear = globalThis.clearTimeout;
  let expire; let calls = 0; let signal;
  try {
    globalThis.setTimeout = callback => {expire=callback; return 1;}; globalThis.clearTimeout = () => {};
    globalThis.fetch = async (_url,options) => {calls++; signal=options.signal; return new Promise(()=>{});};
    const pending = client.consultarDniFotos('12345678'); await Promise.resolve(); await Promise.resolve(); expire();
    await assert.rejects(pending,/DNI_FOTOS_TIMEOUT/); assert.equal(calls,1); assert.equal(signal.aborted,true);
  } finally {globalThis.fetch=fetch; globalThis.setTimeout=set; globalThis.clearTimeout=clear;}
});
