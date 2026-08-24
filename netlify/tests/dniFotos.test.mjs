import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __test,
  DNI_PHOTO_TYPES,
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

test('DNI images are split into Firestore-safe chunks and can be rebuilt', () => {
  const base64 = Buffer.alloc(350_000, 7).toString('base64');
  const image = {side: 'front', dataUri: `data:image/jpeg;base64,${base64}`};
  const {meta, chunks} = __test.splitImageChunks(image, 0);

  assert.equal(meta.side, 'front');
  assert.equal(meta.mime, 'image/jpeg');
  assert.equal(meta.chunkCount, 2);
  assert.equal(chunks.join(''), base64);
  assert.equal(chunks.every(chunk => chunk.length <= 400_000), true);

  const writes = [];
  const batch = {set: (ref, data) => writes.push({ref, data})};
  const docRef = {
    collection: name => ({
      doc: id => ({path: `${name}/${id}`}),
    }),
  };
  const metas = __test.queueImageChunks(batch, docRef, [image]);
  assert.deepEqual(metas, [meta]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].data.chunk + writes[1].data.chunk, base64);
});

test('fetchDniFotos sends the documented CODART request and normalizes images', async () => {
  let captured;
  await withMockedCodart(async (url, options) => {
    captured = {url, options};
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
  }, async () => {
    const result = await __test.fetchDniFotos('12345678', 'azul');
    assert.equal(result.success, true);
    assert.equal(result.data.images.length, 1);
  });

  assert.equal(captured.url, `${DNI_PHOTO_TYPES.azul.url}/12345678`);
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-codart-token');
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

test('recent complete Firestore history is reused without another paid query', async () => {
  const nowMs = Date.parse('2026-08-24T12:00:00.000Z');
  const chunkDocs = [
    {data: () => ({side: 'front', mime: 'image/png', index: 1, chunk: 'sbG8='})},
    {data: () => ({side: 'front', mime: 'image/png', index: 0, chunk: 'aGV'})},
  ];
  const candidate = {
    id: 'history_12345678',
    data: () => ({
      createdAtIso: new Date(nowMs - 5 * 60 * 1000).toISOString(),
      status: 'success',
      dni: '12345678',
      tipo: 'azul',
      hasImages: true,
      imageCount: 1,
      result: {
        dni: '12345678',
        tipo: 'azul',
        images: [{side: 'front', mime: 'image/png', chunkCount: 2}],
      },
    }),
    ref: {collection: () => ({get: async () => ({docs: chunkDocs})})},
  };
  const historyQuery = {
    where(field, operator, value) {
      assert.deepEqual([field, operator, value], ['dni', '==', '12345678']);
      return this;
    },
    limit(value) {
      assert.equal(value, 20);
      return this;
    },
    get: async () => ({docs: [candidate]}),
  };
  const base = {collection: name => {
    assert.equal(name, 'dniFotosConsultas');
    return historyQuery;
  }};
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({doc: () => base}),
      }),
    }),
  };

  const entry = await __test.findRecentCachedEntry(db, '12345678', 'azul', nowMs);
  assert.equal(entry.result.images[0].dataUri, 'data:image/png;base64,aGVsbG8=');
});
