import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test, handler} from '../functions/analizarCajaGemini.mjs';
import {prepareGeminiBoxImage, scanBoxWithGemini} from '../../src/services/geminiBoxScanner.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]).toString('base64');
const IMAGE = {imageBase64: JPEG, mimeType: 'image/jpeg'};
const EMPTY = Object.fromEntries(__test.FIELD_NAMES.map(key => [key, '']));
const BOX = {
  imei1: '869084082793146', imei2: '869084082793153', sn: '74440/66NN07979',
  marca: 'XIAOMI', modelo: '25128RN17L', nombreComercial: 'REDMI A7 PRO',
  ram: '4', memoria: '64', color: 'BLACK',
};
const providerPayload = (data = BOX, finishReason = 'STOP') => ({
  candidates: [{finishReason, content: {parts: [{text: JSON.stringify(data)}]}}],
});

async function withProvider(mockFetch, callback, env = {}) {
  const keys = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_TIMEOUT_MS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  Object.assign(process.env, {GEMINI_API_KEY: 'test-only-key', GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_TIMEOUT_MS: '25000'}, env);
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function fakeCanvas(encoded = `data:image/jpeg;base64,${JPEG}`) {
  return {
    width: 0, height: 0,
    getContext: () => ({fillRect() {}, drawImage() {}}),
    toDataURL: () => encoded,
  };
}

test('Gemini validates image size, canonical base64 and actual image signature', () => {
  assert.deepEqual(__test.parseImage(IMAGE), {data: JPEG, mimeType: 'image/jpeg'});
  for (const imageBase64 of ['', 'a', '!!!!', 'SGVsbG8=', 'https://example.com/image.jpg', `data:image/jpeg;base64,${JPEG}`]) {
    assert.throws(() => __test.parseImage({imageBase64}), /IMAGEN_BASE64_INVALIDA/);
  }
  assert.throws(() => __test.parseImage({...IMAGE, mimeType: 'image/png'}), /IMAGEN_BASE64_INVALIDA/);
  assert.throws(() => __test.parseImage({...IMAGE, mimeType: 'image/svg+xml'}), /MIME_NO_PERMITIDO/);
  assert.throws(() => __test.parseImage({imageBase64: 'A'.repeat(__test.MAX_IMAGE_BYTES * 4 / 3 + 4)}), error => error.status === 413);
});

test('Gemini accepts PNG and WebP signatures with matching MIME', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
  const webp = Buffer.from('RIFF0000WEBP').toString('base64');
  assert.equal(__test.parseImage({imageBase64: png, mimeType: 'image/png'}).mimeType, 'image/png');
  assert.equal(__test.parseImage({imageBase64: webp, mimeType: 'image/webp'}).mimeType, 'image/webp');
});

test('Gemini normalizes the nine fields without involving the trainable verifier', () => {
  const result = __test.normalizeBoxData({...BOX, color: ' black ', ram: '4 GB', nombreComercial: 'redmi  a7 pro', injected: 'ignored'});
  assert.deepEqual(result.data, BOX);
  assert.equal(result.source, 'gemini');
  assert.equal(result.fields.imei1.confidence, 'review');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(Object.keys(result.data), __test.FIELD_NAMES);
});

test('Gemini never repairs or truncates invalid IMEIs, including checksum and repeated digits', () => {
  for (const imei1 of ['869084082793145', '8690840827931468', '869O84082793146', '000000000000000', '86908408279314']) {
    const result = __test.normalizeBoxData({...BOX, imei1});
    assert.equal(result.data.imei1, '');
    assert.match(result.warnings[0], /IMEI 1/);
  }
  assert.equal(__test.normalizeBoxData({...BOX, imei1: '869084 082793146'}).data.imei1, BOX.imei1);
});

test('Gemini rejects a duplicate secondary IMEI, preserves serial punctuation and requires numeric GB', () => {
  const result = __test.normalizeBoxData({...BOX, imei2: BOX.imei1, ram: '4+4', memoria: '128/256', modelo: 'X'.repeat(81)});
  assert.equal(result.data.imei2, '');
  assert.equal(result.data.sn, BOX.sn);
  assert.equal(result.data.ram, '');
  assert.equal(result.data.memoria, '');
  assert.equal(result.data.modelo, '');
  assert.match(result.warnings[0], /duplicado/);
});

test('Gemini rejects blank, malformed, truncated or blocked extraction responses', () => {
  assert.throws(() => __test.normalizeBoxData(EMPTY), /GEMINI_NO_DATA/);
  for (const value of [null, [], {}, {...BOX, ram: {}}, {...BOX, imei1: 869084082793146}]) {
    assert.throws(() => __test.normalizeBoxData(value), /GEMINI_INVALID_RESPONSE/);
  }
  assert.throws(() => __test.parseGeminiResponse(providerPayload(BOX, 'MAX_TOKENS')), /GEMINI_INVALID_RESPONSE/);
  assert.throws(() => __test.parseGeminiResponse({promptFeedback: {blockReason: 'SAFETY'}}), /GEMINI_IMAGE_REJECTED/);
  assert.throws(() => __test.parseGeminiResponse(providerPayload(BOX, 'SAFETY')), /GEMINI_IMAGE_REJECTED/);
  assert.throws(() => __test.parseGeminiResponse({candidates: [{finishReason: 'STOP', content: {parts: [{text: '{oops'}]}}]}), /GEMINI_INVALID_RESPONSE/);
});

test('Gemini ignores thought parts and tolerates a JSON code fence without executing content', () => {
  const payload = providerPayload();
  payload.candidates[0].content.parts = [
    {thought: true, text: 'not a result'},
    {text: '```json\n' + JSON.stringify(BOX) + '\n```'},
  ];
  assert.deepEqual(__test.parseGeminiResponse(payload).data, BOX);
});

test('Gemini REST request uses a server-only key header, inline image and structured fields', async () => {
  let captured;
  await withProvider(async (url, options) => {
    captured = {url, options};
    return new Response(JSON.stringify(providerPayload()));
  }, async () => {
    const result = await __test.analizarCajaGemini(IMAGE);
    assert.deepEqual(result.data, BOX);
    assert.equal(JSON.stringify(result).includes('test-only-key'), false);
  });
  assert.match(captured.url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(captured.url.includes('key='), false);
  assert.equal(captured.options.headers['x-goog-api-key'], 'test-only-key');
  assert.equal(captured.options.signal instanceof AbortSignal, true);
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.contents[0].parts[0].inlineData, {data: JPEG, mimeType: 'image/jpeg'});
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema.required, __test.FIELD_NAMES);
  assert.match(body.systemInstruction.parts[0].text, /Nunca cambies digitos/);
  assert.equal(Object.hasOwn(body, 'tools'), false);
});

test('Gemini handles missing configuration without sending a request', async () => {
  const forbidden = () => assert.fail('must not call Gemini');
  await withProvider(forbidden, async () => {
    await assert.rejects(() => __test.analizarCajaGemini(IMAGE), /GEMINI_NOT_CONFIGURED/);
  }, {GEMINI_API_KEY: ''});
  await withProvider(forbidden, async () => {
    await assert.rejects(() => __test.analizarCajaGemini(IMAGE), /GEMINI_MODEL_INVALID/);
  }, {GEMINI_MODEL: '../../elsewhere?key=other'});
});

test('Gemini errors never expose provider responses, key values or network exception details', async () => {
  for (const [status, expected] of [[400, 'GEMINI_UPSTREAM_ERROR'], [403, 'GEMINI_ACCESS_DENIED'], [404, 'GEMINI_MODEL_UNAVAILABLE'], [429, 'GEMINI_RATE_LIMIT'], [500, 'GEMINI_UPSTREAM_ERROR']]) {
    await withProvider(async () => new Response('secret-image-provider-detail', {status}), async () => {
      await assert.rejects(() => __test.analizarCajaGemini(IMAGE), error => {
        assert.equal(error.message, expected);
        assert.equal(error.payload, undefined);
        return true;
      });
    });
  }
  await withProvider(async () => { throw new Error('secret-provider-detail'); }, async () => {
    await assert.rejects(() => __test.analizarCajaGemini(IMAGE), /GEMINI_UPSTREAM_ERROR/);
  });
});

test('Gemini bounds malformed and excessive upstream responses', async () => {
  for (const body of ['not-json', 'X'.repeat(256 * 1024 + 1)]) {
    await withProvider(async () => new Response(body), async () => {
      await assert.rejects(() => __test.analizarCajaGemini(IMAGE), /GEMINI_INVALID_RESPONSE/);
    });
  }
});

test('Gemini recognizes invalid/expired keys reported as HTTP 400 without leaking details', async () => {
  for (const reason of ['API_KEY_INVALID', 'API_KEY_EXPIRED']) {
    await withProvider(async () => new Response(JSON.stringify({error: {
      message: 'do not expose credentials', details: [{reason, metadata: {secret: 'private'}}],
    }}), {status: 400}), async () => {
      await assert.rejects(() => __test.analizarCajaGemini(IMAGE), error => {
        assert.equal(error.message, 'GEMINI_KEY_INVALID');
        assert.equal(error.status, 503);
        assert.equal(error.payload, undefined);
        return true;
      });
    });
  }
});

test('Gemini timeout also covers reading a stalled response body', async () => {
  await withProvider(async (_url, {signal}) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), {once: true});
    },
  })), async () => {
    await assert.rejects(() => __test.analizarCajaGemini(IMAGE), error => error.message === 'UPSTREAM_TIMEOUT' && error.status === 504);
  }, {GEMINI_TIMEOUT_MS: '10'});
});

test('Gemini endpoint requires Firebase authentication, POST and disables caching', async () => {
  await withProvider(() => assert.fail('unauthenticated request reached provider'), async () => {
    const response = await handler({httpMethod: 'POST', headers: {}, body: JSON.stringify(IMAGE)});
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(JSON.parse(response.body).error, 'No autorizado');
    assert.equal((await handler({httpMethod: 'GET', headers: {}})).statusCode, 405);
    assert.equal((await handler({httpMethod: 'OPTIONS', headers: {}})).statusCode, 204);
  });
});

test('browser compresses a copy as JPEG under the server limit without changing the source', () => {
  const source = {width: 4800, height: 3200};
  const copy = fakeCanvas();
  assert.deepEqual(prepareGeminiBoxImage(source, () => copy), IMAGE);
  assert.equal(copy.width, 2400);
  assert.equal(copy.height, 1600);
  assert.deepEqual(source, {width: 4800, height: 3200});
  assert.throws(() => prepareGeminiBoxImage({width: 0, height: 0}), /IMAGEN_LOCAL_INVALIDA/);
});

test('browser lowers quality and dimensions for large images and rejects oversized output', () => {
  const source = {width: 2400, height: 1200};
  const large = 'data:image/jpeg;base64,' + 'A'.repeat(__test.MAX_IMAGE_BYTES * 4 / 3 + 4);
  const copy = fakeCanvas(large);
  let calls = 0;
  copy.toDataURL = () => ++calls <= 3 ? large : `data:image/jpeg;base64,${JPEG}`;
  assert.deepEqual(prepareGeminiBoxImage(source, () => copy), IMAGE);
  assert.equal(copy.width, 1800);
  assert.throws(() => prepareGeminiBoxImage(source, () => fakeCanvas(large)), /IMAGEN_MUY_GRANDE/);
  assert.throws(() => prepareGeminiBoxImage(source, () => fakeCanvas('data:image/png;base64,abc=')), /IMAGEN_LOCAL_INVALIDA/);
});

test('browser requests only image extraction and returns review data without saving training', async () => {
  const expected = __test.normalizeBoxData(BOX);
  let count = 0;
  const result = await scanBoxWithGemini({width: 100, height: 100}, {
    createCanvas: fakeCanvas,
    request: async (payload, options) => {
      count += 1;
      assert.deepEqual(payload, IMAGE);
      assert.equal(options.signal instanceof AbortSignal, true);
      return expected;
    },
  });
  assert.deepEqual(result, expected);
  assert.equal(count, 1);
});

test('browser has a deadline and aborts pending requests on unmount', async () => {
  let requestSignal;
  const options = {
    createCanvas: fakeCanvas,
    timeoutMs: 10,
    request: (_payload, {signal}) => { requestSignal = signal; return new Promise(() => {}); },
  };
  await assert.rejects(() => scanBoxWithGemini({width: 1, height: 1}, options), /UPSTREAM_TIMEOUT/);
  assert.equal(requestSignal.aborted, true);
  const controller = new AbortController();
  const pending = scanBoxWithGemini({width: 1, height: 1}, {...options, signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(requestSignal.aborted, true);
  await assert.rejects(() => scanBoxWithGemini({width: 1, height: 1}, {...options, signal: controller.signal}), error => error.name === 'AbortError');
});

test('active scanner bypasses local OCR and all learning read/write controls', () => {
  const component = readFileSync(new URL('../../src/features/registros/EscanerCaja.jsx', import.meta.url), 'utf8');
  assert.match(component, /scanBoxWithGemini/);
  assert.match(component, /Aprendizaje local pausado/);
  assert.match(component, /enviaras esta foto/);
  assert.doesNotMatch(component, /localBoxScanner|boxLearningStore|saveBoxCorrection|getAutomaticBoxVerifierModels|clearBoxCorrections/);
  for (const path of ['../../scripts/local-api.mjs', '../../netlify.toml']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /\/api\/analizarCajaGemini/);
  }
});
