import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildMigration, buildRollback, createBackup, digest, executeMigration, executeRollback, validatePlan} from '../../scripts/authorization-migration-core.mjs';

const plan = () => ({version: 1, project: 'comunicate-tacna', assignments: [
  {label: 'U-003', uid: 'fixture-root', email: 'root@example.com', role: 'superadmin', status: 'active'},
  {label: 'U-006', uid: 'fixture-admin', email: 'admin@example.com', role: 'admin', status: 'active'},
]});
const state = () => ({users: plan().assignments.map(item => ({uid: item.uid, email: item.email, disabled: false, emailVerified: true})), documents: new Map()});
function fakeStore(initial = state()) {
  let current = initial;
  const writes = [];
  return {writes, read: async () => current,
    commit: async changes => {
      writes.push(...changes);
      current = {...current, documents: new Map(current.documents)};
      for (const change of changes) {
        if (change.kind === 'delete-created') current.documents.delete(change.email);
        else if (change.kind === 'restore-fields') {
          const data = {...current.documents.get(change.email).data};
          for (const [name, prior] of Object.entries(change.restore)) {
            if (prior.exists) data[name] = prior.value; else delete data[name];
          }
          current.documents.set(change.email, {data, version: 'fixture-restored'});
        } else current.documents.set(change.email, {data: {...current.documents.get(change.email)?.data, ...change.patch}, version: 'fixture-applied'});
      }
    }};
}
function reserveAdmin(current) {
  current.users.push({uid: 'reserve', email: 'reserve@example.com', disabled: false, emailVerified: true});
  current.documents.set('reserve@example.com', {data: {role: 'superadmin', status: 'active'}, version: 'reserve-version'});
}

test('valid confirmed migration prepares only two assignments and two active admins', () => {
  const result = buildMigration(plan(), state());
  assert.equal(result.changes.length, 2);
  assert.equal(result.admins, 2);
  assert.equal(result.superadmins, 1);
  assert.equal(result.lockout, false);
  assert.deepEqual(Object.keys(result.changes[0].patch).sort(), ['email', 'role', 'status', 'uid']);
});
test('missing user aborts without guessing identities', () => {
  const current = state(); current.users.pop();
  assert.throws(() => buildMigration(plan(), current), /USER_MISSING/);
});
test('same email recreated with another UID aborts', () => {
  const current = state(); current.users[0].uid = 'replacement';
  assert.throws(() => buildMigration(plan(), current), /IDENTITY_CHANGED/);
});
test('unknown role aborts', () => {
  const invalid = plan(); invalid.assignments[0].role = 'owner';
  assert.throws(() => buildMigration(invalid, state()), /ROLE_UNKNOWN/);
});
test('inactive proposed role aborts', () => {
  const invalid = plan(); invalid.assignments[0].status = 'disabled';
  assert.throws(() => buildMigration(invalid, state()), /ROLE_INACTIVE/);
});
test('disabled administrative identity aborts', () => {
  const current = state(); current.users[0].disabled = true;
  assert.throws(() => buildMigration(plan(), current), /USER_DISABLED/);
});
test('unverified administrative identity aborts', () => {
  const current = state(); current.users[1].emailVerified = false;
  assert.throws(() => buildMigration(plan(), current), /UNVERIFIED/);
});
test('plan leaving zero admins cannot replace the confirmed roles', () => {
  const invalid = plan(); for (const assignment of invalid.assignments) assignment.role = 'usuario';
  assert.throws(() => buildMigration(invalid, state()), /CONFIRMED_ROLE_MISMATCH/);
});
test('noncanonical email and duplicate identities abort', () => {
  const invalid = plan(); invalid.assignments[0].email = 'Root@example.com';
  assert.throws(() => validatePlan(invalid), /IDENTITY_INVALID/);
  const duplicate = plan(); duplicate.assignments[1].uid = duplicate.assignments[0].uid;
  assert.throws(() => validatePlan(duplicate), /IDENTITY_INVALID/);
});
test('conflicting persisted uid aborts rather than transferring privileges', () => {
  const current = state(); current.documents.set('root@example.com', {data: {uid: 'other-person'}, version: 'v1'});
  assert.throws(() => buildMigration(plan(), current), /DOCUMENT_IDENTITY_CONFLICT/);
});
test('update preserves metadata and only patches necessary authorization fields', () => {
  const current = state(); current.documents.set('root@example.com', {data: {...plan().assignments[0], displayName: 'Fixture', audit: {keep: true}, role: 'usuario'}, version: 'v1'});
  const migration = buildMigration(plan(), current);
  assert.deepEqual(migration.changes[0].patch, {role: 'superadmin'});
  assert.equal(migration.changes[0].kind, 'update');
  const backup = createBackup(plan(), migration);
  assert.equal(backup.entries[0].beforeFields.role.value, 'usuario');
  assert.equal(Object.hasOwn(backup.entries[0].beforeFields, 'audit'), false);
});
test('default dry-run performs no commit and creates no backup', async () => {
  const store = fakeStore(); let backups = 0;
  const result = await executeMigration({plan: plan(), store, saveBackup: async () => {backups += 1;}});
  assert.equal(result.applied, false); assert.equal(store.writes.length, 0); assert.equal(backups, 0);
});
test('failed backup prevents all writes', async () => {
  const store = fakeStore();
  await assert.rejects(() => executeMigration({plan: plan(), store, dryRun: false, saveBackup: async () => {throw new Error('DISK_FAILURE');}}), /DISK_FAILURE/);
  assert.equal(store.writes.length, 0);
});
test('backup precedes atomic commit and repeated migration is idempotent', async () => {
  const store = fakeStore(); const steps = [];
  const commit = store.commit; store.commit = async (...args) => {steps.push('commit'); await commit(...args);};
  await executeMigration({plan: plan(), store, dryRun: false, saveBackup: async backup => {steps.push('backup'); assert.equal(backup.entries.length, 2); return 'private.json';}});
  assert.deepEqual(steps, ['backup', 'commit']);
  const repeat = await executeMigration({plan: plan(), store, dryRun: false});
  assert.equal(repeat.changes.length, 0); assert.equal(store.writes.length, 2);
});
test('state changing after backup aborts all writes', async () => {
  const current = state(); const store = fakeStore(current);
  await assert.rejects(() => executeMigration({plan: plan(), store, dryRun: false, saveBackup: async () => {
    current.documents.set('admin@example.com', {data: {role: 'usuario', status: 'active'}, version: 'concurrent'}); return 'private.json';
  }}), /STATE_CHANGED_AFTER_BACKUP/);
  assert.equal(store.writes.length, 0);
});
test('rollback dry-run is harmless before migration and writes nothing', async () => {
  const initial = state(); const backup = createBackup(plan(), buildMigration(plan(), initial)); const store = fakeStore(initial);
  const result = await executeRollback({backup, store});
  assert.equal(result.changes.length, 0); assert.equal(store.writes.length, 0);
});
test('rollback removing the last admins aborts even in dry-run', async () => {
  const initial = state(); const backup = createBackup(plan(), buildMigration(plan(), initial)); const store = fakeStore(initial);
  await executeMigration({plan: plan(), store, dryRun: false, saveBackup: async () => 'private.json'});
  await assert.rejects(() => executeRollback({backup, store}), /LAST_ADMIN_OR_ROLE_MANAGER/);
  assert.equal(store.writes.length, 2);
});
test('rollback dry-run plans only created documents when independent recovery admin exists', async () => {
  const initial = state(); reserveAdmin(initial);
  const backup = createBackup(plan(), buildMigration(plan(), initial)); const store = fakeStore(initial);
  await executeMigration({plan: plan(), store, dryRun: false, saveBackup: async () => 'private.json'});
  const rollback = await executeRollback({backup, store});
  assert.equal(rollback.changes.length, 2); assert.equal(rollback.superadmins, 1);
  assert.equal(store.writes.length, 2);
});
test('rollback rejects concurrent changes and unrelated data added to created docs', async () => {
  const initial = state(); reserveAdmin(initial); const backup = createBackup(plan(), buildMigration(plan(), initial));
  const store = fakeStore(initial); await executeMigration({plan: plan(), store, dryRun: false, saveBackup: async () => 'private.json'});
  const changed = await store.read(); changed.documents.get('root@example.com').data.note = 'Added later';
  assert.throws(() => buildRollback(backup, changed), /OTHER_DATA/);
  delete changed.documents.get('root@example.com').data.note;
  changed.documents.get('root@example.com').data.role = 'usuario';
  assert.throws(() => buildRollback(backup, changed), /CONCURRENT_FIELD_CHANGE/);
});
test('tampered backup is rejected and hashes bind review to exact content', () => {
  const backup = createBackup(plan(), buildMigration(plan(), state())); const original = digest(backup);
  backup.entries[0].patch.password = 'forbidden';
  assert.notEqual(digest(backup), original);
  assert.throws(() => buildRollback(backup, state()), /BACKUP_PATCH_INVALID/);
});
