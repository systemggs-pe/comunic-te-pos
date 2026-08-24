import test from 'node:test';
import assert from 'node:assert/strict';
import {getRetentionConfig, purgeRetention, retentionCutoffIso} from '../functions/_retention.mjs';
import {config as scheduledConfig} from '../functions/retentionScheduled.mjs';

test('retention config applies safe defaults and caps', () => {
  const config = getRetentionConfig({dniFotosDays: 0, batchSize: 9999});
  assert.equal(config.dniFotosDays, 90);
  assert.equal(config.batchSize, 100);
});

test('retention cutoff is deterministic', () => {
  const now = Date.parse('2026-08-08T00:00:00.000Z');
  assert.equal(retentionCutoffIso(1, now), '2026-08-07T00:00:00.000Z');
});

test('retention deletes expired DNI history and every Firestore image chunk', async () => {
  const nowMs = Date.parse('2026-08-24T12:00:00.000Z');
  const deleted = [];
  let committed = 0;
  const chunkRefs = [{path: 'history/old/imageChunks/1'}, {path: 'history/old/imageChunks/2'}];
  const parentRef = {
    path: 'history/old',
    collection(name) {
      assert.equal(name, 'imageChunks');
      return {
        select() {
          return this;
        },
        get: async () => ({docs: chunkRefs.map(ref => ({ref}))}),
      };
    },
  };
  const historyQuery = {
    where(field, operator, value) {
      assert.deepEqual([field, operator], ['createdAtIso', '<']);
      assert.equal(value, '2026-05-26T12:00:00.000Z');
      return this;
    },
    limit(value) {
      assert.equal(value, 10);
      return this;
    },
    get: async () => ({docs: [{ref: parentRef}], size: 1}),
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
    batch: () => ({
      delete: ref => deleted.push(ref.path),
      commit: async () => {
        committed += 1;
      },
    }),
  };

  const result = await purgeRetention(db, {dniFotosDays: 90, batchSize: 10, nowMs});
  assert.deepEqual(deleted, [...chunkRefs.map(ref => ref.path), parentRef.path]);
  assert.equal(committed, 1);
  assert.equal(result.purgedDniFotos, 1);
  assert.equal(result.purgedImageChunks, 2);
  assert.equal(result.hasMore, false);
});

test('retention is scheduled daily at 03:00 America/Lima', () => {
  assert.equal(scheduledConfig.schedule, '0 8 * * *');
});
