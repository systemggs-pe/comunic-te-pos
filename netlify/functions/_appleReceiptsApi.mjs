import {
  getImeisComprobanteApple,
  luhnImeiApple,
  normalizarImeiApple,
  serializeComprobanteAppleData,
} from './_comprobanteApple.mjs';
import {APPLE_RECEIPT_MESSAGES, validateAppleReceipt} from '../../src/features/registros/appleReceiptValidation.js';

import {receiptFingerprint} from './_receiptFingerprint.mjs';

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
    if (!text.trim()) throw serviceError('APPLE_RECEIPTS_EMPTY_RESPONSE');
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
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) throw serviceError('APPLE_RECEIPTS_EMPTY_RESPONSE');
  try {
    return JSON.parse(text);
  } catch {
    throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
  }
}

function receiptCandidates(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
  if (payload.error || payload.success === false) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
  if (payload.found === false) {
    if (payload.boleta || payload.boletas?.length || payload.data?.boleta || payload.data?.boletas?.length) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
    return [];
  }
  if (Array.isArray(payload.boletas)) return payload.boletas;
  if (payload.boleta && typeof payload.boleta === 'object') return [payload.boleta];
  if (Array.isArray(payload.data?.boletas)) return payload.data.boletas;
  if (payload.data?.boleta && typeof payload.data.boleta === 'object') return [payload.data.boleta];
  if (payload.id) return [payload];
  throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
}

export function normalizeRemoteComprobanteApple(payload, expectedImei) {
  const imei = normalizarImeiApple(expectedImei);
  if (!imei || !luhnImeiApple(imei)) throw serviceError('IMEI_INVALIDO', 400);
  const candidates = receiptCandidates(payload);
  if (candidates.length > 50) throw serviceError('APPLE_RECEIPTS_INVALID_RESPONSE');
  if (!candidates.length) {
    if (payload.found === true) throw serviceError('APPLE_RECEIPTS_INCOMPLETE', 409);
    return null;
  }
  const matching = candidates.filter(candidate => getImeisComprobanteApple(candidate || {}).includes(imei));
  if (!matching.length) throw serviceError('APPLE_RECEIPTS_MISMATCH', 409);
  if (matching.length !== 1) throw serviceError('APPLE_RECEIPTS_CONFLICT', 409);
  const validation = validateAppleReceipt(matching[0], imei);
  if (!validation.valid) throw serviceError(validation.code, 409);
  const currentFingerprint = receiptFingerprint(matching[0]);
  if (matching[0].receiptFingerprint !== currentFingerprint) throw serviceError('APPLE_RECEIPTS_CHANGED', 409);
  const receipt = serializeComprobanteAppleData(matching[0], matching[0].id);
  receipt.receiptFingerprint = currentFingerprint;
  const sanitizedValidation = validateAppleReceipt(receipt, imei);
  if (!sanitizedValidation.valid) throw serviceError(sanitizedValidation.code, 409);
  return receipt;
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
  const startedAt = Date.now();
  let upstreamStatus;

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
    upstreamStatus = response.status;

    if (response.status === 404) {
      const missing = await readBoundedJson(response);
      if (receiptCandidates(missing).length || !(missing.found === false || Array.isArray(missing.boletas) || Array.isArray(missing.data?.boletas))) throw serviceError('APPLE_RECEIPTS_UPSTREAM_ERROR');
      console.info(JSON.stringify({event: 'apple.receipt.lookup', endpoint: 'comprobanteApple', httpStatus: 404, durationMs: Date.now() - startedAt, attempt: 1, result: 'not_found'}));
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel?.();
      if ([401, 403].includes(response.status)) throw serviceError('APPLE_RECEIPTS_ACCESS_DENIED', 503);
      if (response.status === 400) throw serviceError('APPLE_RECEIPTS_BAD_REQUEST', 400);
      if (response.status === 409) throw serviceError('APPLE_RECEIPTS_CONFLICT', 409);
      if (response.status === 429) throw serviceError('APPLE_RECEIPTS_RATE_LIMIT', 429);
      throw serviceError('APPLE_RECEIPTS_UPSTREAM_ERROR');
    }

    const payload = await readBoundedJson(response);
    const receipt = normalizeRemoteComprobanteApple(payload, imei);
    console.info(JSON.stringify({event: 'apple.receipt.lookup', endpoint: 'comprobanteApple', httpStatus: response.status, durationMs: Date.now() - startedAt, attempt: 1, result: receipt ? 'valid' : 'not_found'}));
    return receipt;
  } catch (error) {
    const safe = controller.signal.aborted ? serviceError('APPLE_RECEIPTS_TIMEOUT', 504)
      : Object.hasOwn(APPLE_RECEIPT_MESSAGES, error?.message) ? serviceError(error.message, error.status || 502)
        : serviceError('APPLE_RECEIPTS_NETWORK_ERROR', 503);
    console.warn(JSON.stringify({event: 'apple.receipt.error', endpoint: 'comprobanteApple', code: safe.message, httpStatus: upstreamStatus || safe.status, durationMs: Date.now() - startedAt, attempt: 1, result: 'rejected'}));
    throw safe;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyRemoteComprobanteApple(rawId, rawImei, options = {}) {
  const expectedId = String(rawId || '').trim();
  if (options.discoverReceipt) return findRemoteComprobanteAppleByImei(rawImei, options);
  if (!expectedId) return null;
  if (expectedId.length > 180 || expectedId.includes('/')) throw serviceError('APPLE_RECEIPTS_INVALID_RECEIPT', 409);
  const boleta = await findRemoteComprobanteAppleByImei(rawImei, options);
  return boleta?.id === expectedId ? boleta : null;
}

export const __test = {MAX_RESPONSE_BYTES, readBoundedJson, receiptCandidates};
