import {createHash} from 'node:crypto';
import {evaluateAccount} from './release-authorization.mjs';

export const AUTHORIZATION_FIELDS = ['email', 'uid', 'role', 'status'];
export const AUTHORIZATION_PROJECT = 'comunicate-tacna';
const ROLES = ['usuario', 'admin', 'superadmin'];
const permissions = role => role === 'superadmin' ? 'Operación + administración + gestión de usuarios/roles'
  : role === 'admin' ? 'Operación + administración; sin gestión de roles' : 'Operación; sin administración';
const fail = code => {throw new Error(`ABORT MIGRATION: ${code}`);};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const versions = state => JSON.stringify([...state.documents].map(([id, doc]) => [id, doc.version]).sort());

export function validatePlan(plan) {
  if (plan?.version !== 1 || plan.project !== AUTHORIZATION_PROJECT || !Array.isArray(plan.assignments)
    || plan.assignments.length !== 2) fail('PLAN_STRUCTURE_INVALID');
  const labels = new Set();
  const identities = new Set();
  for (const assignment of plan.assignments) {
    if (!['U-003', 'U-006'].includes(assignment.label) || labels.has(assignment.label)) fail('PLAN_LABEL_INVALID');
    labels.add(assignment.label);
    if (typeof assignment.email !== 'string' || assignment.email !== assignment.email.trim().toLowerCase()
      || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(assignment.email)
      || typeof assignment.uid !== 'string' || !assignment.uid || identities.has(assignment.uid)
      || identities.has(assignment.email)) fail('PLAN_IDENTITY_INVALID');
    identities.add(assignment.uid);
    identities.add(assignment.email);
    if (!ROLES.includes(assignment.role)) fail('ROLE_UNKNOWN');
    if (assignment.status !== 'active') fail('ROLE_INACTIVE');
    // Keep the scope of the human-confirmed bootstrap fixed. A different policy
    // needs a separately reviewed plan, not silently edited privileges.
    if ((assignment.label === 'U-003' && assignment.role !== 'superadmin')
      || (assignment.label === 'U-006' && assignment.role !== 'admin')) fail('CONFIRMED_ROLE_MISMATCH');
  }
  return plan;
}

function assertIdentity(assignment, users) {
  const user = users.find(item => item.uid === assignment.uid);
  if (!user || user.email !== assignment.email) fail('USER_MISSING_OR_IDENTITY_CHANGED');
  if (user.disabled || user.emailVerified !== true) fail('USER_DISABLED_OR_UNVERIFIED');
  return user;
}
function fields(data) {
  return Object.fromEntries(AUTHORIZATION_FIELDS.map(name => [name,
    Object.hasOwn(data || {}, name) ? {exists: true, value: data[name]} : {exists: false}]));
}
function assertReversible(data) {
  for (const name of AUTHORIZATION_FIELDS) {
    if (Object.hasOwn(data || {}, name) && typeof data[name] !== 'string') fail('NON_STRING_AUTHORIZATION_FIELD');
  }
}
function accessSummary(users, documents) {
  const assignments = new Map([...documents].map(([email, doc]) => [email, doc.data]));
  const evaluated = users.map(user => ({uid: user.uid, ...evaluateAccount(user, assignments)}));
  return {admins: evaluated.filter(row => row.admin).length,
    superadmins: evaluated.filter(row => row.superadmin).length, evaluated};
}
function assertSafety(before, after, requiredUids) {
  if (!after.admins) fail('ZERO_ACTIVE_ADMINS');
  if (!after.superadmins) fail('NO_ACTIVE_ROLE_MANAGER');
  for (const row of before.evaluated.filter(item => item.access)) {
    if (!after.evaluated.find(item => item.uid === row.uid)?.access) fail('EXISTING_USER_LOCKOUT');
  }
  for (const uid of requiredUids) {
    if (!after.evaluated.find(item => item.uid === uid)?.access) fail('CONFIRMED_USER_LOCKOUT');
  }
}

export function buildMigration(plan, state) {
  validatePlan(plan);
  const next = new Map(state.documents);
  const changes = [];
  const rows = [];
  for (const assignment of plan.assignments) {
    const user = assertIdentity(assignment, state.users);
    const current = state.documents.get(assignment.email);
    const data = current?.data || {};
    assertReversible(data);
    if ((data.uid && data.uid !== assignment.uid) || (data.email && data.email !== assignment.email)) fail('DOCUMENT_IDENTITY_CONFLICT');
    const desired = {email: assignment.email, uid: assignment.uid, role: assignment.role, status: assignment.status};
    const patch = Object.fromEntries(AUTHORIZATION_FIELDS.filter(name => data[name] !== desired[name]).map(name => [name, desired[name]]));
    if (Object.keys(patch).length) changes.push({label: assignment.label, email: assignment.email, uid: assignment.uid,
      kind: current ? 'update' : 'create', version: current?.version || null,
      beforeFields: fields(data), patch, afterFields: fields({...data, ...patch})});
    next.set(assignment.email, {data: {...data, ...patch}});
    rows.push({user: assignment.label, current: {active: !user.disabled, role: data.role || null,
      roleActive: data.status === 'active', permissions: data.role && data.status === 'active' && ROLES.includes(data.role) ? permissions(data.role) : 'Sin autorización explícita'},
      proposed: {active: true, role: assignment.role, roleActive: true, permissions: permissions(assignment.role)},
      changes: Object.keys(patch)});
  }
  const before = accessSummary(state.users, state.documents);
  const after = accessSummary(state.users, next);
  assertSafety(before, after, plan.assignments.map(item => item.uid));
  return {rows, changes, admins: after.admins, superadmins: after.superadmins, lockout: false};
}

export function createBackup(plan, migration) {
  return {version: 1, type: 'authorization-migration-backup', project: plan.project,
    createdAt: new Date().toISOString(), planHash: digest(plan), entries: migration.changes};
}

export function validateBackup(backup) {
  if (backup?.version !== 1 || backup.type !== 'authorization-migration-backup' || backup.project !== AUTHORIZATION_PROJECT
    || !Array.isArray(backup.entries) || backup.entries.length > 2 || !/^[a-f0-9]{64}$/.test(backup.planHash || '')) fail('BACKUP_INVALID');
  const emails = new Set();
  for (const entry of backup.entries) {
    if (!['U-003', 'U-006'].includes(entry.label) || typeof entry.email !== 'string'
      || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(entry.email) || emails.has(entry.email)
      || typeof entry.uid !== 'string' || !entry.uid || !['create', 'update'].includes(entry.kind)) fail('BACKUP_ENTRY_INVALID');
    emails.add(entry.email);
    for (const name of ['beforeFields', 'afterFields']) {
      if (!entry[name] || Object.keys(entry[name]).length !== AUTHORIZATION_FIELDS.length) fail('BACKUP_FIELDS_INVALID');
      for (const field of AUTHORIZATION_FIELDS) {
        const value = entry[name][field];
        if (!value || typeof value.exists !== 'boolean' || (value.exists && typeof value.value !== 'string')) fail('BACKUP_FIELD_VALUE_INVALID');
      }
    }
    if (!entry.patch || !Object.keys(entry.patch).length || Object.keys(entry.patch).some(name => !AUTHORIZATION_FIELDS.includes(name))) fail('BACKUP_PATCH_INVALID');
    for (const name of AUTHORIZATION_FIELDS) {
      const expected = Object.hasOwn(entry.patch, name) ? {exists: true, value: entry.patch[name]} : entry.beforeFields[name];
      if (!equal(expected, entry.afterFields[name])) fail('BACKUP_PATCH_MISMATCH');
    }
    if (entry.afterFields.email.value !== entry.email || entry.afterFields.uid.value !== entry.uid
      || entry.afterFields.status.value !== 'active' || !ROLES.includes(entry.afterFields.role.value)
      || (entry.kind === 'create' && AUTHORIZATION_FIELDS.some(name => entry.beforeFields[name].exists))) fail('BACKUP_IDENTITY_MISMATCH');
  }
}

export function buildRollback(backup, state) {
  validateBackup(backup);
  const next = new Map(state.documents);
  const changes = [];
  for (const entry of backup.entries) {
    assertIdentity(entry, state.users);
    const current = state.documents.get(entry.email);
    const data = current?.data || {};
    if ((entry.kind === 'create' && !current) || (entry.kind === 'update' && current && equal(fields(data), entry.beforeFields))) continue;
    if (!current || !equal(fields(data), entry.afterFields)) fail('ROLLBACK_CONCURRENT_FIELD_CHANGE');
    if (entry.kind === 'create') {
      if (Object.keys(data).some(name => !AUTHORIZATION_FIELDS.includes(name))) fail('ROLLBACK_NEW_DOCUMENT_HAS_OTHER_DATA');
      next.delete(entry.email);
      changes.push({...entry, kind: 'delete-created', version: current.version});
    } else {
      const restored = {...data};
      const restore = {};
      for (const name of Object.keys(entry.patch)) {
        restore[name] = entry.beforeFields[name];
        if (restore[name].exists) restored[name] = restore[name].value;
        else delete restored[name];
      }
      next.set(entry.email, {data: restored});
      changes.push({...entry, kind: 'restore-fields', version: current.version, restore});
    }
  }
  // Restoring the original empty role collection would lock out the new system.
  // Require an independent valid admin AND role manager before any restoration.
  const after = accessSummary(state.users, next);
  if (changes.length && (!after.admins || !after.superadmins)) fail('ROLLBACK_WOULD_REMOVE_LAST_ADMIN_OR_ROLE_MANAGER');
  return {changes, admins: after.admins, superadmins: after.superadmins, lockout: false};
}

export async function executeMigration({plan, store, dryRun = true, saveBackup}) {
  const state = await store.read();
  const migration = buildMigration(plan, state);
  if (dryRun || !migration.changes.length) return {...migration, applied: false};
  if (!saveBackup) fail('BACKUP_REQUIRED');
  const backup = createBackup(plan, migration);
  const backupPath = await saveBackup(backup);
  if (!backupPath) fail('BACKUP_NOT_SAVED');
  // Auth has no transaction shared with Firestore. Recheck just before commit.
  const fresh = await store.read();
  const rechecked = buildMigration(plan, fresh);
  if (!equal(migration.changes, rechecked.changes)) fail('STATE_CHANGED_AFTER_BACKUP');
  await store.commit(migration.changes, versions(fresh));
  return {...migration, applied: true, backupPath};
}

export async function executeRollback({backup, store, dryRun = true, saveBackup}) {
  const rollback = buildRollback(backup, await store.read());
  if (dryRun || !rollback.changes.length) return {...rollback, applied: false};
  if (!saveBackup || !await saveBackup({version: 1, type: 'authorization-rollback-safety-copy',
    project: backup.project, createdAt: new Date().toISOString(), entries: rollback.changes})) fail('ROLLBACK_SAFETY_COPY_REQUIRED');
  const freshState = await store.read();
  const fresh = buildRollback(backup, freshState);
  if (!equal(rollback.changes, fresh.changes)) fail('STATE_CHANGED_BEFORE_ROLLBACK');
  await store.commit(rollback.changes, versions(freshState));
  return {...rollback, applied: true};
}
