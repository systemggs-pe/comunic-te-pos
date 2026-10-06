import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {queueAuditEvent} from './_observability.mjs';
import {
  assertRole,
  baseRef,
  buildRoleDocument,
  normalizeEmail,
  publicUserProfile,
  sanitizeRoleDocument,
} from './_roles.mjs';

function clean(value) {
  return String(value || '').trim();
}

function parseEmailPayload(body) {
  const email = normalizeEmail(body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('EMAIL_INVALIDO'), {status: 400});
  }
  return email;
}

async function listUsers(db, user) {
  assertRole(user, 'superadmin');
  const snap = await baseRef(db)
    .collection('userRoles')
    .orderBy('email', 'asc')
    .limit(200)
    .get();
  return {
    currentUser: publicUserProfile(user),
    users: snap.docs.map(sanitizeRoleDocument),
  };
}

async function saveUser(db, body, user, context) {
  assertRole(user, 'superadmin');
  const email = parseEmailPayload(body);
  if (email === user.email) {
    throw Object.assign(new Error('NO_EDITAR_PROPIO_ROL'), {status: 409});
  }

  const base = baseRef(db);
  const ref = base.collection('userRoles').doc(email);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() || {} : {};
  const next = buildRoleDocument({
    email,
    role: body?.role,
    status: body?.status,
    displayName: body?.displayName,
    uid: body?.uid,
  }, user, current);

  await ref.set(next, {merge: false});
  const batch = db.batch();
  queueAuditEvent(batch, base, context, {
    entityType: 'userRole',
    entityId: email,
    action: snap.exists ? 'update' : 'create',
    metadata: {
      email,
      role: next.role,
      status: next.status,
      previousRole: current.role || '',
      previousStatus: current.status || '',
    },
  });
  await batch.commit();

  return {user: sanitizeRoleDocument({id: email, data: () => next})};
}

async function deleteUser(db, body, user, context) {
  assertRole(user, 'superadmin');
  const email = parseEmailPayload(body);
  if (email === user.email) {
    throw Object.assign(new Error('NO_ELIMINAR_PROPIO_ROL'), {status: 409});
  }

  const base = baseRef(db);
  const ref = base.collection('userRoles').doc(email);
  const snap = await ref.get();
  await ref.delete();
  const batch = db.batch();
  queueAuditEvent(batch, base, context, {
    entityType: 'userRole',
    entityId: email,
    action: 'delete',
    metadata: {
      email,
      existed: snap.exists,
      previousRole: snap.data()?.role || '',
      previousStatus: snap.data()?.status || '',
    },
  });
  await batch.commit();
  return {deleted: true, email, existed: snap.exists};
}

async function dispatchUsuarios(body, user, context) {
  const db = getAdminDb();
  const action = clean(body?.action || 'me');
  if (action === 'me') return {user: publicUserProfile(user)};
  if (action === 'list') return listUsers(db, user);
  if (action === 'save') return saveUser(db, body, user, context);
  if (action === 'delete') return deleteUser(db, body, user, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const __test = {
  parseEmailPayload,
};

export const handler = event => handlePost(event, dispatchUsuarios, {
  rateLimit: {name: 'usuarios', max: 60, windowMs: 60 * 1000, distributed: true},
});
