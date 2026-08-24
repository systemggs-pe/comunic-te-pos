import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __test,
  DNI_PHOTO_TYPES,
  handler,
  normalizeDniPhotosResponse,
  parseDniPhotoPayload,
} from '../functions/dniFotos.mjs';

async function withMockedCodart(mockFetch, callback) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CODART_TOKEN;
  globalThis.fetch = mockFetch;
  process.env.CODART_TOKEN = 'test-codart-token';
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.CODART_TOKEN;
    else process.env.CODART_TOKEN = originalToken;
  }
}

function successfulProviderResponse() {
  return new Response(JSON.stringify({
    success: true,
    source: 'CODART_X_API_V1',
    data: {
      dni: '12345678',
      nombres: 'NOMBRE',
      apellidos: 'APELLIDO',
      images: [{data_uri: 'data:image/png;base64,aGVsbG8='}],
    },
  }), {status: 200, headers: {'Content-Type': 'application/json'}});
}

test('parseDniPhotoPayload only accepts eight digit DNI values', () => {
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678'}), {dni: '12345678', tipo: 'azul'});
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678', tipo: 'electronico'}), {dni: '12345678', tipo: 'electronico'});
  assert.throws(() => parseDniPhotoPayload({dni: 'ABC12345'}), /DNI_INVALIDO/);
  assert.throws(() => parseDniPhotoPayload({dni: '123456789'}), /DNI_INVALIDO/);
  assert.throws(() => parseDniPhotoPayload({dni: '12345678', tipo: 'verde'}), /DNI_FOTO_TIPO_INVALIDO/);
  assert.equal(DNI_PHOTO_TYPES.azul.url.endsWith('/dniv'), true);
  assert.equal(DNI_PHOTO_TYPES.electronico.url.endsWith('/dnivel'), true);
});

test('normalizeDniPhotosResponse maps safe image data URIs only', () => {
  const normalized = normalizeDniPhotosResponse({
    success: true,
    source: 'CODART_X_API_V1',
    data: {
      dni: '12345678',
      nombres: 'NOMBRE',
      apellidos: 'APELLIDO',
      images: [
        {data_uri: 'data:image/png;base64,aGVsbG8='},
        {data_uri: 'data:image/jpeg;base64,aGVsbG8='},
        {data_uri: 'data:image/svg+xml;base64,aGVsbG8='},
      ],
    },
  }, '12345678', 'electronico');

  assert.equal(normalized.success, true);
  assert.equal(normalized.data.tipo, 'electronico');
  assert.equal(normalized.data.tipoLabel, 'DNI electronico');
  assert.equal(normalized.data.dni, '12345678');
  assert.equal(normalized.data.images.length, 2);
  assert.equal(normalized.data.images[0].side, 'front');
  assert.equal(normalized.data.images[1].side, 'back');
});

test('fetchDniFotos sends the documented CODART request and normalizes images', async () => {
  let captured;
  await withMockedCodart(async (url, options) => {
    captured = {url, options};
    return successfulProviderResponse();
  }, async () => {
    const result = await __test.fetchDniFotos('12345678', 'azul');
    assert.equal(result.success, true);
    assert.equal(result.data.images.length, 1);
  });

  assert.equal(captured.url, `${DNI_PHOTO_TYPES.azul.url}/12345678`);
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-codart-token');
});

test('DNI photo dispatch returns only the current provider response without history or counters', async () => {
  await withMockedCodart(async () => successfulProviderResponse(), async () => {
    const result = await __test.dispatchDniFotos({dni: '12345678', tipo: 'azul'});
    assert.deepEqual(Object.keys(result).sort(), ['data', 'source', 'success']);
    assert.equal(Object.hasOwn(result, 'historyEntry'), false);
    assert.equal(Object.hasOwn(result, 'successCount'), false);
    assert.equal(Object.hasOwn(result, 'cached'), false);
  });
});

test('DNI photo responses disable HTTP caching', async () => {
  const response = await handler({httpMethod: 'OPTIONS', headers: {}});
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('fetchDniFotos maps CODART credit errors without exposing its response body', async () => {
  await withMockedCodart(async () => new Response(JSON.stringify({
    message: 'provider detail must not be exposed',
  }), {status: 402, headers: {'Content-Type': 'application/json'}}), async () => {
    await assert.rejects(
      () => __test.fetchDniFotos('12345678', 'electronico'),
      error => {
        assert.equal(error.message, 'CODART_CREDITOS_INSUFICIENTES');
        assert.equal(error.status, 502);
        assert.deepEqual(error.payload, {upstreamStatus: 402});
        return true;
      },
    );
  });
});
