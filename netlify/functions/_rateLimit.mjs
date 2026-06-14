import {createHash} from 'node:crypto';
import {getAdminDb} from './_firebaseAdmin.mjs';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_COLLECTION = '_rateLimits';

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeString(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength) || 'unknown';
}

export function getRateLimitWindow(nowMs, windowMs = DEFAULT_WINDOW_MS) {
  const safeWindowMs = positiveNumber(windowMs, DEFAULT_WINDOW_MS);
  const now = positiveNumber(nowMs, Date.now());
  const bucket = Math.floor(now / safeWindowMs);
  const resetAtMs = (bucket + 1) * safeWindowMs;
  return {
    bucket,
    bucketStartAt: new Date(bucket * safeWindowMs),
    resetAt: new Date(resetAtMs),
    resetSeconds: Math.max(Math.ceil((resetAtMs - now) / 1000), 1),
    windowMs: safeWindowMs,
  };
}

export function createRateLimitKey({name, uid, ipAddress, bucket}) {
  const rawKey = [
    safeString(name, 80),
    safeString(uid, 160),
    safeString(ipAddress, 80),
    safeString(bucket, 40),
  ].join(':');

  return createHash('sha256').update(rawKey).digest('hex');
}

function hashValue(value) {
  return createHash('sha256').update(safeString(value)).digest('hex');
}

function rateLimitHeaders(max, count, resetSeconds) {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(Math.max(max - count, 0)),
    'X-RateLimit-Reset': String(resetSeconds),
  };
}

export async function enforcePersistentRateLimit(user, context, rateLimit = {}, options = {}) {
  if (!rateLimit.name || !rateLimit.max) return {};

  const max = Math.floor(positiveNumber(rateLimit.max, 0));
  if (!max) return {};

  const nowMs = options.nowMs ?? Date.now();
  const window = getRateLimitWindow(nowMs, rateLimit.windowMs);
  const endpoint = safeString(rateLimit.name, 80);
  const uid = safeString(user?.uid, 160);
  const ipAddress = safeString(context?.ipAddress, 80);
  const collectionName = safeString(options.collectionName || process.env.RATE_LIMIT_COLLECTION || DEFAULT_COLLECTION, 80);
  const db = options.db || getAdminDb();
  const docId = createRateLimitKey({name: endpoint, uid, ipAddress, bucket: window.bucket});
  const docRef = db.collection(collectionName).doc(docId);

  return db.runTransaction(async transaction => {
    const snap = await transaction.get(docRef);
    const storedCount = Number(snap.exists ? snap.data()?.count || 0 : 0);
    const current = Number.isFinite(storedCount) && storedCount > 0 ? Math.floor(storedCount) : 0;
    const headers = rateLimitHeaders(max, current >= max ? current : current + 1, window.resetSeconds);

    if (current >= max) {
      throw Object.assign(new Error('Demasiadas solicitudes. Intenta de nuevo en unos segundos.'), {
        status: 429,
        responseHeaders: headers,
      });
    }

    transaction.set(docRef, {
      endpoint,
      count: current + 1,
      limit: max,
      windowMs: window.windowMs,
      bucket: window.bucket,
      bucketStartAt: window.bucketStartAt,
      expiresAt: window.resetAt,
      uidHash: hashValue(uid),
      ipHash: hashValue(ipAddress),
      requestId: safeString(context?.requestId, 120),
      updatedAt: new Date(nowMs),
    }, {merge: true});

    return headers;
  });
}
