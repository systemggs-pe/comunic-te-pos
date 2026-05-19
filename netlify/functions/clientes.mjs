import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {withContactHistory} from './_clientesShared.mjs';
import {parseClienteUpdatePayload, parseDniPayload} from './_validators.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

async function hasAny(collectionRef, field, value, transaction) {
  const snap = await transaction.get(collectionRef.where(field, '==', value).limit(1));
  return !snap.empty;
}

async function updateCliente(db, payload) {
  const {cliente} = parseClienteUpdatePayload(payload);
  const ref = baseRef(db).collection('clientes').doc(cliente.dni);

  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const data = withContactHistory(current, cliente, {preservePrimary: false});
    transaction.set(ref, data, {merge: true});
    return {cliente: {id: cliente.dni, ...data}};
  });
}

async function deleteCliente(db, payload) {
  const {dni} = parseDniPayload(payload);
  const base = baseRef(db);
  const clienteRef = base.collection('clientes').doc(dni);
  const equiposRef = base.collection('equipos');
  const ventasRef = base.collection('ventas');
  const registrosRef = base.collection('registros');

  return db.runTransaction(async transaction => {
    const hasVentas = await hasAny(ventasRef, 'dniCliente', dni, transaction);
    const hasRegistros = await hasAny(registrosRef, 'dniCliente', dni, transaction);
    const equiposSnap = await transaction.get(equiposRef.where('idDuenio', '==', dni).limit(100));

    transaction.delete(clienteRef);
    if (!hasVentas && !hasRegistros) {
      equiposSnap.docs.forEach(doc => transaction.delete(doc.ref));
    }

    return {deleted: true};
  });
}

async function dispatchClientes(body) {
  const db = getAdminDb();
  const action = String(body?.action || '');
  if (action === 'update') return updateCliente(db, body);
  if (action === 'delete') return deleteCliente(db, body);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchClientes, {
  rateLimit: {name: 'clientes', max: 120, windowMs: 60 * 1000},
});
