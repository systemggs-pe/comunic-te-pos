import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findRemoteComprobanteAppleByImei,
  getAppleReceiptsApiConfig,
  normalizeRemoteComprobanteApple,
  verifyRemoteComprobanteApple,
} from '../functions/_appleReceiptsApi.mjs';

import {receiptFingerprint} from '../functions/_receiptFingerprint.mjs';
const PRIMARY_IMEI = '490154203237518';
const SECONDARY_IMEI = '356938035643809';
const TEST_ENV = {
  APPLE_RECEIPTS_API_URL: 'https://boletas.example.test/api/boletas',
  APPLE_RECEIPTS_API_KEY: 'server-only-test-key',
  APPLE_RECEIPTS_TIMEOUT_MS: '5000',
};

function remoteBoleta(id = 'receipt-1042', imeis = [PRIMARY_IMEI]) {
  const receipt = {
    estado: 'ACTIVA',
    id,
    nBoleta: 1042,
    fechaHora: "2026-10-01T12:00:00.000Z",
    boletaEquipoKeys: imeis,
    boletaData: {
      cliente: {nombre: 'CLIENTE APPLE', dni: '12345678'},
      ventas: [{imeiEquipo: imeis[0], imei2Equipo: imeis[1] || '', marcaEquipo: 'APPLE', precio: 1200}],
      equiposMap: {[imeis[0]]: {imei2: imeis[1] || '', marca: 'APPLE'}},
    },
  };
  return {...receipt, receiptFingerprint: receiptFingerprint(receipt)};
}

test('remote Apple lookup uses the server-only key and exact IMEI query', async () => {
  let captured;
  const result = await findRemoteComprobanteAppleByImei(SECONDARY_IMEI, {
    env: TEST_ENV,
    authorization: 'Bearer current-user-token',
    fetchImpl: async (url, options) => {
      captured = {url, options};
      return new Response(JSON.stringify({boletas: [remoteBoleta('receipt-1042', [PRIMARY_IMEI, SECONDARY_IMEI])]}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    },
  });

  assert.equal(result.id, 'receipt-1042');
  assert.equal(captured.url, TEST_ENV.APPLE_RECEIPTS_API_URL);
  assert.equal(captured.options.headers['X-API-Key'], TEST_ENV.APPLE_RECEIPTS_API_KEY);
  assert.equal(captured.options.headers.Authorization, 'Bearer current-user-token');
  assert.deepEqual(JSON.parse(captured.options.body), {
    action: 'searchHistory', searchType: 'imei', query: SECONDARY_IMEI, imei: SECONDARY_IMEI,
  });
});

test('remote Apple lookup rejects unrelated or mismatched receipt data', async () => {
  assert.throws(() => normalizeRemoteComprobanteApple({boletas: [remoteBoleta()]}, SECONDARY_IMEI), {message: 'APPLE_RECEIPTS_MISMATCH'});
  assert.equal(normalizeRemoteComprobanteApple({found: false}, PRIMARY_IMEI), null);

  const fetchImpl = async () => new Response(JSON.stringify({boletas: [remoteBoleta()]}), {status: 200});
  assert.equal(await verifyRemoteComprobanteApple('different-id', PRIMARY_IMEI, {env: TEST_ENV, fetchImpl}), null);
  assert.equal((await verifyRemoteComprobanteApple('receipt-1042', PRIMARY_IMEI, {env: TEST_ENV, fetchImpl})).id, 'receipt-1042');
});

test('remote Apple configuration and upstream errors never expose the API key', async () => {
  assert.throws(() => getAppleReceiptsApiConfig({}), {message: 'APPLE_RECEIPTS_NOT_CONFIGURED'});
  assert.throws(() => getAppleReceiptsApiConfig({...TEST_ENV, APPLE_RECEIPTS_API_URL: 'http://public.example.test'}), {message: 'APPLE_RECEIPTS_NOT_CONFIGURED'});

  await assert.rejects(
    findRemoteComprobanteAppleByImei(PRIMARY_IMEI, {
      env: TEST_ENV,
      fetchImpl: async () => new Response(`secret: ${TEST_ENV.APPLE_RECEIPTS_API_KEY}`, {status: 403}),
    }),
    error => error.message === 'APPLE_RECEIPTS_ACCESS_DENIED'
      && !error.message.includes(TEST_ENV.APPLE_RECEIPTS_API_KEY),
  );
});
