import {existsSync, readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {executeMigration, createBackup, digest} from './authorization-migration-core.mjs';
import {productionStore, savePrivateBackup} from './authorization-migration-store.mjs';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const allowed = new Set(['--dry-run', '--apply', '--plan', '--confirm-plan', '--prepare-backup']);
let mode = 'DRY RUN';
const timeout = setTimeout(() => {console.error('ABORT MIGRATION: TIMEOUT'); process.exit(1);}, 60000);
try {
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!allowed.has(name)) throw new Error('ABORT MIGRATION: UNKNOWN_ARGUMENT');
    if (['--plan', '--confirm-plan'].includes(name)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('ABORT MIGRATION: ARGUMENT_VALUE_MISSING');
      index += 1;
    }
  }
  if (args.includes('--apply') && (args.includes('--dry-run') || args.includes('--prepare-backup'))) throw new Error('ABORT MIGRATION: CONFLICTING_MODES');
  if (existsSync('.env')) loadEnvFile('.env');
  const plan = JSON.parse(readFileSync(value('--plan') || '.netlify/authorization-migration/plan.json', 'utf8'));
  const dryRun = !args.includes('--apply');
  mode = dryRun ? 'DRY RUN' : 'APPLY';
  const planHash = digest(plan);
  if (!dryRun && value('--confirm-plan') !== planHash) throw new Error('ABORT MIGRATION: EXACT_PLAN_CONFIRMATION_REQUIRED');
  const migration = await executeMigration({plan, store: productionStore(), dryRun, saveBackup: savePrivateBackup});
  console.log(`AUTHORIZATION MIGRATION ${mode}`);
  for (const row of migration.rows) {
    console.log(`USER: ${row.user}\nCURRENT:\n- active: ${row.current.active}\n- role: ${row.current.role || 'AUSENTE'}\n- role active: ${row.current.roleActive}\n- permissions: ${row.current.permissions}`);
    console.log(`PROPOSED:\n- active: ${row.proposed.active}\n- role: ${row.proposed.role}\n- role active: ${row.proposed.roleActive}\n- permissions: ${row.proposed.permissions}\nCHANGES:\n- ${row.changes.join(', ') || 'NINGUNO'}`);
  }
  console.log('ROLES TO CREATE: Ningún catálogo; dos asignaciones userRoles confirmadas');
  for (const kind of ['create', 'update']) console.log(`DOCUMENTS TO ${kind === 'create' ? 'CREATE' : 'MODIFY'}: ${migration.changes.filter(change => change.kind === kind).map(change => `${change.label} -> artifacts/comunicate-pos/users/shared/userRoles/<email-${change.label}>`).join('; ') || 'NINGUNO'}`);
  console.log(`LOCKOUT AFTER MIGRATION: NO\nADMIN VALID AFTER MIGRATION: YES (${migration.admins}; superadmin: ${migration.superadmins})\nPLAN SHA256: ${planHash}\nPRODUCTION WRITES: ${migration.applied ? 'YES' : 'NO'}`);
  if (args.includes('--prepare-backup')) {
    const path = await savePrivateBackup(createBackup(plan, migration));
    console.log(`READ-ONLY BACKUP PREVIEW: ${path}\nApply always takes a fresh backup; this preview does not authorize writing.`);
  }
  if (migration.backupPath) console.log(`BACKUP: ${migration.backupPath}`);
} catch (error) {
  console.error(error.message?.startsWith('ABORT MIGRATION:') ? error.message : `ABORT MIGRATION: ${mode}_FAILED (no secrets logged)`);
  process.exitCode = 1;
} finally {clearTimeout(timeout);}
