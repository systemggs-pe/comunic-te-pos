import {
  getImeisComprobanteApple,
  luhnImeiApple,
  normalizarImeiApple,
  serializeComprobanteAppleData,
} from './_comprobanteApple.mjs';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 20_000;

function serviceError(code, status = 502) {
  return Object.assign(new Error(code), {status});
}

export function getAppleReceiptsApiConfig(env = process.env) {
  const apiUrl = String(env.APPLE_RECEIPTS_API_URL || '').trim();
  const apiKey = String(env.APPLE_RECEIPTS_API_KEY || '').trim();
  if (!apiUrl || !apiKey) throw serviceError('APPLE_RECEIPTS_NOT_CONFIGURED', 503);
  if (apiKey.length > 500) throw serviceError('APPLE_RECEIPTS_NOT_CONFIGURED', 503);

  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw serviceError('APPLE_RECEIPTS_NOT_CONFIGURED', 503);
  }
  const localHttp = parsedUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedUrl.hostname);
  if ((parsedUrl.protocol !== 'https:' && !localHttp) || parsedUrl.username || parsedUrl.password || parsedUrl.hash) {
    throw serviceError('APPLE_RECEIPTS_NOT_CONFIGURED', 503);
  }

  const configuredTimeout = Number(env.APPLE_RECEIPTS_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  return {apiUrl: parsedUrl.href, apiKey, timeoutMs};
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
    try {
      return JSON.parse(text);
    } catch {
      throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
    }
  }

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
  }
}

function receiptCandidates(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  if (payload.found === false) return [];
  if (Array.isArray(payload.boletas)) return payload.boletas;
  if (payload.boleta && typeof payload.boleta === 'object') return [payload.boleta];
  if (Array.isArray(payload.data?.boletas)) return payload.data.boletas;
  if (payload.data?.boleta && typeof payload.data.boleta === 'object') return [payload.data.boleta];
  return payload.id ? [payload] : [];
}

export function normalizeRemoteComprobanteApple(payload, expectedImei) {
  const imei = normalizarImeiApple(expectedImei);
  if (!imei) return null;
  for (const candidate of receiptCandidates(payload).slice(0, 20)) {
    const boleta = serializeComprobanteAppleData(candidate, candidate?.id);
    if (!boleta.id) continue;
    if (getImeisComprobanteApple(boleta).includes(imei)) return boleta;
  }
  return null;
}

export async function findRemoteComprobanteAppleByImei(rawImei, options = {}) {
  const imei = normalizarImeiApple(rawImei);
  if (!imei || !luhnImeiApple(imei)) throw serviceError('IMEI_INVALIDO', 400);
  const {apiUrl, apiKey, timeoutMs} = getAppleReceiptsApiConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const authorization = /^Bearer\s+\S+$/i.test(String(options.authorization || ''))
    ? String(options.authorization)
    : '';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...(authorization ? {Authorization: authorization} : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'searchHistory',
        searchType: 'imei',
        query: imei,
        imei,
      }),
    });

    if (response.status === 404) {
      await response.body?.cancel?.();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel?.();
      if ([401, 403].includes(response.status)) throw serviceError('APPLE_RECEIPTS_ACCESS_DENIED', 503);
      if (response.status === 429) throw serviceError('APPLE_RECEIPTS_RATE_LIMIT', 429);
      throw serviceError('APPLE_RECEIPTS_UPSTREAM_ERROR');
    }

    const payload = await readBoundedJson(response);
    return normalizeRemoteComprobanteApple(payload, imei);
  } catch (error) {
    if (controller.signal.aborted) throw serviceError('UPSTREAM_TIMEOUT', 504);
    if (error?.message?.startsWith('APPLE_RECEIPTS_') || error?.message === 'IMEI_INVALIDO') throw error;
    throw serviceError('APPLE_RECEIPTS_UPSTREAM_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyRemoteComprobanteApple(rawId, rawImei, options = {}) {
  const expectedId = String(rawId || '').trim().slice(0, 180);
  if (!expectedId || expectedId.includes('/')) return null;
  const boleta = await findRemoteComprobanteAppleByImei(rawImei, options);
  return boleta?.id === expectedId ? boleta : null;
}

export const __test = {MAX_RESPONSE_BYTES, readBoundedJson, receiptCandidates};
