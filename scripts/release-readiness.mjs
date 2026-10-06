import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export const fileHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function inspectArtifact(root = '.') {
  try {
    const manifestPath = resolve(root, '.netlify/release-artifacts/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const mismatches = [];
    for (const file of manifest.inputs || []) {
      const actual = fileHash(resolve(root, file.path));
      if (actual !== file.sha256) mismatches.push({path: file.path, expected: file.sha256, actual});
    }
    const zipActual = fileHash(resolve(root, '.netlify/release-artifacts/usuarios.zip'));
    if (zipActual !== manifest.usuariosSha256) mismatches.push({path: 'usuarios.zip', expected: manifest.usuariosSha256, actual: zipActual});
    const pass = manifest.functions?.includes('usuarios') && manifest.inputs?.length > 0 && !mismatches.length;
    return {status: pass ? 'PASS' : 'FAIL', timestamp: manifest.timestamp, mismatches,
      detail: pass ? `ZIP y ${manifest.inputs.length} inputs coinciden; generado ${manifest.timestamp}`
        : `Artefacto desactualizado: ${mismatches.map(item => `${item.path} esperado=${item.expected} actual=${item.actual}`).join('; ') || 'manifest incompleto'}`};
  } catch {return {status: 'FAIL', detail: 'ZIP/manifest/inputs ausentes o ilegibles; ejecutar release:package'};}
}
export function inspectBackup(root = '.', now = Date.now()) {
  try {
    const evidence = JSON.parse(readFileSync(resolve(root, '.netlify/release-backup/evidence.json'), 'utf8'));
    const age = now - Date.parse(evidence.timestamp);
    const safePath = resolve(root, '.netlify/release-backup', evidence.file);
    if (evidence.file !== evidence.file?.split(/[\\/]/).at(-1)) throw new Error('UNSAFE_PATH');
    const pass = evidence.status === 'PASS' && evidence.scope === 'all-firestore-collections-and-subcollections'
      && evidence.project === 'comunicate-tacna' && age >= 0 && age < 86400000
      && evidence.collections.length > 0 && evidence.collections.every(item => item.expected === item.exported && item.final === item.expected)
      && fileHash(safePath) === evidence.sha256;
    return {status: pass ? 'PASS' : 'FAIL', detail: pass ? `Completo; ${evidence.documents} documentos; ${evidence.timestamp}; SHA256 ${evidence.sha256}`
      : 'Backup inválido, incompleto, checksum distinto o mayor de 24h'};
  } catch {
    try {
      const error = JSON.parse(readFileSync(resolve(root, '.netlify/release-backup/error-private.json'), 'utf8'));
      if (error.code === 8) return {status: 'FAIL', detail: 'Backup no completado: Firestore 8 RESOURCE_EXHAUSTED / Quota exceeded; revisar cuota antes de repetir'};
    } catch { /* No failure evidence available. */ }
    return {status: 'FAIL', detail: 'Falta backup completo verificable; ejecutar release:backup'};
  }
}
export function manualCheck(gates, name, hashes, now = Date.now()) {
  const age = now - Date.parse(gates.checkedAt);
  const matching = gates.packageSha256 === hashes.package && gates.rulesSha256 === hashes.rules;
  if (gates[name]?.result === 'FAIL') return {status: 'FAIL', detail: `Verificación ${name} declaró un fallo; requiere revisión`};
  if (age >= 0 && age < 86400000 && matching && gates[name]?.verified === true && gates[name]?.evidence) {
    return {status: 'PASS', detail: 'Constancia del operador vigente (<24h); no concede autorización de deploy'};
  }
  return {status: 'MANUAL REQUIRED', detail: `Sin constancia vigente de ${name}; ver FINAL_RELEASE_MANUAL_CHECKS.md`};
}
export function readiness(checks) {
  const fail = checks.some(item => item.status === 'FAIL');
  const pending = checks.some(item => item.status === 'MANUAL REQUIRED');
  return {technical: fail ? 'FAIL' : 'PASS', manual: pending ? 'PENDING' : 'COMPLETE',
    ready: fail ? 'NO' : pending ? 'CONDITIONAL' : 'YES', exitCode: fail ? 1 : pending ? 2 : 0};
}
