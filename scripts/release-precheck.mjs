import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {auditAuthorizations} from './release-authorization.mjs';

// No production mutations. Child commands are only the repository's local tests/build.
if (existsSync('.env')) loadEnvFile('.env');
const checks = [];
const check = (name, pass, reason = '') => {checks.push({name, pass, reason}); console.log(`${name}: ${pass ? 'PASS' : 'FAIL'}${reason ? ` — ${reason}` : ''}`);};
console.log('RELEASE PRECHECK');
const credentialNames = process.env.FIREBASE_SERVICE_ACCOUNT ? ['FIREBASE_SERVICE_ACCOUNT']
  : ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const required = [...credentialNames, 'RENIEC_TOKEN', 'GEMINI_API_KEY', 'ALLOWED_ORIGINS'];
const missing = required.filter(name => !process.env[name]);
check('Variables locales', !missing.length, missing.length ? `Faltan: ${missing.join(', ')}` : 'Solo presencia; valores no mostrados');
try {
  const timer = setTimeout(() => {console.error('Firebase: TIMEOUT; READY FOR RELEASE: NO'); process.exit(1);}, 60000);
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
try {
  const artifact = JSON.parse(readFileSync('.netlify/release-artifacts/manifest.json', 'utf8'));
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  check('API usuarios / artefacto Netlify', artifact.functions.includes('usuarios') && artifact.inputs.every(file => hash(file.path) === file.sha256)
    && hash('.netlify/release-artifacts/usuarios.zip') === artifact.usuariosSha256, 'ZIP local vigente; no publicado');
} catch {check('API usuarios / artefacto Netlify', false, 'Ejecutar release:package con el empaquetador Netlify indicado en RELEASE_CHECKLIST');}
for (const name of ['test', 'build']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', name], {stdio: 'ignore', timeout: 180000});
  check(name === 'test' ? 'Tests' : 'Build', !result.error && result.status === 0, 'Ejecutado en esta comprobación; detalles en npm run verify');
}
// Attestations must be entered by the operator after real checks, never generated
// by this script. They do not authorize or perform a deploy.
let gates = {};
try {gates = JSON.parse(readFileSync('.netlify/release-gates.json', 'utf8'));} catch { /* Fail closed below. */ }
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const fresh = Date.now() - Date.parse(gates.checkedAt) >= 0 && Date.now() - Date.parse(gates.checkedAt) < 86400000;
const matching = gates.packageSha256 === hash('package-lock.json') && gates.rulesSha256 === hash('firestore.rules');
const operational = ['firestoreBackup', 'productionEnvironment', 'googleAuth', 'productionRollback'];
check('Gates operativos de producción', fresh && matching && operational.every(name => gates[name]?.verified === true && Boolean(gates[name]?.evidence)),
  'MANUAL TEST REQUIRED: constancias del operador (<24h), backup completo, variables Netlify, Google Auth y rollback; ver RELEASE_CHECKLIST');
const ready = checks.every(item => item.pass);
console.log(`READY FOR RELEASE: ${ready ? 'YES' : 'NO'}`);
for (const item of checks.filter(item => !item.pass)) console.log(`RAZÓN: ${item.name} — ${item.reason || 'Comprobación fallida'}`);
process.exitCode = ready ? 0 : 1;
