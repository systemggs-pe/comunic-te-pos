import {FieldPath} from 'firebase-admin/firestore';
import {getAdminDb} from '../netlify/functions/_firebaseAdmin.mjs';
import {
  buildClienteSearchTerms,
  buildEquipoSearchTerms,
  buildMovimientoSearchTerms,
} from '../netlify/functions/_searchIndex.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const PAGE_SIZE = 200;
const WRITE_BATCH_SIZE = 400;
const applyChanges = process.argv.includes('--apply');

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

async function readAll(collectionRef) {
  const docs = [];
  let cursor = null;
  for (;;) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const snapshot = await pageQuery.get();
    docs.push(...snapshot.docs);
    if (snapshot.size < PAGE_SIZE) break;
    cursor = snapshot.docs.at(-1);
  }
  return docs;
}

async function commitUpdates(db, updates) {
  if (!applyChanges) return;
  for (let index = 0; index < updates.length; index += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    updates.slice(index, index + WRITE_BATCH_SIZE).forEach(update => {
      batch.set(update.ref, update.data, {merge: true});
    });
    await batch.commit();
  }
}

async function main() {
  const db = getAdminDb();
  const base = baseRef(db);
  const [clientesDocs, equiposDocs, ventasDocs, registrosDocs] = await Promise.all([
    readAll(base.collection('clientes')),
    readAll(base.collection('equipos')),
    readAll(base.collection('ventas')),
    readAll(base.collection('registros')),
  ]);

  const nombres = new Map(clientesDocs.map(doc => {
    const data = doc.data() || {};
    return [String(data.dni || doc.id).trim(), String(data.nombre || '').trim()];
  }));
  const updates = [];

  clientesDocs.forEach(doc => {
    const data = doc.data() || {};
    const dni = String(data.dni || doc.id).trim();
    const normalized = {...data, dni};
    updates.push({ref: doc.ref, data: {dni, searchTerms: buildClienteSearchTerms(normalized)}});
  });

  equiposDocs.forEach(doc => {
    const data = doc.data() || {};
    const normalized = {...data, idEquipo: data.idEquipo || doc.id};
    updates.push({
      ref: doc.ref,
      data: {searchTerms: buildEquipoSearchTerms(normalized, nombres.get(String(data.idDuenio || '').trim()) || '')},
    });
  });

  ventasDocs.forEach(doc => {
    const data = doc.data() || {};
    const nombreCliente = String(data.nombreCliente || nombres.get(String(data.dniCliente || '').trim()) || '').trim();
    updates.push({
      ref: doc.ref,
      data: {nombreCliente, searchTerms: buildMovimientoSearchTerms(data, nombreCliente)},
    });
  });

  registrosDocs.forEach(doc => {
    const data = doc.data() || {};
    const nombreCliente = String(data.nombreCliente || nombres.get(String(data.dniCliente || '').trim()) || '').trim();
    updates.push({
      ref: doc.ref,
      data: {nombreCliente, searchTerms: buildMovimientoSearchTerms(data, nombreCliente)},
    });
  });

  await commitUpdates(db, updates);
  const summary = {
    mode: applyChanges ? 'applied' : 'dry-run',
    clientes: clientesDocs.length,
    equipos: equiposDocs.length,
    ventas: ventasDocs.length,
    registros: registrosDocs.length,
    writes: updates.length,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!applyChanges) process.stdout.write('No se escribio ningun documento. Usa --apply solo en el entorno autorizado.\n');
}

main().catch(error => {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
});
