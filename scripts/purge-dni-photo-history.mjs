import {getAdminDb} from '../netlify/functions/_firebaseAdmin.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const applyChanges = process.argv.includes('--apply');

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

async function main() {
  const db = getAdminDb();
  const base = baseRef(db);
  const history = base.collection('dniFotosConsultas');
  const counter = base.collection('configuracion').doc('dniFotosStats');
  const [historyCountSnapshot, counterSnapshot] = await Promise.all([
    history.count().get(),
    counter.get(),
  ]);
  const historyDocuments = Number(historyCountSnapshot.data().count || 0);
  const counterExists = counterSnapshot.exists;

  if (applyChanges) {
    await db.recursiveDelete(history);
    await counter.delete();
  }

  process.stdout.write(`${JSON.stringify({
    mode: applyChanges ? 'applied' : 'dry-run',
    historyDocuments,
    counterExists,
  }, null, 2)}\n`);
  if (!applyChanges) {
    process.stdout.write('No se elimino ningun documento. Usa --apply solo en el entorno autorizado.\n');
  }
}

main().catch(error => {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
});
