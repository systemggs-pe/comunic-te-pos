import assert from 'node:assert/strict';
import test from 'node:test';
import {assertRole, buildRoleDocument, resolveUserAccess} from '../functions/_roles.mjs';
import {handlePost} from '../functions/_shared.mjs';
import {puedeUsuario} from '../../src/config/auth.js';

function accessDb(data) {
  const ref = {
    collection: () => ref,
    doc: () => ref,
    get: async () => ({exists: data !== undefined, data: () => data}),
  };
  return ref;
}
const actor = {uid: 'fixture', email: 'brand050103@gmail.com', emailVerified: true};

test('active users retain only the permissions of their stored role', async () => {
  const user = await resolveUserAccess(accessDb({status: 'active', role: 'usuario'}), actor);
  assert.doesNotThrow(() => assertRole(user, 'usuario'));
  assert.throws(() => assertRole(user, 'admin'), {status: 403});
  assert.equal(puedeUsuario(user, 'admin'), false);
  assert.equal(puedeUsuario({...user, role: 'admin'}, 'admin'), true);
  assert.equal(puedeUsuario({...user, status: 'disabled', role: 'superadmin'}), false);
  assert.throws(() => assertRole({...user, status: 'disabled', role: 'superadmin'}, 'usuario'), {status: 403});
});

for (const [description, data] of [
  ['disabled user', {status: 'disabled', role: 'usuario'}],
  ['disabled privileged role', {status: 'disabled', role: 'superadmin'}],
  ['role without active status', {role: 'superadmin'}],
  ['invalid status', {status: 'unknown', role: 'admin'}],
  ['invalid or disabled role name', {status: 'active', role: 'disabled'}],
  ['missing authorization', undefined],
]) {
  test(`API denies ${description}, including formerly privileged email`, async () => {
    let reached = false;
    const services = {
      getAuth: () => ({verifyIdToken: async (_token, revoked) => {
        assert.equal(revoked, true);
        return {uid: actor.uid, email: actor.email, email_verified: true};
      }}),
      getDb: () => accessDb(data),
    };
    const response = await handlePost({httpMethod: 'POST', headers: {authorization: 'Bearer fixture'}, body: '{}'}, () => {
      reached = true;
      return {};
    }, {}, services);
    assert.equal(response.statusCode, 403);
    assert.equal(reached, false);
  });
}

test('protected API allows active authorized user and denies insufficient role', async () => {
  const event = {httpMethod: 'POST', headers: {authorization: 'Bearer fixture'}, body: '{}'};
  const services = {
    getAuth: () => ({verifyIdToken: async () => ({uid: actor.uid, email: actor.email, email_verified: true})}),
    getDb: () => accessDb({status: 'active', role: 'usuario'}),
  };
  const response = await handlePost(event, (_body, user) => ({role: user.role}), {}, services);
  assert.equal(response.statusCode, 200);
  const denied = await handlePost(event, (_body, user) => {assertRole(user, 'admin');}, {}, services);
  assert.equal(denied.statusCode, 403);
});

for (const failure of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/user-disabled']) {
  test(`API denies ${failure} before accessing Firestore`, async () => {
    const services = {
      getAuth: () => ({verifyIdToken: async () => {throw Object.assign(new Error('fixture'), {code: failure});}}),
      getDb: () => {throw new Error('DB must not be reached');},
    };
    const response = await handlePost({httpMethod: 'POST', headers: {authorization: 'Bearer fixture'}}, () => {
      throw new Error('Callback must not be reached');
    }, {}, services);
    assert.equal(response.statusCode, 401);
  });
}

test('API rejects missing authentication and unverified identity', async () => {
  const noSession = await handlePost({httpMethod: 'POST', headers: {}}, () => {throw new Error('unreachable');});
  assert.equal(noSession.statusCode, 401);
  await assert.rejects(() => resolveUserAccess(accessDb({status: 'active', role: 'admin'}), {...actor, emailVerified: false}), {status: 403});
});

test('role writes reject invalid or missing status instead of activating by default', () => {
  for (const status of [undefined, '', 'enabled', 'inactive']) {
    assert.throws(() => buildRoleDocument({email: 'fixture@example.com', role: 'admin', status}, actor), /ESTADO_INVALIDO/);
  }
});
