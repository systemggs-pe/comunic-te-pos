import {createHmac, randomUUID} from 'node:crypto';
import {handlePost, valueOrEmpty} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {parseDniPayload} from './_validators.mjs';
import {assertRole} from './_roles.mjs';

export const DNI_PHOTO_TYPES = {
  azul: {
    label: 'DNI azul',
    url: 'https://api-codart.cgrt.org/api/v1/consultas/fd/dniv',
  },
  electronico: {
    label: 'DNI electronico',
    url: 'https://api-codart.cgrt.org/api/v1/consultas/fd/dnivel',
  },
};

const DEFAULT_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DEFAULT_SUCCESS_CACHE_MS = 10 * 60 * 1000;
const DEFAULT_PHOTO_TIMEOUT_MS = 55 * 1000;
const ACTIVE_REQUEST_LEASE_MS = DEFAULT_PHOTO_TIMEOUT_MS + 15 * 1000;
const IMAGE_DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;
const BASE64_IMAGE_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const dniPhotoRequestCache = new Map();

function getCodartToken() {
  const token = process.env.CODART_TOKEN || process.env.RENIEC_TOKEN;
  if (!token) throw Object.assign(new Error('CODART_TOKEN_MISSING'), {status: 500});
  return token;
}

export function parseDniPhotoPayload(body) {
  const {dni} = parseDniPayload(body);
  const tipo = String(body?.tipo || 'azul').trim().toLowerCase();
  if (!/^\d{8}$/.test(dni)) {
    throw Object.assign(new Error('DNI_INVALIDO'), {status: 400});
  }
  if (!DNI_PHOTO_TYPES[tipo]) {
    throw Object.assign(new Error('DNI_FOTO_TIPO_INVALIDO'), {status: 400});
  }
  return {dni, tipo, ...(body?.refresh === true ? {refresh: true} : {})};
}

function parseImageDataUri(dataUri) {
  const text = String(dataUri || '').replace(/\s/g, '');
  const match = text.match(IMAGE_DATA_URI_RE);
  let mime = match?.[1]?.toLowerCase() || '';
  let base64 = match?.[2] || '';
  if (!match && BASE64_IMAGE_RE.test(text)) {
    const buffer = Buffer.from(text, 'base64');
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) mime = 'image/jpeg';
    else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mime = 'image/png';
    else if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
    if (mime) base64 = text;
  }
  if (!mime || !base64) return null;
  const size = Buffer.from(base64, 'base64').length;
  const maxBytes = Number(process.env.CODART_MAX_IMAGE_BYTES || DEFAULT_MAX_IMAGE_BYTES);
  if (!size || size > maxBytes) return null;
  return {
    mime,
    dataUri: `data:${mime};base64,${base64}`,
  };
}

function normalizeImage(image, index) {
  const candidates = typeof image === 'string'
    ? [image]
    : [
      image?.data_uri,
      image?.dataUri,
      image?.base64,
      image?.image,
      image?.imagen,
      image?.foto,
      image?.url,
    ];
  const parsed = candidates.map(parseImageDataUri).find(Boolean);
  if (!parsed) return null;
  return {
    side: index === 0 ? 'front' : index === 1 ? 'back' : `image_${index + 1}`,
    mime: parsed.mime,
    dataUri: parsed.dataUri,
  };
}

export function normalizeDniPhotosResponse(data, dni, tipo = 'azul') {
  const result = data?.data || data?.result || data || {};
  const rawImages = Array.isArray(result.images)
    ? result.images
    : [
      result.front,
      result.back,
      result.anverso,
      result.reverso,
      result.foto_anverso,
      result.foto_reverso,
      result.fotoAnverso,
      result.fotoReverso,
      result.foto,
      result.imagen,
      result.image,
      result.base64,
    ].filter(Boolean);
  const images = rawImages
    .map(normalizeImage)
    .filter(Boolean)
    .slice(0, 2);

  return {
    success: Boolean((data?.success ?? true) && images.length),
    source: String(data?.source || 'CODART_X_API_V1').slice(0, 80),
    data: {
      tipo,
      tipoLabel: DNI_PHOTO_TYPES[tipo]?.label || 'DNI',
      images,
      dni: valueOrEmpty(result.dni || dni),
      nombres: valueOrEmpty(result.nombres),
      apellidos: valueOrEmpty(result.apellidos),
      genero: valueOrEmpty(result.genero),
      edad: valueOrEmpty(result.edad),
    },
  };
}

function cloneResponse(result) {
  return JSON.parse(JSON.stringify(result));
}

function dniPhotoCacheKey(dni, tipo) {
  return `${tipo}:${dni}`;
}

function pruneDniPhotoCache(nowMs = Date.now()) {
  for (const [key, entry] of dniPhotoRequestCache.entries()) {
    if (!entry.promise && entry.expiresAt <= nowMs) dniPhotoRequestCache.delete(key);
  }
  // Bound retained image memory without evicting in-flight requests.
  let bytes = 0;
  for (const [key, entry] of [...dniPhotoRequestCache.entries()].reverse()) {
    bytes += entry.result ? JSON.stringify(entry.result).length * 2 : 0;
    if (!entry.promise && (bytes > 48 * 1024 * 1024 || dniPhotoRequestCache.size > 100)) {
      dniPhotoRequestCache.delete(key);
    }
  }
}

async function fetchDniFotosFromProvider(dni, tipo) {
  const config = DNI_PHOTO_TYPES[tipo];
  const controller = new AbortController();
  const configuredTimeout = Number(process.env.CODART_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, DEFAULT_PHOTO_TIMEOUT_MS) : DEFAULT_PHOTO_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.url}/${dni}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getCodartToken()}`,
      },
    });
    if (!response.ok) {
      const errorCode = response.status === 402
        ? 'CODART_CREDITOS_INSUFICIENTES'
        : [401, 403].includes(response.status)
          ? 'CODART_TOKEN_INVALID'
          : response.status === 429
            ? 'CODART_RATE_LIMIT'
            : 'DNI_FOTOS_UPSTREAM_ERROR';
      throw Object.assign(new Error(errorCode), {
        status: response.status === 429 ? 429 : 502,
        payload: {upstreamStatus: response.status},
      });
    }

    // Keep the deadline active until the complete image payload has arrived.
    const data = await response.json();
    const result = normalizeDniPhotosResponse(data, dni, tipo);
    if (!result.success) throw Object.assign(new Error('DNI_FOTOS_INVALID_RESPONSE'), {status: 502});
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('DNI_FOTOS_TIMEOUT'), {status: 504});
    }
    if (error instanceof SyntaxError) {
      throw Object.assign(new Error('DNI_FOTOS_INVALID_RESPONSE'), {status: 502});
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Coordinate only active requests across tabs/instances. Completed attempts do
// not block a new manual consultation. Store no document images or raw DNI.
async function claimDniPhotoRequest(dni, tipo, {db = getAdminDb(), nowMs = Date.now()} = {}) {
  const key = createHmac('sha256', getCodartToken()).update(dniPhotoCacheKey(dni, tipo)).digest('hex');
  // The old charge-guard documents must not block deliberate consultations.
  const ref = db.collection('_rateLimits').doc(`dni-photo-active-${key}`);
  const requestId = randomUUID();
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const until = snap.exists ? Number(snap.data()?.activeUntilMs || 0) : 0;
    if (until > nowMs) {
      throw Object.assign(new Error('DNI_FOTOS_IN_PROGRESS'), {status: 409});
    }
    transaction.set(ref, {
      endpoint: 'dniFotos-active-request',
      requestId,
      activeUntilMs: nowMs + ACTIVE_REQUEST_LEASE_MS,
      expiresAt: new Date(nowMs + ACTIVE_REQUEST_LEASE_MS),
    });
  });
  return () => db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    // A delayed cleanup must never release a newer request's lease.
    if (snap.exists && snap.data()?.requestId === requestId) transaction.delete(ref);
  });
}

async function fetchDniFotos(dni, tipo, {refresh = false, claim = claimDniPhotoRequest} = {}) {
  const key = dniPhotoCacheKey(dni, tipo);
  const nowMs = Date.now();
  pruneDniPhotoCache(nowMs);
  const cached = dniPhotoRequestCache.get(key);
  if (cached?.promise) return cloneResponse(await cached.promise);
  if (!refresh && cached?.result && cached.expiresAt > nowMs) return cloneResponse(cached.result);

  const promise = (async () => {
    getCodartToken();
    const release = await claim(dni, tipo);
    try {
      return await fetchDniFotosFromProvider(dni, tipo);
    } finally {
      // Preserve a paid response even if lease cleanup is temporarily unavailable.
      try {
        await release();
      } catch {
        console.warn('DNI_FOTOS_LEASE_RELEASE_FAILED');
      }
    }
  })();
  dniPhotoRequestCache.set(key, {promise, expiresAt: nowMs + ACTIVE_REQUEST_LEASE_MS});
  try {
    const result = await promise;
    dniPhotoRequestCache.set(key, {
      result: cloneResponse(result),
      expiresAt: Date.now() + DEFAULT_SUCCESS_CACHE_MS,
    });
    pruneDniPhotoCache();
    return result;
  } catch (error) {
    dniPhotoRequestCache.delete(key);
    throw error;
  }
}

async function dispatchDniFotos(body) {
  const {dni, tipo, refresh} = parseDniPhotoPayload(body);
  return fetchDniFotos(dni, tipo, {refresh});
}

export const handler = async event => {
  const response = await handlePost(event, (body, user) => {
    assertRole(user, 'admin');
    return dispatchDniFotos(body);
  }, {
    rateLimit: {name: 'dniFotos', max: 10, windowMs: 60 * 1000, distributed: true},
  });
  return {
    ...response,
    headers: {...response.headers, 'Cache-Control': 'no-store'},
  };
};

export const __test = {
  clearDniPhotoCache: () => dniPhotoRequestCache.clear(),
  dispatchDniFotos,
  fetchDniFotos,
  fetchDniFotosFromProvider,
  claimDniPhotoRequest,
  DEFAULT_PHOTO_TIMEOUT_MS,
  ACTIVE_REQUEST_LEASE_MS,
};
