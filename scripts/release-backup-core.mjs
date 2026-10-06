import {Timestamp, GeoPoint, DocumentReference} from 'firebase-admin/firestore';

// Typed encoding preserves int64, timestamps, bytes, references, NaN and maps;
// tag every value so a customer's own field names cannot collide with tags.
export function encodeFirestore(value) {
  if (value === null) return {t: 'null'};
  if (typeof value === 'string' || typeof value === 'boolean') return {t: typeof value, v: value};
  if (typeof value === 'number') return {t: 'number', v: Object.is(value, -0) ? '-0' : String(value)};
  if (typeof value === 'bigint') return {t: 'integer', v: String(value)};
  if (value instanceof Timestamp) return {t: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds};
  if (value instanceof GeoPoint) return {t: 'geopoint', latitude: value.latitude, longitude: value.longitude};
  if (value instanceof DocumentReference) return {t: 'reference', project: value.firestore.projectId, path: value.path};
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return {t: 'bytes', v: Buffer.from(value).toString('base64')};
  if (Array.isArray(value)) return {t: 'array', v: value.map(encodeFirestore)};
  if (value && Object.getPrototypeOf(value) === Object.prototype) return {t: 'map', v: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeFirestore(item)]))};
  throw new Error('BACKUP_UNSUPPORTED_TYPE');
}

export function decodeFirestore(value, db) {
  switch (value.t) {
    case 'null': return null;
    case 'string': case 'boolean': return value.v;
    case 'number': return Number(value.v);
    case 'integer': return BigInt(value.v);
    case 'timestamp': return new Timestamp(value.seconds, value.nanoseconds);
    case 'geopoint': return new GeoPoint(value.latitude, value.longitude);
    case 'bytes': return Buffer.from(value.v, 'base64');
    case 'reference':
      if (db?.projectId !== value.project) throw new Error('BACKUP_REFERENCE_PROJECT_MISMATCH');
      return db.doc(value.path);
    case 'array': return value.v.map(item => decodeFirestore(item, db));
    case 'map': return Object.fromEntries(Object.entries(value.v).map(([key, item]) => [key, decodeFirestore(item, db)]));
    default: throw new Error('BACKUP_UNSUPPORTED_TYPE');
  }
}

export async function exportFirestoreTree(db, pageSize = 500, onProgress = () => {}) {
  // Bound concurrent metadata reads without serializing every document's RPC.
  let active = 0;
  const waiting = [];
  const metadata = async operation => {
    if (active >= 8) await new Promise(resolve => waiting.push(resolve));
    else active += 1;
    try {return await operation();}
    finally {if (waiting.length) waiting.shift()(); else active -= 1;}
  };
  const entries = [];
  const collections = [];
  const visited = new Set();
  const scan = async collection => {
    if (visited.has(collection.path)) throw new Error('BACKUP_DUPLICATE_COLLECTION');
    visited.add(collection.path);
    const expected = Number((await collection.count().get()).data().count);
    if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('BACKUP_INVALID_COUNT');
    const seen = new Set(); let cursor; let pages = 0;
    for (;;) {
      let query = collection.orderBy('__name__').limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get(); pages += 1;
      for (const doc of page.docs) {
        if (seen.has(doc.id)) throw new Error('BACKUP_DUPLICATE_DOCUMENT');
        seen.add(doc.id);
        entries.push({path: doc.ref.path, data: encodeFirestore(doc.data())});
      }
      if (seen.size > expected) throw new Error('BACKUP_DATA_CHANGED');
      if (page.size < pageSize) break;
      cursor = page.docs.at(-1);
    }
    if (seen.size !== expected) throw new Error('BACKUP_COUNT_MISMATCH');
    collections.push({path: collection.path, expected, exported: seen.size, pages});
    onProgress({phase: 'export', collections: collections.length, documents: entries.length});
    // showMissing=true in SDK listDocuments discovers children even if parent
    // documents do not exist (artifacts/.../users/shared often has this shape).
    await Promise.all((await metadata(() => collection.listDocuments())).map(async ref => {
      const children = await metadata(() => ref.listCollections());
      await Promise.all(children.map(scan));
    }));
  };
  const roots = await db.listCollections();
  await Promise.all(roots.map(scan));
  for (const item of collections) {
    item.final = Number((await db.collection(item.path).count().get()).data().count);
    if (item.final !== item.expected) throw new Error('BACKUP_DATA_CHANGED');
  }
  // Rediscover topology: equal counts alone do not detect a newly added child.
  const rediscovered = new Set();
  onProgress({phase: 'topology-verification', collections: collections.length, documents: entries.length});
  const discover = async collection => {
    rediscovered.add(collection.path);
    await Promise.all((await metadata(() => collection.listDocuments())).map(async ref => {
      const children = await metadata(() => ref.listCollections());
      await Promise.all(children.map(discover));
    }));
  };
  for (const root of await db.listCollections()) await discover(root);
  if (rediscovered.size !== visited.size || [...visited].some(path => !rediscovered.has(path))) throw new Error('BACKUP_TOPOLOGY_CHANGED');
  return {entries, collections};
}
