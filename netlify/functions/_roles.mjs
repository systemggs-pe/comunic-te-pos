import {FieldValue} from 'firebase-admin/firestore';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

export const USER_ROLES = ['usuario', 'admin', 'superadmin'];
export const USER_STATUSES = ['active', 'disabled'];

const ROLE_RANK = {
  usuario: 1,
  admin: 2,
  superadmin: 3,
};

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return USER_ROLES.includes(role) ? role : '';
}

export function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return USER_STATUSES.includes(status) ? status : '';
}

export function roleRank(role) {
  return ROLE_RANK[normalizeRole(role)] || 0;
}

export function hasRole(user, minimumRole) {
  return user?.status === 'active' && roleRank(minimumRole) > 0
    && roleRank(user?.role) >= roleRank(minimumRole);
}

export function assertRole(user, minimumRole) {
  if (!hasRole(user, minimumRole)) {
    throw Object.assign(new Error('PERMISO_INSUFICIENTE'), {status: 403});
  }
}

export function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

export async function resolveUserAccess(db, user) {
  const email = normalizeEmail(user?.email);
  if (!email || !user?.emailVerified) {
    throw Object.assign(new Error('No autorizado'), {status: 403});
  }

  const ref = baseRef(db).collection('userRoles').doc(email);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    const role = normalizeRole(data.role);
    const status = normalizeStatus(data.status);
    if (!role || status !== 'active') {
      throw Object.assign(new Error('USUARIO_DESHABILITADO'), {status: 403});
    }
    return {
      ...user,
      email,
      role,
      status,
      roleSource: 'db',
      roleRef: ref,
    };
  }

  throw Object.assign(new Error('No autorizado'), {status: 403});
}

export function publicUserProfile(user) {
  return {
    uid: String(user?.uid || ''),
    email: normalizeEmail(user?.email),
    role: normalizeRole(user?.role) || 'usuario',
    status: normalizeStatus(user?.status),
    roleSource: String(user?.roleSource || '').slice(0, 40),
  };
}

export function sanitizeRoleDocument(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    email: normalizeEmail(data.email || doc.id),
    role: normalizeRole(data.role) || 'usuario',
    status: normalizeStatus(data.status),
    displayName: String(data.displayName || '').slice(0, 160),
    uid: String(data.uid || '').slice(0, 160),
    createdByEmail: normalizeEmail(data.createdByEmail),
    updatedByEmail: normalizeEmail(data.updatedByEmail),
    createdAt: String(data.createdAtIso || ''),
    updatedAt: String(data.updatedAtIso || ''),
  };
}

export function buildRoleDocument({email, role, status, displayName = '', uid = ''}, actor, existing = {}) {
  const nowIso = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);
  const normalizedStatus = normalizeStatus(status);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw Object.assign(new Error('EMAIL_INVALIDO'), {status: 400});
  }
  if (!normalizedRole) throw Object.assign(new Error('ROL_INVALIDO'), {status: 400});
  if (!normalizedStatus) throw Object.assign(new Error('ESTADO_INVALIDO'), {status: 400});

  return {
    email: normalizedEmail,
    role: normalizedRole,
    status: normalizedStatus,
    displayName: String(displayName || '').trim().slice(0, 160),
    uid: String(uid || existing.uid || '').trim().slice(0, 160),
    createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    createdAtIso: existing.createdAtIso || nowIso,
    createdByUid: existing.createdByUid || actor?.uid || '',
    createdByEmail: existing.createdByEmail || actor?.email || '',
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
    updatedByUid: actor?.uid || '',
    updatedByEmail: actor?.email || '',
  };
}
