import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRole,
  buildRoleDocument,
  normalizeEmail,
  publicUserProfile,
  resolveUserAccess,
} from '../functions/_roles.mjs';
import {__test as usuariosTest} from '../functions/usuarios.mjs';

class FakeDocSnapshot {
  constructor(value) {
    this._value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this._value;
  }
}

class FakeDocRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }

  collection(name) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocSnapshot(this.store.get(this.path));
  }
}

class FakeCollectionRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this.store, `${this.path}/${id}`);
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
  }

  collection(name) {
    return new FakeCollectionRef(this.store, name);
  }
}

const basePath = 'artifacts/comunicate-pos/users/shared/userRoles';

test('roles normalize email and expose a safe public profile', () => {
  assert.equal(normalizeEmail(' Brand050103@Gmail.COM '), 'brand050103@gmail.com');
  assert.deepEqual(publicUserProfile({
    uid: 'uid-1',
    email: 'USER@EXAMPLE.COM',
    role: 'admin',
    status: 'active',
    roleSource: 'db',
  }), {
    uid: 'uid-1',
    email: 'user@example.com',
    role: 'admin',
    status: 'active',
    roleSource: 'db',
  });
});

test('roles resolve fallback superadmin and configured DB users', async () => {
  const db = new FakeDb({
    [`${basePath}/operator@example.com`]: {
      email: 'operator@example.com',
      role: 'usuario',
      status: 'active',
    },
  });

  const fallback = await resolveUserAccess(db, {
    uid: 'brand',
    email: 'brand050103@gmail.com',
    emailVerified: true,
  });
  assert.equal(fallback.role, 'superadmin');
  assert.equal(fallback.roleSource, 'fallback');

  const operator = await resolveUserAccess(db, {
    uid: 'operator',
    email: 'operator@example.com',
    emailVerified: true,
  });
  assert.equal(operator.role, 'usuario');
  assert.equal(operator.roleSource, 'db');
});

test('roles reject disabled or insufficient users', async () => {
  const db = new FakeDb({
    [`${basePath}/disabled@example.com`]: {
      email: 'disabled@example.com',
      role: 'admin',
      status: 'disabled',
    },
  });

  await assert.rejects(() => resolveUserAccess(db, {
    uid: 'disabled',
    email: 'disabled@example.com',
    emailVerified: true,
  }), /USUARIO_DESHABILITADO/);

  assert.throws(() => assertRole({role: 'usuario'}, 'admin'), /PERMISO_INSUFICIENTE/);
});

test('usuarios validates emails and role documents', () => {
  assert.equal(usuariosTest.parseEmailPayload({email: ' User@Example.com '}), 'user@example.com');
  assert.throws(() => usuariosTest.parseEmailPayload({email: 'bad'}), /EMAIL_INVALIDO/);

  const doc = buildRoleDocument({
    email: 'new@example.com',
    role: 'admin',
    status: 'active',
    displayName: 'Admin Nuevo',
  }, {uid: 'root', email: 'brand050103@gmail.com'});

  assert.equal(doc.email, 'new@example.com');
  assert.equal(doc.role, 'admin');
  assert.equal(doc.status, 'active');
  assert.equal(doc.createdByEmail, 'brand050103@gmail.com');
});
