import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc} from 'firebase/firestore';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createStore} from '../../scripts/authorization-migration-store.mjs';
import {executeMigration, executeRollback, buildMigration, createBackup} from '../../scripts/authorization-migration-core.mjs';
import {resolveUserAccess, assertRole} from '../functions/_roles.mjs';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095') throw new Error('LOCAL DEMO EMULATORS REQUIRED');
const path = 'artifacts/comunicate-pos/users/shared';
const plan = {version: 1, project: 'comunicate-tacna', assignments: [
  {label: 'U-003', uid: 'migration-root', email: 'migration-root@example.com', role: 'superadmin', status: 'active'},
  {label: 'U-006', uid: 'migration-admin', email: 'migration-admin@example.com', role: 'admin', status: 'active'},
]};
let environment; let app; let db; let auth; let store;
before(async () => {
  environment = await initializeTestEnvironment({projectId: 'demo-comunicate', firestore: {host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8')}});
  app = initializeApp({projectId: 'demo-comunicate'}, 'authorization-migration-fixture');
  db = getFirestore(app); auth = getAuth(app); store = createStore(db, auth);
  for (const assignment of plan.assignments) await auth.createUser({uid: assignment.uid, email: assignment.email, emailVerified: true});
  await auth.createUser({uid: 'migration-reserve', email: 'migration-reserve@example.com', emailVerified: true});
});
beforeEach(async () => {
  await environment.clearFirestore();
  for (const assignment of plan.assignments) await auth.updateUser(assignment.uid, {disabled: false});
  await db.doc(`${path}/clientes/fixture`).set({nombre: 'Synthetic fixture'});
});
after(async () => {await environment?.cleanup(); if (app) await deleteApp(app);});
const userDb = assignment => environment.authenticatedContext(assignment.uid, {email: assignment.email, email_verified: true}).firestore();
const applyFixture = saveBackup => executeMigration({plan, store, dryRun: false, saveBackup: saveBackup || (async () => 'fixture-memory-backup')});

test('dry-run against real Auth/Firestore emulators creates zero role documents', async () => {
  const result = await executeMigration({plan, store});
  assert.equal(result.changes.length, 2);
  assert.equal((await db.collection(`${path}/userRoles`).get()).size, 0);
});
test('atomic fixture migration restores both Rules reads and correct backend admin permissions', async () => {
  for (const assignment of plan.assignments) await assertFails(getDoc(doc(userDb(assignment), `${path}/clientes/fixture`)));
  let backup;
  await applyFixture(async value => {backup = value; assert.equal((await db.collection(`${path}/userRoles`).get()).size, 0); return 'fixture-memory-backup';});
  assert.equal(backup.entries.length, 2);
  for (const assignment of plan.assignments) {
    await assertSucceeds(getDoc(doc(userDb(assignment), `${path}/clientes/fixture`)));
    const user = await resolveUserAccess(db, {uid: assignment.uid, email: assignment.email, emailVerified: true});
    assertRole(user, 'admin');
    if (assignment.role === 'superadmin') assertRole(user, 'superadmin');
    else assert.throws(() => assertRole(user, 'superadmin'), /PERMISO_INSUFICIENTE/);
  }
  const repeat = await executeMigration({plan, store}); assert.equal(repeat.changes.length, 0);
});
test('disabled Auth admin and failed backup both prevent fixture writes', async () => {
  await auth.updateUser(plan.assignments[0].uid, {disabled: true});
  await assert.rejects(() => applyFixture(), /USER_DISABLED/);
  await auth.updateUser(plan.assignments[0].uid, {disabled: false});
  await assert.rejects(() => applyFixture(async () => {throw new Error('DISK_FAILURE');}), /DISK_FAILURE/);
  assert.equal((await db.collection(`${path}/userRoles`).get()).size, 0);
});
test('transaction rejects target changed since backup and keeps other target untouched', async () => {
  const migration = buildMigration(plan, await store.read());
  await db.doc(`${path}/userRoles/${plan.assignments[0].email}`).set({role: 'usuario', status: 'active'});
  await assert.rejects(() => store.commit(migration.changes, '[]'), /CONCURRENT_DOCUMENT_CHANGE/);
  assert.equal((await db.doc(`${path}/userRoles/${plan.assignments[1].email}`).get()).exists, false);
});
test('update preserves unrelated fields and rollback dry-run/restoration respect independent admin', async () => {
  const root = plan.assignments[0];
  await db.doc(`${path}/userRoles/${root.email}`).set({email: root.email, uid: root.uid, role: 'usuario', status: 'active', displayName: 'Fixture', metadata: {keep: true}});
  await db.doc(`${path}/userRoles/migration-reserve@example.com`).set({role: 'superadmin', status: 'active'});
  let backup; await applyFixture(async value => {backup = value; return 'fixture-memory-backup';});
  const migrated = await db.doc(`${path}/userRoles/${root.email}`).get();
  assert.equal(migrated.get('displayName'), 'Fixture'); assert.deepEqual(migrated.get('metadata'), {keep: true});
  const rollback = await executeRollback({backup, store}); assert.equal(rollback.changes.length, 2);
  assert.equal((await db.doc(`${path}/userRoles/${root.email}`).get()).get('role'), 'superadmin');
  // Exercise the transaction engine ONLY on synthetic demo fixtures; no CLI --apply.
  await executeRollback({backup, store, dryRun: false, saveBackup: async () => 'fixture-safety-copy'});
  const restored = await db.doc(`${path}/userRoles/${root.email}`).get();
  assert.equal(restored.get('role'), 'usuario'); assert.deepEqual(restored.get('metadata'), {keep: true});
  assert.equal((await db.doc(`${path}/userRoles/${plan.assignments[1].email}`).get()).exists, false);
});
test('rollback of bootstrap alone aborts instead of removing last admins', async () => {
  const backup = createBackup(plan, buildMigration(plan, await store.read()));
  await applyFixture();
  await assert.rejects(() => executeRollback({backup, store}), /LAST_ADMIN_OR_ROLE_MANAGER/);
  assert.equal((await db.collection(`${path}/userRoles`).get()).size, 2);
});
test('transaction rejects concurrent change to independent recovery administrator', async () => {
  const current = await store.read(); const migration = buildMigration(plan, current);
  await db.doc(`${path}/userRoles/migration-reserve@example.com`).set({role: 'superadmin', status: 'disabled'});
  await assert.rejects(() => store.commit(migration.changes, '[]'), /CONCURRENT_AUTHORIZATION_CHANGE/);
  assert.equal((await db.doc(`${path}/userRoles/${plan.assignments[0].email}`).get()).exists, false);
});
