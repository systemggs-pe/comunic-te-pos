import {existsSync, readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {executeRollback, digest} from './authorization-migration-core.mjs';
import {productionStore, savePrivateBackup} from './authorization-migration-store.mjs';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const timeout = setTimeout(() => {console.error('ABORT MIGRATION: TIMEOUT'); process.exit(1);}, 60000);
try {
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!['--backup', '--confirm-backup', '--dry-run', '--apply'].includes(name)) throw new Error('ABORT MIGRATION: UNKNOWN_ARGUMENT');
    if (['--backup', '--confirm-backup'].includes(name)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('ABORT MIGRATION: ARGUMENT_VALUE_MISSING');
      index += 1;
    }
  }
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('ABORT MIGRATION: CONFLICTING_MODES');
  if (!value('--backup')) throw new Error('ABORT MIGRATION: BACKUP_PATH_REQUIRED');
  if (existsSync('.env')) loadEnvFile('.env');
  const backup = JSON.parse(readFileSync(value('--backup'), 'utf8'));
  const dryRun = !args.includes('--apply');
  const backupHash = digest(backup);
  if (!dryRun && value('--confirm-backup') !== backupHash) throw new Error('ABORT MIGRATION: EXACT_BACKUP_CONFIRMATION_REQUIRED');
  const rollback = await executeRollback({backup, store: productionStore(), dryRun, saveBackup: savePrivateBackup});
  console.log(`AUTHORIZATION ROLLBACK ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  for (const change of rollback.changes) console.log(`${change.label}: ${change.kind}; ${change.kind === 'restore-fields' ? Object.keys(change.restore).join(', ') : 'solo documento creado por esta migración'}`);
  console.log(`CHANGES: ${rollback.changes.length}\nADMINS AFTER: ${rollback.admins}\nSUPERADMINS AFTER: ${rollback.superadmins}\nBACKUP SHA256: ${backupHash}\nPRODUCTION WRITES: ${rollback.applied ? 'YES' : 'NO'}`);
} catch (error) {
  console.error(error.message?.startsWith('ABORT MIGRATION:') ? error.message : 'ABORT MIGRATION: ROLLBACK_FAILED (no secrets logged)');
  process.exitCode = 1;
} finally {clearTimeout(timeout);}
