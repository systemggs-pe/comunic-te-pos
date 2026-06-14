import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRateLimitKey,
  enforcePersistentRateLimit,
  getRateLimitWindow,
} from '../functions/_rateLimit.mjs';

function createFakeDb() {
  const collections = new Map();
  return {
    collections,
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      const store = collections.get(name);
      return {
        doc(id) {
          return {id, path: `${name}/${id}`, store};
        },
      };
    },
    runTransaction(callback) {
      const transaction = {
        async get(ref) {
          const data = ref.store.get(ref.id);
          return {
            exists: Boolean(data),
            data: () => data,
          };
        },
        set(ref, data, options = {}) {
          const previous = ref.store.get(ref.id) || {};
          ref.store.set(ref.id, options.merge ? {...previous, ...data} : data);
        },
      };
      return callback(transaction);
    },
  };
}

test('getRateLimitWindow calculates bucket and reset', () => {
  const window = getRateLimitWindow(1_700_000_000_500, 1000);
  assert.equal(window.bucket, 1_700_000_000);
  assert.equal(window.resetSeconds, 1);
  assert.equal(window.windowMs, 1000);
});

test('createRateLimitKey includes endpoint, uid, ip and bucket', () => {
  const base = createRateLimitKey({name: 'reniec', uid: 'uid-1', ipAddress: '10.0.0.1', bucket: 1});
  const otherIp = createRateLimitKey({name: 'reniec', uid: 'uid-1', ipAddress: '10.0.0.2', bucket: 1});
  const otherEndpoint = createRateLimitKey({name: 'gemini', uid: 'uid-1', ipAddress: '10.0.0.1', bucket: 1});

  assert.equal(base.length, 64);
  assert.notEqual(base, otherIp);
  assert.notEqual(base, otherEndpoint);
});

test('enforcePersistentRateLimit persists and blocks over limit', async () => {
  const db = createFakeDb();
  const user = {uid: 'uid-1'};
  const context = {ipAddress: '10.0.0.1', requestId: 'req-1'};
  const rateLimit = {name: 'reniec', max: 2, windowMs: 1000};

  const first = await enforcePersistentRateLimit(user, context, rateLimit, {db, nowMs: 1_700_000_000_100});
  const second = await enforcePersistentRateLimit(user, context, rateLimit, {db, nowMs: 1_700_000_000_200});

  assert.equal(first['X-RateLimit-Limit'], '2');
  assert.equal(first['X-RateLimit-Remaining'], '1');
  assert.equal(second['X-RateLimit-Remaining'], '0');

  await assert.rejects(
    () => enforcePersistentRateLimit(user, context, rateLimit, {db, nowMs: 1_700_000_000_300}),
    error => {
      assert.equal(error.status, 429);
      assert.equal(error.responseHeaders['X-RateLimit-Remaining'], '0');
      return true;
    },
  );

  const docs = [...db.collections.get('_rateLimits').values()];
  assert.equal(docs.length, 1);
  assert.equal(docs[0].count, 2);
  assert.equal(docs[0].endpoint, 'reniec');
  assert.equal(docs[0].uidHash.length, 64);
  assert.equal(docs[0].ipHash.length, 64);
  assert.ok(docs[0].expiresAt instanceof Date);
});

test('enforcePersistentRateLimit separates buckets by ip and time window', async () => {
  const db = createFakeDb();
  const user = {uid: 'uid-1'};
  const rateLimit = {name: 'gemini', max: 1, windowMs: 1000};

  await enforcePersistentRateLimit(user, {ipAddress: '10.0.0.1'}, rateLimit, {db, nowMs: 1_700_000_000_100});
  await enforcePersistentRateLimit(user, {ipAddress: '10.0.0.2'}, rateLimit, {db, nowMs: 1_700_000_000_100});
  await enforcePersistentRateLimit(user, {ipAddress: '10.0.0.1'}, rateLimit, {db, nowMs: 1_700_000_001_100});

  assert.equal(db.collections.get('_rateLimits').size, 3);
});
