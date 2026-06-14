import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {withContactHistory} from './_clientesShared.mjs';
import {normalizeImeiList, releaseImeiLocks, syncImeiLocks} from './_imeiLocks.mjs';
import {queueAuditEvent} from './_observability.mjs';
import {parseIdPayload, parseRegistroPayload} from './_validators.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function imeiLocksRef(base) {
  return base.collection('imeiLocks');
}

function registroLockImeis(registro) {
  return normalizeImeiList([registro?.imeiRegistrado || registro?.imeiEquipo]);
}

async function hasOther(collectionRef, field, value, excludeId, transaction) {
  const snap = await transaction.get(collectionRef.where(field, '==', value).limit(20));
  return snap.docs.some(doc => doc.id !== excludeId);
}

async function assertNoOtherRegistroWithImeis(registrosRef, imeis, excludeId, transaction) {
  const cleanImeis = normalizeImeiList(imeis);
  for (const imei of cleanImeis) {
    const [registradoSnap, legacySnap] = await Promise.all([
      transaction.get(registrosRef.where('imeiRegistrado', '==', imei).limit(20)),
      transaction.get(registrosRef.where('imeiEquipo', '==', imei).limit(20)),
    ]);
    const docs = [...registradoSnap.docs, ...legacySnap.docs];
    const hasDuplicate = docs.some(doc => {
      const data = doc.data() || {};
      const registeredImei = data.imeiRegistrado || data.imeiEquipo || '';
      return doc.id !== excludeId && registeredImei === imei;
    });
    if (hasDuplicate) {
      throw Object.assign(new Error('IMEI_YA_REGISTRADO'), {
        status: 409,
        payload: {imei},
      });
    }
  }
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

async function createRegistro(db, payload, context) {
  const {cliente, equipo, registro} = parseRegistroPayload(payload);
  const base = baseRef(db);
  const counterRef = db.collection('_counters').doc('registros');
  const registroRef = base.collection('registros').doc();
  const clienteRef = base.collection('clientes').doc(cliente.dni);
  const equipoRef = base.collection('equipos').doc(equipo.idEquipo);
  const registrosRef = base.collection('registros');
  const locksRef = imeiLocksRef(base);

  return db.runTransaction(async transaction => {
    const counterSnap = await transaction.get(counterRef);
    let next = Number(counterSnap.data()?.last || 0) + 1;
    if (!counterSnap.exists) {
      const existingSnap = await transaction.get(registrosRef);
      next = Math.max(next, getNextFromExisting(existingSnap, 'nRegistro', 'RECO'));
    }
    const nRegistro = `RECO-${String(next).padStart(5, '0')}`;
    const registroData = {...registro, nRegistro};
    const lockImeis = registroLockImeis(registroData);
    await assertNoOtherRegistroWithImeis(registrosRef, lockImeis, registroRef.id, transaction);
    const clienteSnap = await transaction.get(clienteRef);
    const clienteData = withContactHistory(clienteSnap.exists ? clienteSnap.data() || {} : {}, cliente);

    await syncImeiLocks({
      transaction,
      locksRef,
      kind: 'registro',
      ownerId: registroRef.id,
      setImeis: lockImeis,
    });
    transaction.set(clienteRef, clienteData, {merge: true});
    transaction.set(counterRef, {last: next, updatedAt: new Date().toISOString()}, {merge: true});
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(registroRef, registroData);
    queueAuditEvent(transaction, base, context, {
      entityType: 'registro',
      entityId: registroRef.id,
      action: 'create',
      metadata: {
        nRegistro,
        dniCliente: registroData.dniCliente,
        imeiEquipo: registroData.imeiEquipo,
        imeiRegistrado: registroData.imeiRegistrado,
        estado: registroData.estado,
        tipo: registroData.tipo,
      },
    });

    return {id: registroRef.id, registro: {id: registroRef.id, ...registroData}};
  });
}

async function updateRegistro(db, payload, context) {
  const {id} = parseIdPayload(payload);
  const {cliente, equipo, registro} = parseRegistroPayload(payload);

  const base = baseRef(db);
  const registrosRef = base.collection('registros');
  const ventasRef = base.collection('ventas');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const locksRef = imeiLocksRef(base);
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
    const oldLockImeis = registroLockImeis(current);
    const lockImeis = registroLockImeis(registroData);
    await assertNoOtherRegistroWithImeis(registrosRef, lockImeis, id, transaction);
    const clienteSnap = await transaction.get(clienteRef);
    const clienteData = withContactHistory(clienteSnap.exists ? clienteSnap.data() || {} : {}, cliente);

    await syncImeiLocks({
      transaction,
      locksRef,
      kind: 'registro',
      ownerId: id,
      setImeis: lockImeis,
      releaseImeis: oldLockImeis,
    });
    transaction.set(clienteRef, clienteData, {merge: true});
    if (oldImeiChanged && !oldOtherRegistro && !oldHasVenta) {
      transaction.delete(equiposRef.doc(oldImei));
    }
    if (oldDniChanged && !oldOtherEquipo) {
      transaction.delete(clientesRef.doc(oldDni));
    }
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(registroRef, registroData);
    queueAuditEvent(transaction, base, context, {
      entityType: 'registro',
      entityId: id,
      action: 'update',
      metadata: {
        nRegistro: registroData.nRegistro,
        dniCliente: registroData.dniCliente,
        oldDni,
        imeiEquipo: registroData.imeiEquipo,
        oldImei,
        imeiRegistrado: registroData.imeiRegistrado,
        oldLockImeis,
        lockImeis,
        estado: registroData.estado,
      },
    });

    return {id, registro: {id, ...registroData}};
  });
}

async function deleteRegistro(db, payload, context) {
  const {id} = parseIdPayload(payload);
  const base = baseRef(db);
  const registrosRef = base.collection('registros');
  const ventasRef = base.collection('ventas');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const locksRef = imeiLocksRef(base);
  const registroRef = registrosRef.doc(id);

  return db.runTransaction(async transaction => {
    const registroSnap = await transaction.get(registroRef);
    if (!registroSnap.exists) {
      queueAuditEvent(transaction, base, context, {
        entityType: 'registro',
        entityId: id,
        action: 'delete',
        metadata: {missing: true},
      });
      return {deleted: true, missing: true};
    }
    const registro = registroSnap.data() || {};
    const imei1 = registro.imeiEquipo || '';
    const dni = registro.dniCliente || '';

    let otherRegistro = false;
    let hasVenta = false;
    let otherDniRegistro = false;
    let otherDniVenta = false;
    let equiposClienteSnap = null;
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
      otherDniRegistro = await hasOther(registrosRef, 'dniCliente', dni, id, transaction);
      otherDniVenta = await hasOther(ventasRef, 'dniCliente', dni, '', transaction);
      equiposClienteSnap = await transaction.get(equiposRef.where('idDuenio', '==', dni).limit(100));
    }

    await releaseImeiLocks({
      transaction,
      locksRef,
      kind: 'registro',
      ownerId: id,
      imeis: registroLockImeis(registro),
    });
    transaction.delete(registroRef);
    if (dni && !otherDniRegistro && !otherDniVenta) {
      equiposClienteSnap?.docs.forEach(doc => transaction.delete(doc.ref));
      transaction.delete(clientesRef.doc(dni));
    } else if (imei1 && !otherRegistro && !hasVenta) {
      transaction.delete(equiposRef.doc(imei1));
    } else if (imei1) {
      transaction.set(equiposRef.doc(imei1), {
        isRegistrado: imei1Reg || imei2Reg,
        imei1Registrado: imei1Reg,
        imei2Registrado: imei2Reg,
      }, {merge: true});
    }
    queueAuditEvent(transaction, base, context, {
      entityType: 'registro',
      entityId: id,
      action: 'delete',
      metadata: {
        nRegistro: registro.nRegistro,
        dniCliente: dni,
        imeiEquipo: registro.imeiEquipo,
        imeiRegistrado: registro.imeiRegistrado,
      },
    });

    return {deleted: true};
  });
}

async function unlockRegistro(db, payload, context) {
  const {id} = parseIdPayload(payload);
  const base = baseRef(db);
  const ref = base.collection('registros').doc(id);
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw Object.assign(new Error('REGISTRO_NOT_FOUND'), {status: 404});
    transaction.update(ref, {estado: 'NO BLOQUEADO'});
    queueAuditEvent(transaction, base, context, {
      entityType: 'registro',
      entityId: id,
      action: 'unlock',
      metadata: {
        nRegistro: snap.data()?.nRegistro || '',
        previousEstado: snap.data()?.estado || '',
        nextEstado: 'NO BLOQUEADO',
      },
    });
    return {id, estado: 'NO BLOQUEADO'};
  });
}

async function dispatchRegistros(body, user, context) {
  const db = getAdminDb();
  const action = String(body?.action || '');
  if (action === 'create') return createRegistro(db, body, context);
  if (action === 'update') return updateRegistro(db, body, context);
  if (action === 'delete') return deleteRegistro(db, body, context);
  if (action === 'unlock') return unlockRegistro(db, body, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchRegistros, {
  rateLimit: {name: 'registros', max: 120, windowMs: 60 * 1000},
});
