import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAccount} from '../../scripts/release-authorization.mjs';

const identity = {email: 'operator@example.com', disabled: false, emailVerified: true};
const assignment = (role, status = 'active', email = identity.email) => new Map([[email, {role, status}]]);
test('precheck requires active verified identity and an explicit active valid assignment', () => {
  assert.equal(evaluateAccount(identity, assignment('usuario')).access, true);
  for (const data of [new Map(), assignment('unknown'), new Map([[identity.email, {role: 'admin'}]]), assignment('admin', 'disabled')]) {
    assert.equal(evaluateAccount(identity, data).access, false);
  }
  assert.equal(evaluateAccount({...identity, disabled: true}, assignment('superadmin')).access, false);
  assert.equal(evaluateAccount({...identity, emailVerified: false}, assignment('superadmin')).access, false);
});
test('precheck distinguishes admin from role-management superadmin', () => {
  const admin = evaluateAccount(identity, assignment('admin'));
  assert.equal(admin.admin, true);
  assert.equal(admin.superadmin, false);
  assert.equal(evaluateAccount(identity, assignment('superadmin')).superadmin, true);
});
test('precheck detects backend normalization that would still be denied by exact Firestore Rules', () => {
  assert.equal(evaluateAccount({...identity, email: 'Operator@example.com'}, assignment('admin')).access, false);
  assert.equal(evaluateAccount(identity, assignment('ADMIN')).access, false);
  assert.equal(evaluateAccount(identity, assignment('admin', 'ACTIVE')).access, false);
});
