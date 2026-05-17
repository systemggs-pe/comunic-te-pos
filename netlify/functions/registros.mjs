import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {parseIdPayload, parseRegistroPayload} from './_validators.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

async function hasOther(collectionRef, field, value, excludeId, transaction) {
  const snap = await transaction.get(collectionRef.where(field, '==', value).limit(20));
  return snap.docs.some(doc => doc.id !== excludeId);
}

function getNextFromExisting(snapshot, field, prefix) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = snapshot.docs.reduce((highest, doc) => {
    const match = String(doc.data()?.[field] || '').match(pattern);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]) || 0);
  }, 0);
  return max + 1;
}

async function createRegistro(db, payload) {
  const {cliente, equipo, registro} = parseRegistroPayload(payload);
  const base = baseRef(db);
  const counterRef = db.collection('_counters').doc('registros');
  const registroRef = base.collection('registros').doc();
  const clienteRef = base.collection('clientes').doc(cliente.dni);
  const equipoRef = base.collection('equipos').doc(equipo.idEquipo);

  return db.runTransaction(async transaction => {
    const counterSnap = await transaction.get(counterRef);
    let next = Number(counterSnap.data()?.last || 0) + 1;
    if (!counterSnap.exists) {
      const existingSnap = await transaction.get(base.collection('registros'));
      next = Math.max(next, getNextFromExisting(existingSnap, 'nRegistro', 'RECO'));
    }
    const nRegistro = `RECO-${String(next).padStart(5, '0')}`;
    const registroData = {...registro, nRegistro};

    transaction.set(counterRef, {last: next, updatedAt: new Date().toISOString()}, {merge: true});
    transaction.set(clienteRef, cliente, {merge: true});
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(registroRef, registroData);

    return {id: registroRef.id, registro: {id: registroRef.id, ...registroData}};
  });
}

async function updateRegistro(db, payload) {
  const {id} = parseIdPayload(payload);
  const {cliente, equipo, registro} = parseRegistroPayload(payload);

  const base = baseRef(db);
  const registrosRef = base.collection('registros');
  const ventasRef = base.collection('ventas');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const registroRef = base.collection('registros').doc(id);
  const clienteRef = base.collection('clientes').doc(cliente.dni);
  const equipoRef = base.collection('equipos').doc(equipo.idEquipo);

  return db.runTransaction(async transaction => {
    const currentSnap = await transaction.get(registroRef);
    if (!currentSnap.exists) throw Object.assign(new Error('REGISTRO_NOT_FOUND'), {status: 404});
    const current = currentSnap.data() || {};
    const oldImei = current.imeiEquipo || '';
    const oldDni = current.dniCliente || '';
    const oldImeiChanged = oldImei && oldImei !== equipo.idEquipo;
    const oldDniChanged = oldDni && oldDni !== cliente.dni;
    let oldOtherRegistro = false;
    let oldHasVenta = false;
    let oldOtherEquipo = false;
    if (oldImeiChanged) {
      oldOtherRegistro = await hasOther(registrosRef, 'imeiEquipo', oldImei, id, transaction);
      oldHasVenta = await hasOther(ventasRef, 'imeiEquipo', oldImei, '', transaction);
    }
    if (oldDniChanged) {
      oldOtherEquipo = await hasOther(equiposRef, 'idDuenio', oldDni, oldImei, transaction);
    }
    const registroData = {...registro, nRegistro: current.nRegistro || registro.nRegistro || ''};

    if (oldImeiChanged && !oldOtherRegistro && !oldHasVenta) {
      transaction.delete(equiposRef.doc(oldImei));
    }
    if (oldDniChanged && !oldOtherEquipo) {
      transaction.delete(clientesRef.doc(oldDni));
    }
    transaction.set(clienteRef, cliente, {merge: true});
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(registroRef, registroData);

    return {id, registro: {id, ...registroData}};
  });
}

async function deleteRegistro(db, payload) {
  const {id} = parseIdPayload(payload);
  const base = baseRef(db);
  const registrosRef = base.collection('registros');
  const ventasRef = base.collection('ventas');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const registroRef = registrosRef.doc(id);

  return db.runTransaction(async transaction => {
    const registroSnap = await transaction.get(registroRef);
    if (!registroSnap.exists) return {deleted: true, missing: true};
    const registro = registroSnap.data() || {};
    const imei1 = registro.imeiEquipo || '';
    const dni = registro.dniCliente || '';

    let otherRegistro = false;
    let hasVenta = false;
    let otherEquipo = false;
    let imei1Reg = false;
    let imei2Reg = false;
    if (imei1) {
      otherRegistro = await hasOther(registrosRef, 'imeiEquipo', imei1, id, transaction);
      hasVenta = await hasOther(ventasRef, 'imeiEquipo', imei1, '', transaction);
      const imei2 = registro.imei2Equipo || '';
      imei1Reg = await hasOther(registrosRef, 'imeiRegistrado', imei1, id, transaction);
      imei2Reg = imei2 ? await hasOther(registrosRef, 'imeiRegistrado', imei2, id, transaction) : false;
    }
    if (dni) {
      otherEquipo = await hasOther(equiposRef, 'idDuenio', dni, imei1, transaction);
    }

    transaction.delete(registroRef);
    if (imei1 && !otherRegistro && !hasVenta) {
      transaction.delete(equiposRef.doc(imei1));
      if (dni && !otherEquipo) transaction.delete(clientesRef.doc(dni));
    } else if (imei1) {
      transaction.set(equiposRef.doc(imei1), {
        isRegistrado: imei1Reg || imei2Reg,
        imei1Registrado: imei1Reg,
        imei2Registrado: imei2Reg,
      }, {merge: true});
    }

    return {deleted: true};
  });
}

async function unlockRegistro(db, payload) {
  const {id} = parseIdPayload(payload);
  const ref = baseRef(db).collection('registros').doc(id);
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw Object.assign(new Error('REGISTRO_NOT_FOUND'), {status: 404});
    transaction.update(ref, {estado: 'NO BLOQUEADO'});
    return {id, estado: 'NO BLOQUEADO'};
  });
}

async function dispatchRegistros(body) {
  const db = getAdminDb();
  const action = String(body?.action || '');
  if (action === 'create') return createRegistro(db, body);
  if (action === 'update') return updateRegistro(db, body);
  if (action === 'delete') return deleteRegistro(db, body);
  if (action === 'unlock') return unlockRegistro(db, body);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchRegistros, {
  rateLimit: {name: 'registros', max: 120, windowMs: 60 * 1000},
});
