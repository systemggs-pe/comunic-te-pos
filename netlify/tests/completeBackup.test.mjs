import assert from 'node:assert/strict';
import test from 'node:test';
import {BACKUP_COLLECTIONS, exportCompleteBackup} from '../../src/services/completeBackup.js';

function sourceFor(size = 1201) {
  const rows = Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, Array.from({length: size}, (_, index) => ({
    id: `${name}-${String(index).padStart(5, '0')}`,
    data: () => ({name: `fixture-${index}`}), // No fecha: must still be exported.
  }))]));
  return {
    rows,
    backupCount: async name => rows[name].length,
    backupPage: async (name, pageSize, cursor) => {
      const offset = cursor ? rows[name].findIndex(row => row.id === cursor.id) + 1 : 0;
      return {docs: rows[name].slice(offset, offset + pageSize)};
    },
  };
}

test('backup exports all four collections over multiple pages without React data or fecha', async () => {
  const progress = [];
  const result = await exportCompleteBackup(sourceFor(), event => progress.push(event));
  for (const name of BACKUP_COLLECTIONS) {
    assert.equal(result[name].length, 1201);
    assert.deepEqual(result.verification.counts[name], {expected: 1201, exported: 1201});
    assert.equal(result[name].at(-1).id, `${name}-01200`);
    assert.deepEqual(progress.filter(event => event.collection === name).map(event => event.exported), [0, 500, 1000, 1201]);
  }
  assert.equal(result.verification.complete, true);
});

test('backup supports empty collections and exact page-size boundaries', async () => {
  assert.equal((await exportCompleteBackup(sourceFor(0))).clientes.length, 0);
  assert.equal((await exportCompleteBackup(sourceFor(1000))).clientes.length, 1000);
});

test('backup rejects a partial page export instead of reporting success', async () => {
  const source = sourceFor(20);
  source.backupPage = async () => ({docs: []});
  await assert.rejects(() => exportCompleteBackup(source), /BACKUP_COUNT_MISMATCH/);
});

test('backup propagates collection errors, even after other collections succeed', async () => {
  const source = sourceFor(20);
  const original = source.backupPage;
  source.backupPage = async (...args) => {
    if (args[0] === 'registros') throw new Error('fixture-network-error');
    return original(...args);
  };
  await assert.rejects(() => exportCompleteBackup(source), /fixture-network-error/);
});

test('backup rejects duplicate cursors or overlapping pages', async () => {
  const source = sourceFor(4);
  source.backupPage = async () => ({docs: source.rows.clientes.slice(0, 2)});
  await assert.rejects(() => exportCompleteBackup(source, undefined, 2), /BACKUP_DUPLICATE_DOCUMENT/);
});

test('backup compares final counts and rejects concurrent collection changes', async () => {
  const source = sourceFor(20);
  let calls = 0;
  source.backupCount = async () => ++calls > 4 ? 21 : 20;
  await assert.rejects(() => exportCompleteBackup(source), /BACKUP_DATA_CHANGED/);
});

test('backup rejects invalid counts and preserves authoritative document IDs', async () => {
  const invalid = sourceFor(1);
  invalid.backupCount = async () => NaN;
  await assert.rejects(() => exportCompleteBackup(invalid), /BACKUP_COUNT_INVALID/);
  const source = sourceFor(1);
  source.rows.clientes[0].data = () => ({id: 'wrong', nombre: 'fixture'});
  assert.equal((await exportCompleteBackup(source)).clientes[0].id, 'clientes-00000');
});
