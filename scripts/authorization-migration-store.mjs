import {open, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {getAdminAuth, getAdminDb} from '../netlify/functions/_firebaseAdmin.mjs';
import {baseRef} from '../netlify/functions/_roles.mjs';
import {AUTHORIZATION_PROJECT} from './authorization-migration-core.mjs';

const version = snap => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : null;
export function createStore(db, auth) {
  const collection = baseRef(db).collection('userRoles');
  return {
    async read() {
      const users = [];
      let pageToken;
      do {
        const page = await auth.listUsers(1000, pageToken);
        users.push(...page.users.map(user => ({uid: user.uid, email: user.email, disabled: user.disabled, emailVerified: user.emailVerified})));
        pageToken = page.pageToken;
      } while (pageToken);
      const documents = new Map();
      let cursor;
      do {
        let query = collection.orderBy('__name__').limit(1000);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        for (const doc of page.docs) documents.set(doc.id, {data: doc.data(), version: version(doc)});
        cursor = page.size === 1000 ? page.docs.at(-1) : undefined;
      } while (cursor);
      return {users, documents};
    },
    async commit(changes, stateVersions) {
      await db.runTransaction(async transaction => {
        // Reading the entire authorization collection detects concurrent changes
        // to both target documents and other admins (including phantom inserts).
        const all = await transaction.get(collection);
        const snapshot = new Map(all.docs.map(doc => [doc.id, doc]));
        for (const change of changes) {
          const current = snapshot.get(change.email);
          if ((change.kind === 'create' && current) || (change.kind !== 'create' && (!current || version(current) !== change.version))) {
            throw new Error('ABORT MIGRATION: CONCURRENT_DOCUMENT_CHANGE');
          }
        }
        // The query alone is insufficient to protect precomputed admin counts:
        // include a fingerprint of all role versions in the expected state below.
        if (!stateVersions || JSON.stringify([...snapshot].map(([id, doc]) => [id, version(doc)]).sort()) !== stateVersions) {
          throw new Error('ABORT MIGRATION: CONCURRENT_AUTHORIZATION_CHANGE');
        }
        for (const change of changes) {
          const ref = collection.doc(change.email);
          if (change.kind === 'create') transaction.create(ref, change.patch);
          else if (change.kind === 'update') transaction.update(ref, change.patch);
          else if (change.kind === 'delete-created') transaction.delete(ref);
          else if (change.kind === 'restore-fields') transaction.update(ref, Object.fromEntries(Object.entries(change.restore)
            .map(([name, prior]) => [name, prior.exists ? prior.value : FieldValue.delete()])));
          else throw new Error('ABORT MIGRATION: CHANGE_KIND_INVALID');
        }
      });
    },
  };
}

export function productionStore() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('ABORT MIGRATION: EMULATOR_ENV_NOT_ALLOWED_FOR_PRODUCTION_CLI');
  const db = getAdminDb();
  if (db.projectId !== AUTHORIZATION_PROJECT) throw new Error('ABORT MIGRATION: UNEXPECTED_PROJECT');
  return createStore(db, getAdminAuth());
}

export async function savePrivateBackup(backup) {
  const directory = resolve('.netlify/authorization-migration/backups');
  await mkdir(directory, {recursive: true, mode: 0o700});
  const path = resolve(directory, `${backup.type}-${Date.now()}-${randomUUID()}.json`);
  const file = await open(path, 'wx', 0o600);
  try {await file.writeFile(`${JSON.stringify(backup, null, 2)}\n`); await file.sync();}
  finally {await file.close();}
  return path;
}
