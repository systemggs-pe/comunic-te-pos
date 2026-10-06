import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {normalizeImei} from '../../src/utils/imei.js';
import {validateAppleReceipt, appleReceiptErrorMessage} from '../../src/features/registros/appleReceiptValidation.js';
import {canDeferStoredAppleReceipt, createAppleReceiptLookup} from '../../src/features/registros/appleReceiptLookup.js';
import {normalizeRemoteComprobanteApple, findRemoteComprobanteAppleByImei} from '../functions/_appleReceiptsApi.mjs';
import {__test as lookupApi} from '../functions/comprobanteApple.mjs';
import {createRegistro, __test as registrosTest} from '../functions/registros.mjs';

import {receiptFingerprint} from '../functions/_receiptFingerprint.mjs';
const sign = r => ({...r, estado: r.estado ?? 'ACTIVA', receiptFingerprint: receiptFingerprint({...r, estado: r.estado ?? 'ACTIVA'})});

const A = '490154203237518';
const B = '356938035643809';
const env = {APPLE_RECEIPTS_API_URL: 'https://fixture.example.test/api/boletas', APPLE_RECEIPTS_API_KEY: 'private-fixture-key', APPLE_RECEIPTS_TIMEOUT_MS: '5000'};
function receipt(imei = A, id = 'receipt-1042') {
  return sign({id, nBoleta: 1042, fechaHora: '2026-10-01T12:00:00.000Z', formato: 4, origen: 'manual',
    boletaEquipoKeys: [imei], boletaData: {cliente: {nombre: 'PERSONA PRUEBA', dni: '12345678'},
      ventas: [{imeiEquipo: imei, marcaEquipo: 'APPLE', precio: 1200}], equiposMap: {[imei]: {marca: 'APPLE'}}}});
}
const response = boleta => ({found: true, boleta});
const fetchReceipt = boleta => async () => new Response(JSON.stringify({boletas: [sign(boleta)]}), {status: 200});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

test('IMEI normalization permits whitespace, rejects letters, signs, overflow and bad checksum before transport', async () => {
  assert.equal(normalizeImei(' 490 154203237518 '), A);
  let calls = 0;
  for (const value of ['', 'abc'+A, A+'9', A.slice(1), A+'-', '490154203237519']) {
    await assert.rejects(findRemoteComprobanteAppleByImei(value, {env, fetchImpl: async () => {calls++;}}), {message: 'IMEI_INVALIDO'});
  }
  assert.equal(calls, 0);
});

test('valid receipt model accepts the selected Apple sale and its secondary IMEI', () => {
  assert.equal(validateAppleReceipt(receipt(), A).valid, true);
  const dual = receipt();
  dual.boletaData.ventas[0].imei2Equipo = B;
  dual.boletaData.equiposMap[A].imei2 = B;
  dual.boletaEquipoKeys.push(B);
  assert.equal(validateAppleReceipt(dual, B).valid, true);
});

test('nested receipt number and date normalize to canonical fields used by save and PDF', () => {
  const raw = receipt();
  raw.boletaData.nBoleta = raw.nBoleta; delete raw.nBoleta;
  raw.boletaData.fechaHora = raw.fechaHora; delete raw.fechaHora;
  const result = normalizeRemoteComprobanteApple({boletas: [raw]}, A);
  assert.equal(result.nBoleta, 1042);
  assert.equal(result.fechaHora, '2026-10-01T12:00:00.000Z');
});

for (const [description, mutate, code] of [
  ['missing number', r => {delete r.nBoleta;}, 'APPLE_RECEIPTS_INCOMPLETE'],
  ['missing date', r => {delete r.fechaHora;}, 'APPLE_RECEIPTS_INCOMPLETE'],
  ['missing client', r => {delete r.boletaData.cliente;}, 'APPLE_RECEIPTS_INCOMPLETE'],
  ['missing sales', r => {r.boletaData.ventas = [];}, 'APPLE_RECEIPTS_INCOMPLETE'],
  ['zero-price sale', r => {r.boletaData.ventas[0].precio = 0;}, 'APPLE_RECEIPTS_INCOMPLETE'],
  ['invalid format', r => {r.formato = 99;}, 'APPLE_RECEIPTS_INVALID_RECEIPT'],
  ['invalid receipt ID', r => {r.id = '../receipt';}, 'APPLE_RECEIPTS_INVALID_RECEIPT'],
  ['non-Apple sale', r => {r.boletaData.ventas[0].marcaEquipo = 'SAMSUNG';}, 'APPLE_RECEIPTS_MISMATCH'],
  ['stale index', r => {r.boletaData.ventas[0].imeiEquipo = B;}, 'APPLE_RECEIPTS_MISMATCH'],
  ['contradictory receipt number', r => {r.boletaData.nBoleta = 9000;}, 'APPLE_RECEIPTS_MISMATCH'],
  ['contradictory client', r => {r.clienteDni = '87654321';}, 'APPLE_RECEIPTS_MISMATCH'],
  ['contradictory secondary IMEI', r => {r.boletaData.equiposMap[A].imei2 = B;}, 'APPLE_RECEIPTS_MISMATCH'],
  ['duplicate sale for the same IMEI', r => {r.boletaData.ventas.push({...r.boletaData.ventas[0]});}, 'APPLE_RECEIPTS_CONFLICT'],
]) {
  test(`shared validation rejects ${description} in query and registration`, async () => {
    const r = receipt(); mutate(r);
    assert.equal(validateAppleReceipt(r, A).code, code);
    assert.throws(() => normalizeRemoteComprobanteApple({boletas: [r]}, A), {message: code});
    await assert.rejects(registrosTest.assertComprobanteApple({marcaEquipo: 'APPLE', imeiEquipo: A, boletaExtranjeraId: r.id}, {env, fetchImpl: fetchReceipt(r)}), {message: code});
  });
}

test('empty results differ from invalid, contradictory or ambiguous API responses', () => {
  assert.equal(normalizeRemoteComprobanteApple({boletas: []}, A), null);
  assert.equal(normalizeRemoteComprobanteApple({found: false}, A), null);
  for (const payload of [null, [], {}, {found: false, boleta: receipt()}]) {
    assert.throws(() => normalizeRemoteComprobanteApple(payload, A), {message: 'APPLE_RECEIPTS_INVALID_RESPONSE'});
  }
  assert.throws(() => normalizeRemoteComprobanteApple({found: true, boletas: []}, A), {message: 'APPLE_RECEIPTS_INCOMPLETE'});
  assert.throws(() => normalizeRemoteComprobanteApple({boletas: [receipt(), receipt(A, 'other-id')]}, A), {message: 'APPLE_RECEIPTS_CONFLICT'});
  const many = Array.from({length: 51}, () => receipt());
  assert.throws(() => normalizeRemoteComprobanteApple({boletas: many}, A), {message: 'APPLE_RECEIPTS_INVALID_RESPONSE'});
});

test('lookup endpoint and save share the same canonical receipt validation', async () => {
  const options = {env, fetchImpl: fetchReceipt(receipt())};
  const result = await lookupApi.buscarComprobanteApple({imei: A}, options);
  assert.equal(result.found, true);
  const registro = {expectedReceiptFingerprint: result.boleta.receiptFingerprint, marcaEquipo: 'APPLE', imeiEquipo: A, boletaExtranjeraId: result.boleta.id, boletaExtranjeraNro: 'tampered'};
  await registrosTest.assertComprobanteApple(registro, options);
  assert.equal(registro.boletaExtranjeraNro, '1042');
  registro.boletaExtranjeraId = 'wrong-id';
  await assert.rejects(registrosTest.assertComprobanteApple(registro, options), {message: 'BOLETA_APPLE_NO_ENCONTRADA'});
});

for (const [status, expected] of [[400,'APPLE_RECEIPTS_BAD_REQUEST'], [401,'APPLE_RECEIPTS_ACCESS_DENIED'], [403,'APPLE_RECEIPTS_ACCESS_DENIED'], [409,'APPLE_RECEIPTS_CONFLICT'], [429,'APPLE_RECEIPTS_RATE_LIMIT'], [500,'APPLE_RECEIPTS_UPSTREAM_ERROR'], [503,'APPLE_RECEIPTS_UPSTREAM_ERROR']]) {
  test(`HTTP ${status} is classified without retry or technical leakage`, async () => {
    let calls = 0;
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => {calls++; return new Response(env.APPLE_RECEIPTS_API_KEY, {status});}}), {message: expected});
    assert.equal(calls, 1);
    assert.ok(!appleReceiptErrorMessage(new Error(expected)).includes(env.APPLE_RECEIPTS_API_KEY));
  });
}

test('404 is not found; bad JSON and empty bodies are invalid responses', async () => {
  assert.equal(await findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => new Response(JSON.stringify({found: false, boleta: null}), {status: 404})}), null);
  for (const body of ['', '<html>upstream error</html>']) {
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => new Response(body)}), {message: body ? 'APPLE_RECEIPTS_INVALID_RESPONSE' : 'APPLE_RECEIPTS_EMPTY_RESPONSE'});
  }
});

test('network and timeout errors use one attempt and safe logs', async () => {
  const logs = [];
  const previous = console.warn;
  console.warn = value => logs.push(value);
  try {
    let calls = 0;
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => {calls++; throw new TypeError('private '+env.APPLE_RECEIPTS_API_KEY);}}), {message: 'APPLE_RECEIPTS_NETWORK_ERROR'});
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env, fetchImpl: async () => {calls++; throw new Error('APPLE_RECEIPTS_'+env.APPLE_RECEIPTS_API_KEY);}}), {message: 'APPLE_RECEIPTS_NETWORK_ERROR'});
    await assert.rejects(findRemoteComprobanteAppleByImei(A, {env: {...env, APPLE_RECEIPTS_TIMEOUT_MS: '5'}, fetchImpl: (_url, options) => {calls++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('fixture abort')), {once: true}));}}), {message: 'APPLE_RECEIPTS_TIMEOUT'});
    assert.equal(calls, 3);
    assert.ok(logs.every(log => !log.includes(A) && !log.includes('12345678') && !log.includes(env.APPLE_RECEIPTS_API_KEY)));
    assert.ok(logs.every(log => JSON.parse(log).attempt === 1));
  } finally {console.warn = previous;}
});

test('double lookup makes one request and changed IMEI discards the old response', async () => {
  const pending = deferred(); let calls = 0;
  const lookup = createAppleReceiptLookup(async imei => {calls++; return imei === A ? pending.promise : response(receipt(B));});
  const first = lookup.lookup(A);
  assert.deepEqual(await lookup.lookup(A), {current: false});
  lookup.invalidate();
  pending.resolve(response(receipt()));
  assert.deepEqual(await first, {current: false});
  assert.equal((await lookup.lookup(B)).boleta.boletaEquipoKeys[0], B);
  assert.equal(calls, 2);
});

test('unchanged edit reuses short-lived validation; TTL, receipt changes and explicit refresh revalidate', async () => {
  let clock = 0; let calls = 0; let selected = receipt();
  const lookup = createAppleReceiptLookup(async () => {calls++; return response(selected);}, {now: () => clock});
  assert.equal((await lookup.lookup(A, {expectedId: 'receipt-1042'})).boleta.id, 'receipt-1042');
  await lookup.lookup(A, {expectedId: 'receipt-1042'});
  assert.equal(calls, 1);
  selected = receipt(A, 'replacement');
  assert.equal((await lookup.lookup(A, {refresh: true})).boleta.id, 'replacement');
  const mismatch = await lookup.lookup(A, {expectedId: 'old-id'});
  assert.equal(mismatch.error.message, 'APPLE_RECEIPTS_MISMATCH');
  clock = 31_000;
  await lookup.lookup(A);
  assert.equal(calls, 4);
  lookup.dispose();
  assert.deepEqual(await lookup.lookup(A), {current: false});
});

test('unchanged edits defer one authoritative check to save without trusting the saved receipt as valid', () => {
  const original = {receiptFingerprint: 'a'.repeat(64), id: 'record', marcaEquipo: 'APPLE', imeiEquipo: A, imeiRegistrado: A, boletaExtranjeraId: 'saved-receipt'};
  const current = {marca: 'APPLE', imei: A, imei1: A, imei2: ''};
  const saved = {status: 'saved', boleta: {id: 'saved-receipt', receiptFingerprint: 'a'.repeat(64)}};
  assert.equal(canDeferStoredAppleReceipt(original, current, saved), true);
  assert.equal(validateAppleReceipt(saved.boleta, A).valid, false);
  assert.equal(canDeferStoredAppleReceipt(original, {...current, imei: B}, saved), false);
  assert.equal(canDeferStoredAppleReceipt(original, current, {...saved, boleta: {id: 'changed'}}), false);
  assert.equal(canDeferStoredAppleReceipt(original, {...current, marca: 'SAMSUNG'}, saved), false);
  assert.equal(canDeferStoredAppleReceipt(original, {...current, imei: ''}, saved), false);
  assert.equal(canDeferStoredAppleReceipt(original, current, {...saved, status: 'idle'}), false);
});

test('failed results are not cached and unmounted failures cannot update the UI', async () => {
  let calls = 0;
  const lookup = createAppleReceiptLookup(async () => {calls++; return {found: false, boleta: null};});
  await lookup.lookup(A); await lookup.lookup(A);
  assert.equal(calls, 2);
  const pending = deferred();
  const old = createAppleReceiptLookup(() => pending.promise);
  const request = old.lookup(A); old.dispose(); pending.resolve({found: false, boleta: null});
  assert.deepEqual(await request, {current: false});
  assert.equal(appleReceiptErrorMessage(new Error('raw private provider exception')), 'El servicio de comprobantes no está disponible temporalmente.');
});

function memoryDb() {
  const docs = new Map([['_counters/registros', {last: 1}]]);
  let id = 0; let queue = Promise.resolve();
  const document = path => ({path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`)});
  const collection = path => ({path, filters: [], doc: (key = `auto-${++id}`) => document(`${path}/${key}`),
    where(field, _operator, value) {return {...this, filters: [...this.filters, [field, value]]};}, limit() {return this;}});
  const get = ref => ref.filters ? {docs: [...docs].filter(([path, data]) => path.startsWith(ref.path+'/') && !path.slice(ref.path.length+1).includes('/') && ref.filters.every(([field,value]) => data[field] === value)).map(([path,data]) => ({id: path.split('/').at(-1), data: () => data})), empty: false}
    : {exists: docs.has(ref.path), data: () => docs.get(ref.path)};
  const db = {collection, runTransaction(callback) {
    const run = async () => {const writes=[]; const value=await callback({get: async ref => get(ref), set: (ref,data,options={}) => writes.push(() => docs.set(ref.path, options.merge ? {...docs.get(ref.path),...data} : data)), delete: ref => writes.push(() => docs.delete(ref.path))}); writes.forEach(write=>write()); return value;};
    const result = queue.then(run); queue=result.catch(()=>{}); return result;
  }};
  return {db, docs};
}
function payload(imei = A, boletaId = 'receipt-1042') {
  return {cliente: {tipoDocumento: 'DNI', dni: '12345678', nombre: 'PERSONA PRUEBA', celular: '999111222', correo: 'fixture@example.test', direccion: 'TACNA', celulares: ['999111222'], correos: ['fixture@example.test']},
    equipo: {idEquipo: imei, idDuenio: '12345678', marca: 'APPLE', modelo: 'IPHONE', nombreComercial: 'IPHONE', isRegistrado: true, imei1Registrado: true},
    registro: {tipoDocumentoCliente: 'DNI', dniCliente: '12345678', celularCliente: '999111222', imeiEquipo: imei, imeiRegistrado: imei, marcaEquipo: 'APPLE', modeloEquipo: 'IPHONE', nombreComercialEquipo: 'IPHONE', estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE', operador: 'BITEL', tipo: 'TIENDA', tieneCaja: false, precio: '20', fecha: '2026-10-01T12:00:00.000Z', boletaExtranjeraId: boletaId, expectedReceiptFingerprint: receipt(imei, boletaId).receiptFingerprint}};
}

test('Apple create rejects conflicting duplicate IMEI through existing atomic locks', async () => {
  const {db} = memoryDb();
  const options = {env, fetchImpl: fetchReceipt(receipt())};
  const results = await Promise.allSettled([createRegistro(db, payload(), {}, options), createRegistro(db, payload(), {}, options)]);
  assert.equal(results.filter(r=>r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r=>r.status === 'rejected').reason.message, 'IMEI_YA_REGISTRADO');
});

test('Apple edits revalidate the selected receipt and reject old receipt with changed IMEI before writes', async () => {
  const {db, docs} = memoryDb();
  const saved = await createRegistro(db, payload(), {}, {env, fetchImpl: fetchReceipt(receipt())});
  const baseline = JSON.stringify([...docs]);
  let calls = 0;
  const fresh = receipt(); fresh.nBoleta = 2042;
  await assert.rejects(registrosTest.updateRegistro(db, {...payload(), id: saved.id}, {}, {env, fetchImpl: fetchReceipt(fresh)}), {message: 'APPLE_RECEIPTS_CHANGED', status: 409});
  assert.equal(JSON.stringify([...docs]), baseline);
  const revalidated = payload(); revalidated.registro.expectedReceiptFingerprint = sign(fresh).receiptFingerprint;
  const sameImei = await registrosTest.updateRegistro(db, {...revalidated, id: saved.id}, {}, {env, fetchImpl: async () => {calls++; return (fetchReceipt(fresh))();}});
  assert.equal(calls, 1);
  assert.equal(sameImei.registro.boletaExtranjeraNro, '2042');
  assert.equal(sameImei.boletaApple.nBoleta, 2042, 'PDF receives the newly verified repository receipt');
  const afterEdit = JSON.stringify([...docs]);
  await assert.rejects(registrosTest.updateRegistro(db, {...payload(B), id: saved.id}, {}, {env, fetchImpl: fetchReceipt(receipt(B, 'new-receipt'))}), {message: 'BOLETA_APPLE_NO_ENCONTRADA'});
  assert.notEqual(afterEdit, baseline);
  assert.equal(JSON.stringify([...docs]), afterEdit);
  const updated = await registrosTest.updateRegistro(db, {...payload(B, 'new-receipt'), id: saved.id}, {}, {env, fetchImpl: fetchReceipt(receipt(B, 'new-receipt'))});
  assert.equal(updated.registro.imeiRegistrado, B);
  assert.equal(updated.registro.boletaExtranjeraId, 'new-receipt');
});

test('client timeout aborts one request even before headers without automatic retry', async () => {
  const source = (await readFile(new URL('../../src/services/functionsClient.js', import.meta.url), 'utf8'))
    .replace("import { auth } from '../lib/firebase.js';", "const auth = {currentUser: {getIdToken: async () => 'fixture-token'}};")
    .replace("'../features/registros/appleReceiptValidation.js'", JSON.stringify(new URL('../../src/features/registros/appleReceiptValidation.js', import.meta.url).href))
    .replaceAll('import.meta.env', '({DEV: false})');
  const client = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const previousFetch=globalThis.fetch, previousTimer=globalThis.setTimeout, previousClear=globalThis.clearTimeout;
  let fire, calls=0, signal;
  globalThis.setTimeout = fn => {fire=fn; return 1;}; globalThis.clearTimeout = ()=>{};
  globalThis.fetch = async (_url,options) => {calls++; signal=options.signal; return new Promise(()=>{});};
  try {
    const request = client.consultarComprobanteApplePorImei(A);
    await Promise.resolve(); await Promise.resolve();
    fire(); await assert.rejects(request, {message: 'APPLE_RECEIPTS_TIMEOUT'});
    assert.equal(calls, 1); assert.equal(signal.aborted, true);
  } finally {globalThis.fetch=previousFetch; globalThis.setTimeout=previousTimer; globalThis.clearTimeout=previousClear;}
});

// Risk mitigation: all transports and writes below are isolated fixtures.
test('fingerprint is stable for property/sale ordering and ignores timestamps', () => {
  const first = receipt();
  first.boletaData.ventas.push({imeiEquipo: B, marcaEquipo: 'APPLE', modeloEquipo: 'SECOND', precio: '900'});
  const reordered = {...first, createdAt: 'later', updatedAt: 'later', boletaData: {...first.boletaData,
    ventas: [...first.boletaData.ventas].reverse().map(sale => Object.fromEntries(Object.entries(sale).reverse()))}};
  assert.equal(receiptFingerprint(first), receiptFingerprint(reordered));
  const numeric = structuredClone(first); numeric.boletaData.ventas[1].precio = 900;
  assert.equal(receiptFingerprint(first), receiptFingerprint(numeric));
});

for (const [field, change] of [
  ['state', r => {r.estado = 'ANULADA';}],
  ['IMEI', r => {r.boletaData.ventas[0].imeiEquipo = B;}],
  ['amount', r => {r.boletaData.ventas[0].precio = 1500;}],
  ['client', r => {r.boletaData.cliente.nombre = 'CHANGED';}],
  ['product', r => {r.boletaData.ventas[0].modeloEquipo = 'CHANGED';}],
  ['date', r => {r.fechaHora = '2026-10-02T12:00:00.000Z';}],
]) test(`fingerprint changes with relevant ${field}`, () => {
  const first = receipt(), changed = structuredClone(first); change(changed);
  assert.notEqual(receiptFingerprint(first), receiptFingerprint(changed));
});

for (const [state, code] of [['ANULADA', 'APPLE_RECEIPTS_ANNULLED'], [undefined, 'APPLE_RECEIPTS_LEGACY'], [null, 'APPLE_RECEIPTS_LEGACY']]) {
  test(`POS rejects receipt state ${state} before writes`, async () => {
    const {db, docs} = memoryDb(); const initial = JSON.stringify([...docs]);
    const r = {...receipt(), estado: state}; r.receiptFingerprint = receiptFingerprint(r);
    assert.equal(validateAppleReceipt(r, A).code, code);
    await assert.rejects(createRegistro(db, payload(), {}, {env, fetchImpl: async () => new Response(JSON.stringify({boletas: [r]}))}), {message: code, status: 409});
    assert.equal(JSON.stringify([...docs]), initial);
  });
}

test('fingerprint missing or forged in repository response is rejected', () => {
  const r = receipt(); delete r.receiptFingerprint;
  assert.throws(() => normalizeRemoteComprobanteApple({boletas: [r]}, A), {message: 'APPLE_RECEIPTS_FINGERPRINT_REQUIRED'});
  r.receiptFingerprint = 'a'.repeat(64);
  assert.throws(() => normalizeRemoteComprobanteApple({boletas: [r]}, A), {message: 'APPLE_RECEIPTS_CHANGED'});
});

for (const [kind, change, expectedCode] of [
  ['modified', r => {r.boletaData.ventas[0].precio++;}, 'APPLE_RECEIPTS_CHANGED'],
  ['annulled', r => {r.estado = 'ANULADA';}, 'APPLE_RECEIPTS_ANNULLED'],
  ['deleted', () => null, 'BOLETA_APPLE_NO_ENCONTRADA'],
  ['IMEI moved', r => {r.boletaData.ventas[0].imeiEquipo = B; r.boletaEquipoKeys = [B];}, 'APPLE_RECEIPTS_MISMATCH'],
]) test(`final validation ${kind}: 409, no POS persistence, exactly one lookup`, async () => {
  const {db, docs} = memoryDb(); const initial = JSON.stringify([...docs]);
  const r = receipt(); const value = change(r) === null ? null : r;
  if (value) value.receiptFingerprint = receiptFingerprint(value);
  let calls = 0;
  await assert.rejects(createRegistro(db, payload(), {}, {env, fetchImpl: async () => {calls++; return new Response(JSON.stringify({boletas: value ? [value] : []}));}}), {message: expectedCode, status: 409});
  assert.equal(calls, 1); assert.equal(JSON.stringify([...docs]), initial);
});

test('final save bypasses visual cache and persists fingerprint and observed updatedAt', async () => {
  const r = receipt(); r.updatedAt = '2026-10-06T12:00:00.000Z';
  let uiCalls = 0, finalCalls = 0;
  const lookup = createAppleReceiptLookup(async () => {uiCalls++; return response(r);});
  await lookup.lookup(A); await lookup.lookup(A); assert.equal(uiCalls, 1);
  const {db} = memoryDb();
  const result = await createRegistro(db, payload(), {}, {env, fetchImpl: async () => {finalCalls++; return new Response(JSON.stringify({boletas: [r]}));}});
  assert.equal(finalCalls, 1);
  assert.equal(result.registro.receiptFingerprint, r.receiptFingerprint);
  assert.equal(result.registro.receiptUpdatedAt, r.updatedAt);
});

test('legacy record without fingerprint requires new lookup before edit', async () => {
  const current = {marca: 'APPLE', imei: A, imei1: A, imei2: ''};
  const original = {id: 'legacy', marcaEquipo: 'APPLE', imeiEquipo: A, boletaExtranjeraId: receipt().id};
  assert.equal(canDeferStoredAppleReceipt(original, current, {status: 'saved', boleta: receipt()}), false);
  const {db, docs} = memoryDb();
  const saved = await createRegistro(db, payload(), {}, {env, fetchImpl: fetchReceipt(receipt())});
  const legacyPayload = payload(); delete legacyPayload.registro.expectedReceiptFingerprint;
  const before = JSON.stringify([...docs]);
  await assert.rejects(registrosTest.updateRegistro(db, {...legacyPayload, id: saved.id}, {}, {env, fetchImpl: fetchReceipt(receipt())}), {message: 'APPLE_RECEIPTS_FINGERPRINT_REQUIRED', status: 409});
  assert.equal(JSON.stringify([...docs]), before);
  const edited = await registrosTest.updateRegistro(db, {...payload(), id: saved.id}, {}, {env, fetchImpl: fetchReceipt(receipt())});
  assert.equal(edited.registro.receiptFingerprint, receipt().receiptFingerprint);
});

test('preverified receipt cannot bypass final changed or missing repository receipt', async () => {
  const old = receipt(); const changed = receipt(); changed.boletaData.ventas[0].precio++;
  for (const r of [changed, null]) {
    const {db, docs} = memoryDb(); const before = JSON.stringify([...docs]); let calls = 0;
    await assert.rejects(createRegistro(db, payload(), {}, {env, preverifiedAppleReceipt: old,
      fetchImpl: async () => {calls++; return new Response(JSON.stringify({boletas: r ? [sign(r)] : []}));}}), {status: 409});
    assert.equal(calls, 1); assert.equal(JSON.stringify([...docs]), before);
  }
});

test('public receipt discovery uses exactly one final lookup and persists actual reference', async () => {
  const {db} = memoryDb(); const input = payload(); input.registro.boletaExtranjeraId = ''; delete input.registro.expectedReceiptFingerprint;
  let calls = 0;
  const saved = await createRegistro(db, input, {}, {env, discoverReceipt: true,
    fetchImpl: async () => {calls++; return new Response(JSON.stringify({boletas: [receipt()]}));}});
  assert.equal(calls, 1); assert.equal(saved.registro.boletaExtranjeraId, receipt().id);
  assert.equal(saved.registro.receiptFingerprint, receipt().receiptFingerprint);
});


test('receipt fingerprint contract v1 matches the shared golden vector', () => {
  const input = {id: 'contract-fixture', estado: 'ACTIVA', nBoleta: 1042, fechaHora: '2026-10-01T12:00:00.000Z',
    boletaData: {cliente: {nombre: 'ANA', dni: '12345678'}, ventas: [{imeiEquipo: '490154203237518', marcaEquipo: 'APPLE', precio: 1200}]}};
  assert.equal(receiptFingerprint(input), 'ae76e8f1b61612a20f361403e959d81a6897b4016b55087bb7689a1627e18aa5');
});


test('fingerprint treats zoned instants consistently without inferring timezone for unzoned dates', () => {
  const r = receipt(); const zoned = {...r, fechaHora: '2026-10-01T07:00:00-05:00'};
  assert.equal(receiptFingerprint(r), receiptFingerprint(zoned));
  const previous = process.env.TZ;
  try {
    const unzoned = {...r, fechaHora: '2026-10-01T12:00:00'};
    process.env.TZ = 'UTC'; const hash = receiptFingerprint(unzoned);
    process.env.TZ = 'America/Lima'; assert.equal(receiptFingerprint(unzoned), hash);
  } finally {if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;}
});
