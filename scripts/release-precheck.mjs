import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {auditAuthorizations} from './release-authorization.mjs';
import {inspectArtifact, inspectBackup, manualCheck, readiness, fileHash} from './release-readiness.mjs';

// No production mutations. Child commands are only the repository's local tests/build.
if (existsSync('.env')) loadEnvFile('.env');
const checks = [];
const check = (name, pass, reason = '') => {
  const status = typeof pass === 'string' ? pass : pass ? 'PASS' : 'FAIL';
  checks.push({name, status, reason});
  console.log(`${name}: ${status}${reason ? ` — ${reason}` : ''}`);
};
console.log('RELEASE PRECHECK');
const credentialNames = process.env.FIREBASE_SERVICE_ACCOUNT ? ['FIREBASE_SERVICE_ACCOUNT']
  : ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const required = [...credentialNames, 'RENIEC_TOKEN', 'GEMINI_API_KEY', 'ALLOWED_ORIGINS'];
const missing = required.filter(name => !process.env[name]);
check('Variables locales', !missing.length, missing.length ? `Faltan: ${missing.join(', ')}` : 'Solo presencia; valores no mostrados');
try {
  const timer = setTimeout(() => {console.error('Firebase: TIMEOUT; TECHNICAL CHECKS: FAIL; READY FOR DEPLOY: NO'); process.exit(1);}, 60000);
  let audit;
  try {audit = await auditAuthorizations();} finally {clearTimeout(timer);}
  check('Firebase', true, `Lectura de Auth y Firestore: ${audit.users} identidades, ${audit.roleDocuments} asignaciones`);
  check('Usuarios activos', audit.activeUsers > 0, `${audit.activeUsers} habilitados y verificados`);
  check('Roles activos', audit.activeRoles > 0, `${audit.activeRoles} asignaciones reconocidas activas`);
  check('Administrador válido', audit.admins > 0, `${audit.admins} con acceso simultáneo a API y Rules`);
  check('Superadministrador de recuperación', audit.superadmins > 0, `${audit.superadmins}; requerido para gestionar /api/usuarios`);
  const blocked = audit.rows.filter(row => row.currentRulesAccess && !row.access);
  const knownPolicy = audit.deployedRules.matchesBaseline || audit.deployedRules.knownLegacyAllowlist || audit.deployedRules.matchesLocal;
  check('Conservación de acceso', knownPolicy && !blocked.length,
    knownPolicy ? `${blocked.length} identidades perderían acceso directo` : 'Comparación de política productiva no verificada');
} catch {check('Firebase', false, 'Lectura no disponible; revisar configuración/IAM sin publicar credenciales');}
const config = readFileSync('netlify.toml', 'utf8');
const routes = ['analizarCajaGemini', 'reniec', 'dniFotos', 'clientes', 'comprobanteApple', 'legalConsent', 'registros', 'solicitudesPublicas', 'usuarios', 'ventas'];
const routing = routes.every(name => {
  const block = config.split('[[redirects]]').find(part => part.includes(`from = "/api/${name}"`));
  return block?.includes(`to = "/.netlify/functions/${name}"`) && block.includes('status = 200')
    && config.indexOf(`from = "/api/${name}"`) < config.indexOf('from = "/*"') && existsSync(`netlify/functions/${name}.mjs`);
});
check('Netlify / rutas API', routing && config.includes('directory = "netlify/functions"') && config.includes('node_bundler = "esbuild"') && config.includes('publish = "dist"'));
const rules = readFileSync('firestore.rules', 'utf8');
check('Configuración de permisos', rules.includes("data.status == 'active'") && !rules.includes('request.auth.token.email in [') && !rules.includes("request.auth.token.email == '"), 'Comprobación estática complementada por test:rules');
const artifact = inspectArtifact();
check('API usuarios / artefacto Netlify', artifact.status, artifact.detail);
const backup = inspectBackup();
check('Backup completo', backup.status, backup.detail);
for (const name of ['test', 'build']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', name], {stdio: 'ignore', timeout: 180000});
  check(name === 'test' ? 'Tests' : 'Build', !result.error && result.status === 0, 'Ejecutado en esta comprobación; detalles en npm run verify');
}
// Attestations must be entered by the operator after real checks, never generated
// by this script. They do not authorize or perform a deploy.
let gates = {};
try {gates = JSON.parse(readFileSync('.netlify/release-gates.json', 'utf8'));} catch { /* Fail closed below. */ }
const hashes = {package: fileHash('package-lock.json'), rules: fileHash('firestore.rules')};
for (const [name, title] of [['productionEnvironment', 'Netlify variables'], ['googleAuth', 'Google Auth'], ['productionRollback', 'Rollback productivo']]) {
  const result = manualCheck(gates, name, hashes);
  check(title, result.status, result.detail);
}
const result = readiness(checks);
console.log(`TECHNICAL CHECKS: ${result.technical}\nMANUAL CHECKS: ${result.manual}\nREADY FOR DEPLOY: ${result.ready}`);
for (const item of checks.filter(item => item.status !== 'PASS')) console.log(`${item.status === 'FAIL' ? 'RAZÓN' : 'PENDIENTE'}: ${item.name} — ${item.reason}`);
process.exitCode = result.exitCode;
