import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {getAdminAuth, getAdminDb} from '../netlify/functions/_firebaseAdmin.mjs';
import {baseRef, normalizeEmail, normalizeRole, normalizeStatus} from '../netlify/functions/_roles.mjs';

// This module only lists Auth identities and reads Firestore/rules. Never calls
// protected handlers: their distributed rate limiter can write to production.
export function evaluateAccount(user, assignments) {
  const email = String(user.email || '');
  const assignment = assignments.get(normalizeEmail(email));
  const exact = assignments.get(email);
  const role = normalizeRole(assignment?.role);
  const active = !user.disabled && user.emailVerified === true && Boolean(email);
  const roleActive = normalizeStatus(assignment?.status) === 'active' && Boolean(role);
  const rulesAllow = exact?.status === 'active' && ['usuario', 'admin', 'superadmin'].includes(exact?.role);
  const access = active && roleActive && rulesAllow;
  return {role: role || 'SIN ROL VÁLIDO', userActive: !user.disabled,
    verified: user.emailVerified === true, roleActive, access,
    admin: access && ['admin', 'superadmin'].includes(role),
    superadmin: access && role === 'superadmin',
    reason: !active ? 'Identidad desactivada, sin email o no verificada'
      : !assignment ? 'Falta documento userRoles' : !roleActive ? 'Rol/estado inválido o desactivado'
        : !rulesAllow ? 'Email o valores no coinciden exactamente con Rules' : 'Compatible',
    classification: access ? 'OK' : active ? 'RIESGO DE LOCKOUT' : 'REQUIERE CORRECCIÓN'};
}

export async function auditAuthorizations() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('PRECHECK_PRODUCTION_REQUIRED: emulator variables must be unset');
  }
  const auth = getAdminAuth();
  const db = getAdminDb();
  const project = db.projectId;
  if (project !== 'comunicate-tacna') throw new Error('UNEXPECTED_FIREBASE_PROJECT');
  const users = [];
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    users.push(...page.users);
    token = page.pageToken;
  } while (token);
  const assignments = new Map();
  let cursor;
  do {
    let query = baseRef(db).collection('userRoles').orderBy('__name__').limit(1000);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) assignments.set(doc.id, {role: doc.get('role'), status: doc.get('status')});
    cursor = page.size === 1000 ? page.docs.at(-1) : undefined;
  } while (cursor);
  users.sort((a, b) => normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)));
  const rows = users.map((user, index) => ({user: `U-${String(index + 1).padStart(3, '0')}`,
    ...evaluateAccount(user, assignments)}));
  let deployedRules = {status: 'NO VERIFICADO'};
  try {
    const credential = await auth.app.options.credential.getAccessToken();
    const read = async url => {
      const response = await fetch(url, {headers: {Authorization: `Bearer ${credential.access_token}`}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.json();
    };
    const release = await read(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
    const rules = await read(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
    const source = (rules.source?.files || []).map(file => file.content).join('\n');
    const baseline = execFileSync('git', ['show', 'aabd2bd:firestore.rules'], {encoding: 'utf8'});
    const normalize = value => value.replace(/\r\n/g, '\n').trim();
    const matchesBaseline = normalize(source) === normalize(baseline);
    // Report fingerprints only; live rules may contain private email allowlists.
    deployedRules = {status: 'VERIFICADO', ruleset: release.rulesetName, matchesBaseline,
      sha256: createHash('sha256').update(source).digest('hex'),
      matchesLocal: normalize(source) === normalize(await (await import('node:fs/promises')).readFile('firestore.rules', 'utf8'))};
    const knownLegacyRules = deployedRules.sha256 === '4ea7dd18938b5762e5aac9629d3361ae1fbc92595c7edc8dbf3c18538c2e80e5';
    deployedRules.knownLegacyAllowlist = knownLegacyRules;
    if (matchesBaseline || knownLegacyRules) {
      const allowedBlock = source.match(/function isAllowedUser\(\)\s*\{([^}]+)\}/)?.[1] || '';
      const legacyEmails = [...allowedBlock.matchAll(/'([^'\s]+@[^'\s]+)'/g)].map(match => match[1]);
      for (let index = 0; index < users.length; index += 1) {
        const user = users[index];
        const assignment = assignments.get(user.email);
        const rankAllowed = assignment?.status === 'active' && ['usuario', 'admin', 'superadmin'].includes(assignment?.role);
        rows[index].currentRulesAccess = !user.disabled && user.emailVerified && (legacyEmails.includes(user.email) || (matchesBaseline && rankAllowed));
        rows[index].classification = rows[index].access ? 'OK' : rows[index].currentRulesAccess
          ? 'RIESGO DE LOCKOUT' : 'REQUIERE CORRECCIÓN';
      }
    } else if (deployedRules.matchesLocal) {
      for (const row of rows) row.currentRulesAccess = row.access;
    }
  } catch (error) {
    deployedRules.reason = /^HTTP_\d+$/.test(error.message) ? error.message : 'RULES_READ_UNAVAILABLE';
  }
  const knownEmails = new Set(users.map(user => normalizeEmail(user.email)));
  return {timestamp: new Date().toISOString(), project, users: rows.length,
    roleDocuments: assignments.size, activeUsers: rows.filter(row => row.userActive && row.verified).length,
    activeRoles: rows.filter(row => row.roleActive).length,
    admins: rows.filter(row => row.admin).length, superadmins: rows.filter(row => row.superadmin).length,
    orphanAssignments: [...assignments.keys()].filter(email => !knownEmails.has(email)).length,
    rows, deployedRules,
    currentAccessComparison: (deployedRules.matchesBaseline || deployedRules.knownLegacyAllowlist || deployedRules.matchesLocal) ? 'SIMULACIÓN ESTÁTICA de Rules desplegadas; sin sesiones productivas'
      : 'NO VERIFICADO: política desplegada sin equivalencia conocida; sin sesiones productivas'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deadline = setTimeout(() => {console.error('AUDIT_TIMEOUT'); process.exit(1);}, 60000);
  try {console.log(JSON.stringify(await auditAuthorizations(), null, 2));}
  catch {console.error('AUTHORIZATION_AUDIT_FAILED (no credential values logged)'); process.exitCode = 1;}
  finally {clearTimeout(deadline);}
}
