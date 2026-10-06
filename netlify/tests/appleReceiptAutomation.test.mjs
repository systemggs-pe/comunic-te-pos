import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppleReceiptAutomation} from '../../src/features/registros/appleReceiptAutomation.js';
import {prepareAppleReceiptDraft, buildAppleReceiptDraftUrl, createAppleReceiptDraftHandoff} from '../../src/features/registros/appleReceiptDraft.js';
import {receiptFingerprint} from '../functions/_receiptFingerprint.mjs';
import {findRemoteComprobanteAppleByImei} from '../functions/_appleReceiptsApi.mjs';

const A = '490154203237518', B = '356938035643809';
const form = (imei = A) => ({marca: 'APPLE', imei, imei1: imei, imei2: '', nombre: 'CLIENTE PRUEBA', dni: '12345678', tipoDocumento: 'DNI', modelo: 'IPHONE', nombreComercial: 'IPHONE', precio: '20', fecha: '2026-10-06T12:00'});
function receipt(imei = A) {
  const r = {id: 'fixture-receipt', estado: 'ACTIVA', nBoleta: 1042, fechaHora: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:01Z',
    boletaData: {cliente: {nombre: 'CLIENTE PRUEBA', dni: '12345678'}, ventas: [{imeiEquipo: imei, marcaEquipo: 'APPLE', precio: 1200}]}};
  return {...r, receiptFingerprint: receiptFingerprint(r)};
}
function harness(request) {
  let clock = 0, id = 0; const tasks = new Map(), changes = [];
  const flow = createAppleReceiptAutomation(request, {now: () => clock, onChange: state => changes.push(state),
    schedule: (fn, delay) => {tasks.set(++id, {fn, at: clock + delay}); return id;}, cancel: key => tasks.delete(key)});
  return {flow, changes, async tick(ms = 600) {clock += ms; for (const [key, task] of [...tasks]) if (task.at <= clock) {tasks.delete(key); task.fn();} for (let n = 0; n < 10; n++) await Promise.resolve();}};
}
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

test('incomplete IMEI or client data never triggers lookup', async () => {
  let calls = 0; const {flow, tick} = harness(async () => {calls++;});
  for (const fields of [{imei: A.slice(0, 14)}, {imei: 'x' + A}, {dni: ''}, {nombre: ''}, {marca: 'SAMSUNG'}]) {
    flow.update({...form(), ...fields}); await tick();
  }
  assert.equal(calls, 0);
});

test('valid IMEI automatically searches once after debounce; repeated events do not repeat', async () => {
  let calls = 0; const {flow, tick} = harness(async () => {calls++; return {found: true, boleta: receipt()};});
  flow.update(form()); flow.update(form()); await tick(599); assert.equal(calls, 0);
  await tick(1); assert.equal(calls, 1); assert.equal(flow.snapshot().state, 'VALIDATED');
  flow.update(form()); flow.update({...form(), modelo: 'CORRECTED'}); await tick();
  assert.equal(calls, 1); assert.equal(flow.snapshot().draft, undefined);
  assert.equal(flow.snapshot().boleta.receiptFingerprint, receipt().receiptFingerprint);
});

test('only unequivocal not found prepares a draft and follows the explicit states', async () => {
  const {flow, changes, tick} = harness(async () => ({found: false, boleta: null}));
  flow.update(form()); await tick();
  assert.equal(flow.snapshot().state, 'READY_TO_CREATE');
  assert.ok(changes.some(s => s.state === 'RECEIPT_NOT_FOUND'));
  assert.ok(changes.some(s => s.state === 'PREPARING_RECEIPT'));
  assert.equal(flow.snapshot().draft.fields.precio, '');
});

for (const code of ['APPLE_RECEIPTS_TIMEOUT', 'APPLE_RECEIPTS_NETWORK_ERROR', 'APPLE_RECEIPTS_UPSTREAM_ERROR', 'APPLE_RECEIPTS_RATE_LIMIT', 'APPLE_RECEIPTS_ACCESS_DENIED', 'APPLE_RECEIPTS_INVALID_RESPONSE']) {
  test(`${code} does not prepare a new receipt or retry automatically`, async () => {
    let calls = 0; const {flow, tick} = harness(async () => {calls++; throw new Error(code);});
    flow.update(form()); await tick(); flow.update(form()); await tick();
    assert.equal(calls, 1); assert.equal(flow.snapshot().state, 'ERROR'); assert.equal(flow.snapshot().draft, undefined);
    assert.equal(flow.snapshot().code, code);
  });
}

for (const [estado, expected] of [['ANULADA', 'APPLE_RECEIPTS_ANNULLED'], [undefined, 'APPLE_RECEIPTS_LEGACY']]) {
  test(`existing ${estado} receipt is rejected, never replaced automatically`, async () => {
    const r = {...receipt(), estado}; const {flow, tick} = harness(async () => ({found: true, boleta: r}));
    flow.update(form()); await tick(); assert.equal(flow.snapshot().state, 'ERROR');
    assert.equal(flow.snapshot().code, expected); assert.equal(flow.snapshot().draft, undefined);
  });
}

test('stale lookup cannot overwrite the new IMEI; new query waits for old transport', async () => {
  const pending = deferred(); const calls = [];
  const {flow, tick} = harness(imei => {calls.push(imei); return imei === A ? pending.promise : Promise.resolve({found: true, boleta: receipt(B)});});
  flow.update(form()); await tick(); flow.update(form(B)); await tick();
  assert.deepEqual(calls, [A]); pending.resolve({found: true, boleta: receipt(A)}); await tick(0);
  assert.deepEqual(calls, [A, B]); assert.equal(flow.snapshot().imei, B); assert.equal(flow.snapshot().state, 'VALIDATED');
});

test('same-IMEI concurrent manual taps share one operation', async () => {
  const pending = deferred(); let calls = 0; const {flow} = harness(() => {calls++; return pending.promise;});
  const one = flow.search(form(), {refresh: true}); const two = flow.search(form(), {refresh: true});
  pending.resolve({found: true, boleta: receipt()}); assert.equal(await one, true); assert.equal(await two, true); assert.equal(calls, 1);
});

test('preload preserves real source fields and never uses registration fee as sale price', () => {
  const draft = prepareAppleReceiptDraft({...form(), imei2: B, sn: 'FIXTURE-SERIAL', celular: '999111222'});
  assert.equal(draft.fields.rut, '12345678'); assert.equal(draft.fields.imei2, B); assert.equal(draft.fields.precio, '');
  assert.equal(draft.fields.fechaHora, ''); assert.ok(draft.manual.includes('color'));
  assert.ok(draft.automatic.includes('sn')); assert.ok(draft.derived.includes('nBoleta'));
  assert.equal(draft.fields.celular, undefined, 'repository does not store phone');
});

test('draft gets rebuilt from current source without another lookup', async () => {
  let calls = 0; const {flow, tick} = harness(async () => {calls++; return {found: false, boleta: null};});
  flow.update(form()); await tick(); flow.update({...form(), modelo: 'CURRENT MODEL'}); await tick();
  assert.equal(calls, 1); assert.equal(flow.snapshot().draft.fields.modelo, 'CURRENT MODEL');
  flow.update(form(B)); assert.equal(flow.snapshot().draft, undefined); await tick(); assert.equal(calls, 2);
});

test('unchanged saved reference is reused pending final authority; legacy and changed IMEI search', async () => {
  let calls = 0; const {flow, tick} = harness(async imei => {calls++; return {found: true, boleta: receipt(imei)};});
  const record = {id: 'fixture-record', marcaEquipo: 'APPLE', imeiEquipo: A, boletaExtranjeraId: receipt().id, receiptFingerprint: receipt().receiptFingerprint};
  flow.update(form(), {record}); await tick(); assert.equal(calls, 0); assert.equal(flow.snapshot().state, 'SAVED_REFERENCE');
  flow.update(form(B), {record}); await tick(); assert.equal(calls, 1);
  flow.invalidate(); flow.update(form(), {record: {...record, receiptFingerprint: ''}}); await tick(); assert.equal(calls, 2);
});

test('visual cache is reused, expiration requires refresh and dispose suppresses old results', async () => {
  let calls = 0; const {flow, tick} = harness(async () => {calls++; return {found: true, boleta: receipt()};});
  flow.update(form()); await tick(); await flow.search(form()); assert.equal(calls, 1);
  await tick(30_001); await flow.search(form()); assert.equal(calls, 2);
  flow.dispose(); flow.update(form(B)); await tick(); assert.equal(calls, 2);
});

test('handoff includes no personal data in HTTP query and restricts unsafe destination schemes', () => {
  const url = new URL(buildAppleReceiptDraftUrl(prepareAppleReceiptDraft(form())));
  assert.equal(url.search, '?section=boletas&mode=nueva'); assert.ok(url.hash.startsWith('#posDraft='));
  assert.throws(() => buildAppleReceiptDraftUrl(prepareAppleReceiptDraft(form()), 'javascript:alert(1)'));
});

test('a generic 404/HTML route failure is not receipt NOT_FOUND', async () => {
  const env = {APPLE_RECEIPTS_API_URL: 'https://fixture.example.test/api/boletas', APPLE_RECEIPTS_API_KEY: 'fixture'};
  for (const body of ['', '<html>Not Found</html>', JSON.stringify({error: 'route missing'})]) {
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => new Response(body, {status: 404})}));
  }
});


test('a contradictory not-found payload containing service failure never prepares creation', async () => {
  const {flow, tick} = harness(async () => ({found: false, boleta: null, error: 'Quota exceeded'}));
  flow.update(form()); await tick(); assert.equal(flow.snapshot().state, 'ERROR'); assert.equal(flow.snapshot().draft, undefined);
});


test('losing minimum data while searching invalidates the old response', async () => {
  const pending = deferred(); const {flow, tick} = harness(() => pending.promise);
  flow.update(form()); await tick(); flow.update({...form(), nombre: ''});
  pending.resolve({found: true, boleta: receipt()}); await tick(0);
  assert.equal(flow.snapshot().state, 'WAITING_FOR_DATA'); assert.equal(flow.snapshot().boleta, null);
});


test('handoff invalidates older preparation on source change, replacement and cancellation', () => {
  const messages = [], children = [], urls = [];
  const browser = {location: {origin: 'https://comunicate-registros-v2.netlify.app'}, open: url => {urls.push(url); const child = {opener: {}, postMessage: (message, origin) => messages.push({message, origin})}; children.push(child); return child;}};
  const handoff = createAppleReceiptDraftHandoff(browser, {channel: () => 'fixture-channel-123456'});
  const draft = prepareAppleReceiptDraft(form()); assert.equal(handoff.open(draft), true); assert.equal(children[0].opener, null);
  assert.ok(decodeURIComponent(new URL(urls[0]).hash).includes('fixture-channel-123456'));
  handoff.sync(draft); assert.equal(messages.length, 0);
  handoff.sync(prepareAppleReceiptDraft({...form(), modelo: 'CHANGED'})); assert.equal(messages.length, 1);
  assert.equal(messages[0].message.type, 'comunicate.pos-draft.invalidate');
  assert.equal(messages[0].origin, 'https://comunicate-boletas-extranjeras.netlify.app');
  handoff.open(draft); handoff.open(prepareAppleReceiptDraft(form(B))); assert.equal(messages.length, 2);
  handoff.invalidate(); assert.equal(messages.length, 3);
});

test('blocked popup is reported without treating draft as emitted', () => {
  const handoff = createAppleReceiptDraftHandoff({location: {origin: 'http://localhost:5173'}, open: () => null}, {channel: () => 'fixture-channel-123456'});
  assert.equal(handoff.open(prepareAppleReceiptDraft(form())), false);
});


test('continue after not-found/error does not spend another lookup; explicit retry may', async () => {
  for (const response of [{found: false, boleta: null}, new Error('APPLE_RECEIPTS_TIMEOUT')]) {
    let calls = 0; const {flow, tick} = harness(async () => {calls++; if (response instanceof Error) throw response; return response;});
    flow.update(form()); await tick(); await flow.search(form()); await flow.search(form()); assert.equal(calls, 1);
    await flow.search(form(), {refresh: true}); assert.equal(calls, 2);
  }
});
