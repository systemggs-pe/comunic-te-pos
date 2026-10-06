import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, writeBatch} from 'firebase/firestore';
import {initializeApp as initializeClientApp, deleteApp as deleteClientApp} from 'firebase/app';
import {connectAuthEmulator, getAuth as getClientAuth, signInWithEmailAndPassword, signOut} from 'firebase/auth';
import {initializeApp as initializeAdminApp, deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as getAdminAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {handlePost} from '../functions/_shared.mjs';
import {assertRole} from '../functions/_roles.mjs';
import {createFirestoreRepository} from '../../src/repositories/firestoreRepository.js';
import {exportCompleteBackup, BACKUP_COLLECTIONS} from '../../src/services/completeBackup.js';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') {
  throw new Error('Run npm run test:rules; tests only permit the local emulator on 127.0.0.1:8085.');
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9095') throw new Error('Local Auth emulator required.');
const path = 'artifacts/comunicate-pos/users/shared';
let environment;
let adminApp;
let clientApp;
let auth;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-comunicate',
    firestore: {host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8')},
  });
  adminApp = initializeAdminApp({projectId: 'demo-comunicate'}, 'stabilization-fixture');
  clientApp = initializeClientApp({projectId: 'demo-comunicate', apiKey: 'fake-api-key'}, 'stabilization-fixture');
  auth = getClientAuth(clientApp);
  connectAuthEmulator(auth, 'http://127.0.0.1:9095', {disableWarnings: true});
});
after(async () => {
  await environment?.cleanup();
  if (clientApp) await deleteClientApp(clientApp);
  if (adminApp) await deleteAdminApp(adminApp);
});
beforeEach(async () => {await environment.clearFirestore();});

async function seed(email, role, status) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `${path}/clientes/fixture`), {nombre: 'Fixture'});
    if (role) await setDoc(doc(db, `${path}/userRoles/${email}`), {role, ...(status ? {status} : {})});
  });
}
function userDb(email, verified = true) {
  return environment.authenticatedContext('fixture-user', {email, email_verified: verified}).firestore();
}
test('active user reads operational data but cannot modify admin settings', async () => {
  const email = 'operator@example.com';
  await seed(email, 'usuario', 'active');
  const db = userDb(email);
  await assertSucceeds(getDoc(doc(db, `${path}/clientes/fixture`)));
  await assertFails(setDoc(doc(db, `${path}/configuracion/logoVentas`), {dataUrl: 'data:image/png;base64,AAAA'}));
});
test('active admin edits permitted settings but cannot read privileged role collection', async () => {
  const email = 'admin@example.com';
  await seed(email, 'admin', 'active');
  const db = userDb(email);
  await assertSucceeds(setDoc(doc(db, `${path}/configuracion/logoVentas`), {dataUrl: 'data:image/png;base64,AAAA'}));
  await assertFails(getDoc(doc(db, `${path}/userRoles/${email}`)));
});
test('active superadmin reads roles but cannot write them directly', async () => {
  const email = 'root@example.com';
  await seed(email, 'superadmin', 'active');
  const db = userDb(email);
  await assertSucceeds(getDoc(doc(db, `${path}/userRoles/${email}`)));
  await assertFails(setDoc(doc(db, `${path}/userRoles/${email}`), {role: 'superadmin', status: 'active'}));
});
for (const email of ['disabled@example.com', 'brand050103@gmail.com', 'lauryruyz50@gmail.com']) {
  test(`disabled privileged identity loses direct access: ${email}`, async () => {
    await seed(email, 'superadmin', 'disabled');
    const db = userDb(email);
    await assertFails(getDoc(doc(db, `${path}/clientes/fixture`)));
    await assertFails(getDoc(doc(db, `${path}/userRoles/${email}`)));
    await assertFails(setDoc(doc(db, `${path}/configuracion/logoVentas`), {dataUrl: 'data:image/png;base64,AAAA'}));
  });
}
test('formerly privileged email downgraded to usuario has no admin bypass', async () => {
  const email = 'brand050103@gmail.com';
  await seed(email, 'usuario', 'active');
  const db = userDb(email);
  await assertSucceeds(getDoc(doc(db, `${path}/clientes/fixture`)));
  await assertFails(setDoc(doc(db, `${path}/configuracion/logoVentas`), {dataUrl: 'data:image/png;base64,AAAA'}));
});
test('missing role, missing active status and unknown role all fail closed', async () => {
  for (const [role, status] of [[null, null], ['admin', null], ['disabled', 'active']]) {
    await seed('brand050103@gmail.com', role, status);
    await assertFails(getDoc(doc(userDb('brand050103@gmail.com'), `${path}/clientes/fixture`)));
    await environment.clearFirestore();
  }
});
test('unauthenticated and unverified identities cannot read protected data', async () => {
  await seed('operator@example.com', 'admin', 'active');
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), `${path}/clientes/fixture`)));
  await assertFails(getDoc(doc(userDb('operator@example.com', false), `${path}/clientes/fixture`)));
});
test('disabling a role revokes access even with the same authenticated context', async () => {
  const email = 'operator@example.com';
  await seed(email, 'admin', 'active');
  const db = userDb(email);
  assert.equal((await assertSucceeds(getDoc(doc(db, `${path}/clientes/fixture`)))).exists(), true);
  await seed(email, 'admin', 'disabled');
  await assertFails(getDoc(doc(db, `${path}/clientes/fixture`)));
});

test('role recovery permits the existing authenticated context again', async () => {
  const email = 'recovery@example.com';
  await seed(email, 'admin', 'disabled');
  const db = userDb(email);
  await assertFails(getDoc(doc(db, `${path}/clientes/fixture`)));
  await seed(email, 'admin', 'active');
  await assertSucceeds(getDoc(doc(db, `${path}/clientes/fixture`)));
});

test('backend-normalized email and noncanonical role values do not bypass exact rules', async () => {
  await seed('operator@example.com', 'admin', 'active');
  await assertFails(getDoc(doc(userDb('Operator@example.com'), `${path}/clientes/fixture`)));
  await seed('operator@example.com', 'ADMIN', 'active');
  await assertFails(getDoc(doc(userDb('operator@example.com'), `${path}/clientes/fixture`)));
});

test('backup reads every operational collection through real paginated Firestore queries', async () => {
  const email = 'backup@example.com';
  await seed(email, 'admin', 'active');
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const name of BACKUP_COLLECTIONS) {
      const batch = writeBatch(db);
      for (let index = 0; index < 205; index += 1) {
        batch.set(doc(db, `${path}/${name}/fixture-${String(index).padStart(4, '0')}`), {nombre: 'Synthetic fixture'});
      }
      await batch.commit();
    }
  });
  const result = await exportCompleteBackup(createFirestoreRepository(userDb(email), 'comunicate-pos'), undefined, 100);
  for (const name of BACKUP_COLLECTIONS) {
    const expected = name === 'clientes' ? 206 : 205;
    assert.equal(result[name].length, expected);
    assert.deepEqual(result.verification.counts[name], {expected, exported: expected});
  }
});

test('Auth emulator covers valid/invalid login, protected API, disabled user, expired session and logout', async () => {
  const email = 'auth-fixture@example.com';
  const password = 'Synthetic-password-2026';
  const adminAuth = getAdminAuth(adminApp);
  await adminAuth.createUser({uid: 'auth-fixture', email, password, emailVerified: true});
  await seed(email, 'usuario', 'active');
  await assert.rejects(() => signInWithEmailAndPassword(auth, email, 'wrong-password'));
  const login = await signInWithEmailAndPassword(auth, email, password);
  const token = await login.user.getIdToken();
  const services = {getAuth: () => adminAuth, getDb: () => getFirestore(adminApp)};
  const request = tokenValue => ({httpMethod: 'POST', headers: tokenValue ? {authorization: `Bearer ${tokenValue}`} : {}, body: '{}'});
  assert.equal((await handlePost(request(token), (_body, user) => ({role: user.role}), {}, services)).statusCode, 200);
  assert.equal((await handlePost(request(token), (_body, user) => {assertRole(user, 'admin');}, {}, services)).statusCode, 403);
  const parts = token.split('.');
  const expired = {...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), exp: 1};
  parts[1] = Buffer.from(JSON.stringify(expired)).toString('base64url');
  assert.equal((await handlePost(request(parts.join('.')), () => ({}), {}, services)).statusCode, 401);
  await seed(email, 'superadmin', 'disabled');
  assert.equal((await handlePost(request(token), () => ({}), {}, services)).statusCode, 403);
  await adminAuth.updateUser('auth-fixture', {disabled: true});
  assert.equal((await handlePost(request(token), () => ({}), {}, services)).statusCode, 401);
  await signOut(auth);
  assert.equal(auth.currentUser, null);
  assert.equal((await handlePost(request(), () => ({}), {}, services)).statusCode, 401);
  await assert.rejects(() => signInWithEmailAndPassword(auth, email, password));
});
