import {existsSync} from 'node:fs';
import {mkdir, open, writeFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
import {createHash} from 'node:crypto';
import {getAdminDb} from '../netlify/functions/_firebaseAdmin.mjs';
import {baseRef} from '../netlify/functions/_roles.mjs';
import {exportCompleteBackup} from '../src/services/completeBackup.js';
import {encodeFirestore, exportFirestoreTree} from './release-backup-core.mjs';

if (existsSync('.env')) loadEnvFile('.env');
const timeout = setTimeout(() => {console.error('BACKUP_TIMEOUT: FAIL; no production writes'); process.exit(1);}, 600000);
try {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('PRODUCTION_BACKUP_REQUIRES_PRODUCTION');
  const db = getAdminDb();
  db.settings({useBigInt: true});
  if (db.projectId !== 'comunicate-tacna') throw new Error('UNEXPECTED_PROJECT');
  const base = baseRef(db);
  const operational = await exportCompleteBackup({
    backupCount: async name => Number((await base.collection(name).count().get()).data().count),
    backupPage: async (name, size, cursor) => {
      let query = base.collection(name).orderBy('__name__').limit(size);
      if (cursor) query = query.startAfter(cursor);
      return query.get();
    },
  });
  const tree = await exportFirestoreTree(db, 500, progress => console.error(`BACKUP_PROGRESS ${JSON.stringify(progress)}`));
  for (const [name, counts] of Object.entries(operational.verification.counts)) {
    if ((tree.collections.find(item => item.path === `${base.path}/${name}`)?.exported || 0) !== counts.exported) throw new Error('OPERATIONAL_BACKUP_CHANGED');
  }
  const timestamp = new Date().toISOString();
  const file = `firestore-full-${Date.now()}.json`;
  const directory = '.netlify/release-backup';
  await mkdir(directory, {recursive: true, mode: 0o700});
  const data = JSON.stringify({version: 1, project: db.projectId, timestamp, scope: 'all-firestore-collections-and-subcollections',
    operational: encodeFirestore(operational), entries: tree.entries, collections: tree.collections});
  const handle = await open(`${directory}/${file}`, 'wx', 0o600);
  try {await handle.writeFile(data); await handle.sync();} finally {await handle.close();}
  const hash = value => createHash('sha256').update(value).digest('hex');
  const labels = new Set(['clientes', 'equipos', 'registros', 'ventas', 'userRoles', 'configuracion', 'auditEvents', 'rateLimits', 'imeiLocks', 'legalConsent', 'solicitudesPublicas']);
  const evidence = {status: 'PASS', project: db.projectId, scope: 'all-firestore-collections-and-subcollections', timestamp, file,
    sha256: hash(data), documents: tree.entries.length, operationalCounts: operational.verification.counts,
    collections: tree.collections.map(item => ({pathHash: hash(item.path),
      label: labels.has(item.path.split('/').at(-1)) ? item.path.split('/').at(-1) : 'otra colección',
      expected: item.expected, exported: item.exported, final: item.final, pages: item.pages}))};
  await writeFile(`${directory}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await mkdir('.netlify/release-backup', {recursive: true, mode: 0o700});
  await writeFile('.netlify/release-backup/error-private.json', JSON.stringify({name: error.name, code: error.code, message: error.message, stack: error.stack}), {mode: 0o600});
  console.error(`BACKUP: FAIL (${/^BACKUP_|^OPERATIONAL_|^UNEXPECTED_|^PRODUCTION_/.test(error.message) ? error.message : 'READ_OR_EXPORT_FAILED'}; code=${error.code ?? 'unknown'}); no production writes`);
  // Pending read RPCs must not keep a failed export running in the background.
  process.exit(1);
} finally {clearTimeout(timeout);}
