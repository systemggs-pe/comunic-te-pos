import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {
  __test,
  DNI_PHOTO_TYPES,
  handler,
  normalizeDniPhotosResponse,
  parseDniPhotoPayload,
} from '../functions/dniFotos.mjs';

function memoryGuardDb() {
  const docs = new Map();
  let queue = Promise.resolve();
  return {
    docs,
    collection: name => ({doc: id => `${name}/${id}`}),
    runTransaction(callback) {
      const result = queue.then(() => callback({
        get: async ref => ({exists: docs.has(ref), data: () => docs.get(ref)}),
        set: (ref, data) => docs.set(ref, data),
        delete: ref => docs.delete(ref),
      }));
      queue = result.catch(() => {});
      return result;
    },
  };
}
let guardDb = memoryGuardDb();
const fetchPhotos = (dni, tipo, options = {}) => __test.fetchDniFotos(dni, tipo, {
  claim: (value, type) => __test.claimDniPhotoRequest(value, type, {db: guardDb}),
  ...options,
});

async function withMockedCodart(mockFetch, callback) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CODART_TOKEN;
  globalThis.fetch = mockFetch;
  process.env.CODART_TOKEN = 'test-codart-token';
  __test.clearDniPhotoCache();
  guardDb = memoryGuardDb();
  try {
    return await callback();
  } finally {
    __test.clearDniPhotoCache();
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.CODART_TOKEN;
    else process.env.CODART_TOKEN = originalToken;
  }
}

function successfulProviderResponse(dni = '12345678') {
  return new Response(JSON.stringify({
    success: true,
    source: 'CODART_X_API_V1',
    data: {
      dni,
      nombres: 'NOMBRE',
      apellidos: 'APELLIDO',
      images: [{data_uri: 'data:image/png;base64,aGVsbG8='}],
    },
  }), {status: 200, headers: {'Content-Type': 'application/json'}});
}

function tinyPngBase64() {
  return 'iVBORw0KGgo=';
}

test('parseDniPhotoPayload only accepts eight digit DNI values', () => {
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678'}), {dni: '12345678', tipo: 'azul'});
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678', tipo: 'electronico'}), {dni: '12345678', tipo: 'electronico'});
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678', refresh: true}), {dni: '12345678', tipo: 'azul', refresh: true});
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678', refresh: 'true'}), {dni: '12345678', tipo: 'azul'});
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

test('normalizeDniPhotosResponse accepts CODART alternate image fields and raw base64 images', () => {
  const normalized = normalizeDniPhotosResponse({
    success: true,
    data: {
      dni: '12345678',
      nombres: 'NOMBRE',
      apellidos: 'APELLIDO',
      anverso: tinyPngBase64(),
      reverso: {base64: tinyPngBase64()},
    },
  }, '12345678', 'azul');

  assert.equal(normalized.success, true);
  assert.equal(normalized.data.images.length, 2);
  assert.equal(normalized.data.images[0].mime, 'image/png');
  assert.equal(normalized.data.images[0].dataUri, `data:image/png;base64,${tinyPngBase64()}`);
  assert.equal(normalized.data.images[0].side, 'front');
  assert.equal(normalized.data.images[1].side, 'back');
  const backOnly = normalizeDniPhotosResponse({data: {reverso: tinyPngBase64()}}, '12345678');
  assert.equal(backOnly.data.images[0].side, 'back');
  const portrait = normalizeDniPhotosResponse({data: {foto: tinyPngBase64()}}, '12345678');
  assert.equal(portrait.data.images[0].side, 'front');
  const fallback = normalizeDniPhotosResponse({data: {front: 'https://invalid.example/photo', anverso: tinyPngBase64()}}, '12345678');
  assert.equal(fallback.data.images[0].side, 'front');
});

test('fetchDniFotos sends the documented CODART request and normalizes images', async () => {
  let captured;
  await withMockedCodart(async (url, options) => {
    captured = {url, options};
    return successfulProviderResponse();
  }, async () => {
    const result = await fetchPhotos('12345678', 'azul');
    assert.equal(result.success, true);
    assert.equal(result.data.images.length, 1);
  });

  assert.equal(captured.url, `${DNI_PHOTO_TYPES.azul.url}/12345678`);
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-codart-token');
});

test('DNI photo dispatch returns only the current provider response without history or counters', async () => {
  await withMockedCodart(async () => successfulProviderResponse(), async () => {
    const result = await fetchPhotos('12345678', 'azul');
    assert.deepEqual(Object.keys(result).sort(), ['data', 'source', 'success']);
    assert.equal(Object.hasOwn(result, 'historyEntry'), false);
    assert.equal(Object.hasOwn(result, 'successCount'), false);
    assert.equal(Object.hasOwn(result, 'cached'), false);
  });
});

test('fetchDniFotos deduplicates simultaneous and immediate repeated CODART calls for the same DNI and type', async () => {
  let calls = 0;
  await withMockedCodart(async () => {
    calls += 1;
    return successfulProviderResponse('22222222');
  }, async () => {
    const [first, second] = await Promise.all([
      fetchPhotos('22222222', 'azul'),
      fetchPhotos('22222222', 'azul'),
    ]);
    const third = await fetchPhotos('22222222', 'azul');

    assert.equal(calls, 1);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(third.success, true);
  });
});

test('explicit refresh bypasses successful cache but simultaneous refreshes share one provider request', async () => {
  let calls = 0;
  let finishRefresh;
  let markStarted;
  const refreshGate = new Promise(resolve => { finishRefresh = resolve; });
  const refreshStarted = new Promise(resolve => { markStarted = resolve; });
  await withMockedCodart(async () => {
    calls++;
    if (calls === 2) {
      markStarted();
      await refreshGate;
    }
    const response = await successfulProviderResponse().json();
    response.data.nombres = `CONSULTA ${calls}`;
    return new Response(JSON.stringify(response));
  }, async () => {
    assert.equal((await fetchPhotos('12345678', 'azul')).data.nombres, 'CONSULTA 1');
    const requests = [
      fetchPhotos('12345678', 'azul', {refresh: true}),
      fetchPhotos('12345678', 'azul', {refresh: true}),
      fetchPhotos('12345678', 'azul'),
    ];
    await refreshStarted;
    finishRefresh();
    const responses = await Promise.all(requests);
    assert.equal(calls, 2);
    assert.equal(responses.every(result => result.data.nombres === 'CONSULTA 2'), true);
    assert.equal((await fetchPhotos('12345678', 'azul')).data.nombres, 'CONSULTA 2');
    assert.equal(calls, 2);
    assert.equal(guardDb.docs.size, 0, 'success releases the distributed lease immediately');
  });
});

test('DNI photo responses disable HTTP caching', async () => {
  const response = await handler({httpMethod: 'OPTIONS', headers: {}});
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('DNI photo endpoint keeps a practical authenticated rate limit for repeated provider retries', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../functions/dniFotos.mjs', import.meta.url), 'utf8'));
  assert.match(source, /rateLimit: \{name: 'dniFotos', max: 10/);
});

test('fetchDniFotos maps CODART credit errors without exposing its response body', async () => {
  await withMockedCodart(async () => new Response(JSON.stringify({
    message: 'provider detail must not be exposed',
  }), {status: 402, headers: {'Content-Type': 'application/json'}}), async () => {
    await assert.rejects(
      () => fetchPhotos('12345678', 'electronico'),
      error => {
        assert.equal(error.message, 'CODART_CREDITOS_INSUFICIENTES');
        assert.equal(error.status, 502);
        assert.deepEqual(error.payload, {upstreamStatus: 402});
        return true;
      },
    );
  });
});

test('slow CODART success after the old ten-second deadline returns images with one charge', async () => {
  let calls = 0;
  await withMockedCodart(async (_url, {signal}) => {
    calls++;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 10_100);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, {once: true});
    });
    return successfulProviderResponse();
  }, async () => {
    const result = await fetchPhotos('12345678', 'azul');
    assert.equal(result.success, true);
    assert.equal(result.data.images.length, 1);
    assert.equal(calls, 1);
  });
});

test('body download timeouts exhaust two attempts, release the lease and allow a later manual retry', async () => {
  const originalTimeout = process.env.CODART_TIMEOUT_MS;
  process.env.CODART_TIMEOUT_MS = '20';
  let calls = 0;
  try {
    await withMockedCodart(async (_url, {signal}) => {
      calls++;
      if (calls > 2) return successfulProviderResponse();
      return {
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
        }),
      };
    }, async () => {
      await assert.rejects(fetchPhotos('12345678', 'azul'), /DNI_FOTOS_TIMEOUT/);
      assert.equal(calls, 2);
      assert.equal(guardDb.docs.size, 0);
      const retry = await fetchPhotos('12345678', 'azul');
      assert.equal(retry.success, true);
      assert.equal(calls, 3);
      assert.equal(guardDb.docs.size, 0);
    });
  } finally {
    if (originalTimeout === undefined) delete process.env.CODART_TIMEOUT_MS;
    else process.env.CODART_TIMEOUT_MS = originalTimeout;
  }
});

test('malformed or empty provider responses allow a later manual retry without caching the error', async () => {
  for (const body of ['not JSON', '{"success":true,"data":{"images":[]}}']) {
    let calls = 0;
    await withMockedCodart(async () => {
      calls++;
      return calls === 1 ? new Response(body) : successfulProviderResponse();
    }, async () => {
      await assert.rejects(fetchPhotos('12345678', 'azul'), /DNI_FOTOS_INVALID_RESPONSE/);
      assert.equal(calls, 1);
      assert.equal(guardDb.docs.size, 0);
      assert.equal((await fetchPhotos('12345678', 'azul')).success, true);
      assert.equal(calls, 2);
    });
  }
});

test('distributed lease admits one concurrent claim and allows the next immediately after release without storing PII', async () => {
  await withMockedCodart(async () => successfulProviderResponse(), async () => {
    const nowMs = Date.now();
    const claim = () => __test.claimDniPhotoRequest('12345678', 'azul', {db: guardDb, nowMs});
    const outcomes = await Promise.allSettled([claim(), claim()]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(item => item.status === 'rejected').reason.message, 'DNI_FOTOS_IN_PROGRESS');
    assert.equal(JSON.stringify([...guardDb.docs]).includes('12345678'), false);
    assert.equal(JSON.stringify([...guardDb.docs]).includes('data:image'), false);
    const release = outcomes.find(item => item.status === 'fulfilled').value;
    await release();
    assert.equal(guardDb.docs.size, 0);
    const releaseNext = await claim();
    await releaseNext();
    assert.equal(guardDb.docs.size, 0);
  });
});

test('a crashed request lease expires and its late cleanup cannot delete a newer active request', async () => {
  await withMockedCodart(async () => successfulProviderResponse(), async () => {
    const nowMs = Date.now();
    const firstRelease = await __test.claimDniPhotoRequest('12345678', 'azul', {db: guardDb, nowMs});
    const newNowMs = nowMs + __test.ACTIVE_REQUEST_LEASE_MS;
    const secondRelease = await __test.claimDniPhotoRequest('12345678', 'azul', {db: guardDb, nowMs: newNowMs});
    await firstRelease();
    assert.equal(guardDb.docs.size, 1);
    await assert.rejects(
      __test.claimDniPhotoRequest('12345678', 'azul', {db: guardDb, nowMs: newNowMs}),
      /DNI_FOTOS_IN_PROGRESS/,
    );
    await secondRelease();
    assert.equal(guardDb.docs.size, 0);
  });
});

test('a concurrent cold instance cannot repeat an active provider call but can consult again after it finishes', async () => {
  let calls = 0;
  let finishProvider;
  let markStarted;
  const providerGate = new Promise(resolve => { finishProvider = resolve; });
  const providerStarted = new Promise(resolve => { markStarted = resolve; });
  await withMockedCodart(async () => {
    calls++;
    markStarted();
    await providerGate;
    return successfulProviderResponse();
  }, async () => {
    const first = fetchPhotos('12345678', 'azul');
    await providerStarted;
    __test.clearDniPhotoCache();
    try {
      await assert.rejects(fetchPhotos('12345678', 'azul', {refresh: true}), /DNI_FOTOS_IN_PROGRESS/);
      assert.equal(calls, 1);
    } finally {
      finishProvider();
      await first;
    }
    __test.clearDniPhotoCache();
    assert.equal((await fetchPhotos('12345678', 'azul')).success, true);
    assert.equal(calls, 2);
  });
});

test('legacy ten-minute charge guards do not block a new request', async () => {
  let calls = 0;
  await withMockedCodart(async () => {
    calls++;
    return successfulProviderResponse();
  }, async () => {
    const key = createHmac('sha256', process.env.CODART_TOKEN).update('azul:12345678').digest('hex');
    const legacyPath = `_rateLimits/dni-photo-${key}`;
    guardDb.docs.set(legacyPath, {blockedUntilMs: Date.now() + 600_000});
    assert.equal((await fetchPhotos('12345678', 'azul')).success, true);
    assert.equal(calls, 1);
    assert.deepEqual([...guardDb.docs.keys()], [legacyPath]);
  });
});

test('a lease cleanup failure does not discard paid images or cause an automatic retry', async () => {
  let calls = 0;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    await withMockedCodart(async () => {
      calls++;
      return successfulProviderResponse();
    }, async () => {
      const result = await fetchPhotos('12345678', 'azul', {
        claim: async () => () => { throw new Error('unavailable'); },
      });
      assert.equal(result.success, true);
      assert.equal(calls, 1);
      assert.deepEqual(warnings, ['DNI_FOTOS_LEASE_RELEASE_FAILED']);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('base64 line wrapping does not discard valid provider images', () => {
  const result = normalizeDniPhotosResponse({data: {images: [{data_uri: 'data:image/png;base64,\niVBORw0K\r\nGgo='}]}}, '12345678');
  assert.equal(result.data.images[0].dataUri, `data:image/png;base64,${tinyPngBase64()}`);
});

test('valid personal data without photographs remains usable; unsafe URLs are never returned', async () => {
  await withMockedCodart(async () => new Response(JSON.stringify({success: true, data: {dni: '12345678', nombres: 'PRUEBA', foto: 'https://invalid.example/photo'}})), async () => {
    const result = await fetchPhotos('12345678', 'azul');
    assert.equal(result.success, true); assert.equal(result.data.nombres, 'PRUEBA'); assert.deepEqual(result.data.images, []);
  });
});

test('invalid, not-found, permanent auth, credits and rate limit without short Retry-After never retry', async () => {
  for (const [status, code] of [[400,'DNI_INVALIDO'],[404,'DNI_FOTOS_NOT_FOUND'],[401,'CODART_TOKEN_INVALID'],[403,'CODART_TOKEN_INVALID'],[402,'CODART_CREDITOS_INSUFICIENTES'],[429,'CODART_RATE_LIMIT']]) {
    let calls = 0;
    await withMockedCodart(async () => {calls++; return new Response('private provider body', {status});}, async () => {
      await assert.rejects(__test.fetchDniFotosFromProvider('12345678','azul',{sleep: async () => {}}), error => error.message === code);
      assert.equal(calls, 1);
    });
  }
});

test('temporary 500 retries once successfully and exhausted 503 stops at two attempts', async () => {
  for (const succeeds of [true, false]) {
    let calls = 0; const delays = [];
    await withMockedCodart(async () => {calls++; return succeeds && calls === 2 ? successfulProviderResponse() : new Response('',{status: succeeds ? 500 : 503});}, async () => {
      const request = __test.fetchDniFotosFromProvider('12345678','azul',{sleep: async delay => delays.push(delay)});
      if (succeeds) assert.equal((await request).success, true); else await assert.rejects(request,/DNI_FOTOS_UPSTREAM_ERROR/);
      assert.equal(calls, 2); assert.deepEqual(delays,[500]);
    });
  }
});

test('rate limit retries only with a short provider wait instruction', async () => {
  let calls = 0; const delays = [];
  await withMockedCodart(async () => {calls++; return calls === 1 ? new Response('',{status: 429, headers: {'Retry-After':'1'}}) : successfulProviderResponse();}, async () => {
    assert.equal((await __test.fetchDniFotosFromProvider('12345678','azul',{sleep: async delay => delays.push(delay)})).success,true);
    assert.equal(calls,2); assert.deepEqual(delays,[1000]);
  });
  calls = 0;
  await withMockedCodart(async () => {calls++; return new Response('',{status: 429, headers: {'Retry-After':'30'}});}, async () => {
    await assert.rejects(__test.fetchDniFotosFromProvider('12345678','azul'),/CODART_RATE_LIMIT/); assert.equal(calls,1);
  });
});

test('temporary network failure is retried but private details never escape final errors or logs', async () => {
  let calls = 0; const logs = []; const warn = console.warn; console.warn = value => logs.push(value);
  try {
    await withMockedCodart(async () => {calls++; throw new TypeError('fetch failed token=private dni=12345678');}, async () => {
      await assert.rejects(__test.fetchDniFotosFromProvider('12345678','azul',{sleep: async () => {}}),/DNI_FOTOS_UNAVAILABLE/); assert.equal(calls,2);
    });
    assert.ok(logs.every(log => !log.includes('12345678') && !log.includes('private')));
    assert.equal(JSON.parse(logs[1]).attempt,2);
  } finally {console.warn = warn;}
});

test('server cache expires rather than retaining photos indefinitely', async () => {
  let calls = 0; const now = Date.now; let clock = now(); Date.now = () => clock;
  try {
    await withMockedCodart(async () => {calls++; return successfulProviderResponse();},async () => {
      await fetchPhotos('12345678','azul'); await fetchPhotos('12345678','azul'); assert.equal(calls,1);
      clock += 600_001; await fetchPhotos('12345678','azul'); assert.equal(calls,2);
    });
  } finally {Date.now = now;}
});
