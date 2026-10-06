import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Timestamp, GeoPoint} from 'firebase-admin/firestore';
import {fileHash, inspectArtifact, inspectBackup, manualCheck, readiness} from '../../scripts/release-readiness.mjs';
import {encodeFirestore, decodeFirestore, exportFirestoreTree} from '../../scripts/release-backup-core.mjs';

test('manual pending yields CONDITIONAL, a technical failure NO, all verified YES', () => {
  assert.deepEqual(readiness([{status: 'PASS'}, {status: 'MANUAL REQUIRED'}]), {technical: 'PASS', manual: 'PENDING', ready: 'CONDITIONAL', exitCode: 2});
  assert.equal(readiness([{status: 'FAIL'}, {status: 'MANUAL REQUIRED'}]).ready, 'NO');
  assert.equal(readiness([{status: 'PASS'}]).ready, 'YES');
});
test('missing/stale manual evidence is pending; an explicitly failed manual test blocks release', () => {
  const now = Date.now(); const hashes = {package: 'package', rules: 'rules'};
  assert.equal(manualCheck({}, 'googleAuth', hashes, now).status, 'MANUAL REQUIRED');
  const gates = {checkedAt: new Date(now - 1000).toISOString(), packageSha256: 'package', rulesSha256: 'rules', googleAuth: {verified: true, evidence: 'private-result'}};
  assert.equal(manualCheck(gates, 'googleAuth', hashes, now).status, 'PASS');
  assert.equal(manualCheck(gates, 'googleAuth', hashes, now + 86400000).status, 'MANUAL REQUIRED');
  gates.googleAuth.result = 'FAIL'; assert.equal(manualCheck(gates, 'googleAuth', hashes, now).status, 'FAIL');
});
test('artifact pinpoints changed source hash even when ZIP checksum still matches', () => {
  const root = mkdtempSync(join(tmpdir(), 'comunicate-artifact-'));
  mkdirSync(join(root, '.netlify/release-artifacts'), {recursive: true});
  writeFileSync(join(root, 'package.json'), 'original');
  const zip = join(root, '.netlify/release-artifacts/usuarios.zip'); writeFileSync(zip, 'fixture');
  writeFileSync(join(root, '.netlify/release-artifacts/manifest.json'), JSON.stringify({timestamp: new Date().toISOString(), functions: ['usuarios'], usuariosSha256: fileHash(zip), inputs: [{path: 'package.json', sha256: fileHash(join(root, 'package.json'))}]}));
  assert.equal(inspectArtifact(root).status, 'PASS');
  writeFileSync(join(root, 'package.json'), 'changed');
  const result = inspectArtifact(root); assert.equal(result.status, 'FAIL');
  assert.equal(result.mismatches[0].path, 'package.json'); assert.notEqual(result.mismatches[0].expected, result.mismatches[0].actual);
});
test('backup rejects incomplete scope, stale time, failed counts and checksum mismatch', () => {
  const root = mkdtempSync(join(tmpdir(), 'comunicate-backup-'));
  const dir = join(root, '.netlify/release-backup'); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'full.json'), 'fixture');
  const evidence = {status: 'PASS', project: 'comunicate-tacna', scope: 'all-firestore-collections-and-subcollections', timestamp: new Date().toISOString(), file: 'full.json', sha256: fileHash(join(dir, 'full.json')), collections: [{expected: 3, exported: 3, final: 3}]};
  const save = () => writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence));
  save(); assert.equal(inspectBackup(root).status, 'PASS');
  evidence.collections[0].exported = 2; save(); assert.equal(inspectBackup(root).status, 'FAIL');
  evidence.collections[0].exported = 3; evidence.scope = 'four-operational-collections'; save(); assert.equal(inspectBackup(root).status, 'FAIL');
  evidence.scope = 'all-firestore-collections-and-subcollections'; save(); assert.equal(inspectBackup(root, Date.now() + 86401000).status, 'FAIL');
  writeFileSync(join(dir, 'full.json'), 'tampered'); assert.equal(inspectBackup(root).status, 'FAIL');
});
test('typed backup preserves int64, timestamps, bytes, map tags and special numbers', () => {
  const original = {large: 9223372036854775807n, at: new Timestamp(123, 456), bytes: Buffer.from([1, 2]), location: new GeoPoint(1, 2), nested: {t: 'customer-value'}, nums: [NaN, Infinity, -0]};
  const restored = decodeFirestore(JSON.parse(JSON.stringify(encodeFirestore(original))));
  assert.deepEqual(restored, original);
});

test('quota-exhausted export stays FAIL and reports only the safe error code', () => {
  const root = mkdtempSync(join(tmpdir(), 'comunicate-quota-'));
  const dir = join(root, '.netlify/release-backup'); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'error-private.json'), JSON.stringify({code: 8, message: 'private diagnostic details'}));
  const result = inspectBackup(root);
  assert.equal(result.status, 'FAIL'); assert.match(result.detail, /RESOURCE_EXHAUSTED/);
  assert.ok(!result.detail.includes('private diagnostic details'));
});

function collectionFixture(path, count = 3, failCount = false) {
  let countCalls = 0;
  const docs = Array.from({length: count}, (_, index) => ({id: `d${index}`, ref: {path: `${path}/d${index}`, listCollections: async () => []}, data: () => ({fixture: true})}));
  const collection = {path, count: () => ({get: async () => ({data: () => ({count: failCount && ++countCalls > 1 ? count + 1 : count})})}), listDocuments: async () => docs.map(doc => doc.ref)};
  collection.orderBy = () => {
    let offset = 0; let size;
    const query = {limit: n => {size = n; return query;}, startAfter: cursor => {offset = docs.findIndex(doc => doc.id === cursor.id) + 1; return query;}, get: async () => ({docs: docs.slice(offset, offset + size), size: docs.slice(offset, offset + size).length})};
    return query;
  };
  return collection;
}
test('tree export paginates and discovers subcollections under missing parent documents', async () => {
  const child = collectionFixture('artifacts/missing/users/shared/clientes');
  const root = collectionFixture('artifacts', 0);
  root.listDocuments = async () => [{listCollections: async () => [child]}];
  const result = await exportFirestoreTree({listCollections: async () => [root], collection: path => path === root.path ? root : child}, 2);
  assert.equal(result.entries.length, 3); assert.equal(result.collections[1].pages, 2);
  assert.equal(result.collections[1].final, 3);
});
test('tree export aborts if final counts change', async () => {
  const root = collectionFixture('fixture', 3, true);
  await assert.rejects(() => exportFirestoreTree({listCollections: async () => [root], collection: () => root}, 2), /BACKUP_DATA_CHANGED/);
});
