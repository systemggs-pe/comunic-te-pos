import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAndSetImeiLocks,
  normalizeImeiList,
  releaseImeiLocks,
} from './_imeiLocks.mjs';

function createStore(initialDocs = {}) {
  return {
    docs: new Map(Object.entries(initialDocs).map(([path, data]) => [
      path,
      {data: {...data}, version: 1},
    ])),
  };
}

function createLocksRef() {
  return {
    doc(id) {
      return {id, path: `imeiLocks/${id}`};
    },
  };
}

function createTransaction(store) {
  const readVersions = new Map();
  const writes = [];

  return {
    transaction: {
      async get(ref) {
        const entry = store.docs.get(ref.path);
        readVersions.set(ref.path, entry?.version || 0);
        return {
          exists: Boolean(entry),
          data: () => (entry ? {...entry.data} : undefined),
        };
      },
      set(ref, data, options = {}) {
        writes.push({ref, data, merge: Boolean(options.merge)});
      },
    },
    commit() {
      writes.forEach(write => {
        const currentVersion = store.docs.get(write.ref.path)?.version || 0;
        const readVersion = readVersions.get(write.ref.path) ?? currentVersion;
        if (currentVersion !== readVersion) {
          throw Object.assign(new Error('TRANSACTION_CONFLICT'), {code: 'aborted'});
        }
      });

      writes.forEach(write => {
        const current = store.docs.get(write.ref.path);
        const data = write.merge ? {...(current?.data || {}), ...write.data} : {...write.data};
        store.docs.set(write.ref.path, {
          data,
          version: (current?.version || 0) + 1,
        });
      });
    },
  };
}

function readLock(store, imei) {
  return store.docs.get(`imeiLocks/${imei}`)?.data || {};
}

test('normalizeImeiList removes empty and repeated values', () => {
  assert.deepEqual(normalizeImeiList([' 123 ', '', '123', null, '456']), ['123', '456']);
});

test('sets and releases a registro IMEI lock', async () => {
  const store = createStore();
  const locksRef = createLocksRef();
  const createTx = createTransaction(store);

  await assertAndSetImeiLocks({
    transaction: createTx.transaction,
    locksRef,
    imeis: ['111'],
    kind: 'registro',
    ownerId: 'registro-1',
    now: '2026-05-26T00:00:00.000Z',
  });
  createTx.commit();

  assert.deepEqual(readLock(store, '111'), {
    imei: '111',
    registroId: 'registro-1',
    registrado: true,
    updatedAt: '2026-05-26T00:00:00.000Z',
  });

  const deleteTx = createTransaction(store);
  await releaseImeiLocks({
    transaction: deleteTx.transaction,
    locksRef,
    imeis: ['111'],
    kind: 'registro',
    ownerId: 'registro-1',
    now: '2026-05-26T00:01:00.000Z',
  });
  deleteTx.commit();

  assert.equal(readLock(store, '111').registroId, '');
  assert.equal(readLock(store, '111').registrado, false);
});

test('blocks a registro lock owned by another document', async () => {
  const store = createStore({
    'imeiLocks/222': {imei: '222', registroId: 'registro-1', registrado: true},
  });
  const tx = createTransaction(store);

  await assert.rejects(
    () => assertAndSetImeiLocks({
      transaction: tx.transaction,
      locksRef: createLocksRef(),
      imeis: ['222'],
      kind: 'registro',
      ownerId: 'registro-2',
    }),
    error => {
      assert.equal(error.status, 409);
      assert.equal(error.message, 'IMEI_YA_REGISTRADO');
      assert.equal(error.payload.imei, '222');
      return true;
    },
  );
});

test('allows registro and venta states on the same IMEI but blocks duplicate venta', async () => {
  const store = createStore({
    'imeiLocks/333': {imei: '333', registroId: 'registro-1', registrado: true},
  });
  const locksRef = createLocksRef();
  const saleTx = createTransaction(store);

  await assertAndSetImeiLocks({
    transaction: saleTx.transaction,
    locksRef,
    imeis: ['333'],
    kind: 'venta',
    ownerId: 'venta-1',
  });
  saleTx.commit();

  assert.equal(readLock(store, '333').registroId, 'registro-1');
  assert.equal(readLock(store, '333').ventaId, 'venta-1');

  const duplicateTx = createTransaction(store);
  await assert.rejects(
    () => assertAndSetImeiLocks({
      transaction: duplicateTx.transaction,
      locksRef,
      imeis: ['333'],
      kind: 'venta',
      ownerId: 'venta-2',
    }),
    error => {
      assert.equal(error.status, 409);
      assert.equal(error.message, 'IMEI_YA_VENDIDO');
      return true;
    },
  );
});

test('concurrent transactions cannot both claim the same IMEI', async () => {
  const store = createStore();
  const locksRef = createLocksRef();
  const firstTx = createTransaction(store);
  const secondTx = createTransaction(store);

  await assertAndSetImeiLocks({
    transaction: firstTx.transaction,
    locksRef,
    imeis: ['444'],
    kind: 'registro',
    ownerId: 'registro-1',
  });
  await assertAndSetImeiLocks({
    transaction: secondTx.transaction,
    locksRef,
    imeis: ['444'],
    kind: 'registro',
    ownerId: 'registro-2',
  });

  firstTx.commit();
  assert.throws(() => secondTx.commit(), /TRANSACTION_CONFLICT/);

  const retryTx = createTransaction(store);
  await assert.rejects(
    () => assertAndSetImeiLocks({
      transaction: retryTx.transaction,
      locksRef,
      imeis: ['444'],
      kind: 'registro',
      ownerId: 'registro-2',
    }),
    error => {
      assert.equal(error.status, 409);
      assert.equal(error.message, 'IMEI_YA_REGISTRADO');
      return true;
    },
  );
});
