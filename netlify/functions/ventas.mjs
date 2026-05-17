import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {parseIdPayload, parseVentaPayload} from './_validators.mjs';

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

async function createVenta(db, payload) {
  const {cliente, equipo, venta} = parseVentaPayload(payload);
  const base = baseRef(db);
  const counterRef = db.collection('_counters').doc('ventas');
  const ventaRef = base.collection('ventas').doc();
  const clienteRef = base.collection('clientes').doc(cliente.dni);
  const equipoRef = base.collection('equipos').doc(equipo.idEquipo);

  return db.runTransaction(async transaction => {
    const counterSnap = await transaction.get(counterRef);
    let next = Number(counterSnap.data()?.last || 0) + 1;
    if (!counterSnap.exists) {
      const existingSnap = await transaction.get(base.collection('ventas'));
      next = Math.max(next, getNextFromExisting(existingSnap, 'nVenta', 'VEN'));
    }
    const nVenta = `VEN-${String(next).padStart(4, '0')}`;
    const ventaData = {...venta, nVenta};

    transaction.set(counterRef, {last: next, updatedAt: new Date().toISOString()}, {merge: true});
    transaction.set(clienteRef, cliente, {merge: true});
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(ventaRef, ventaData);

    return {id: ventaRef.id, venta: {id: ventaRef.id, ...ventaData}};
  });
}

async function updateVenta(db, payload) {
  const {id} = parseIdPayload(payload);
  const {cliente, equipo, venta} = parseVentaPayload(payload);

  const base = baseRef(db);
  const ventasRef = base.collection('ventas');
  const registrosRef = base.collection('registros');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const ventaRef = ventasRef.doc(id);
  const clienteRef = clientesRef.doc(cliente.dni);
  const equipoRef = equiposRef.doc(equipo.idEquipo);

  return db.runTransaction(async transaction => {
    const currentSnap = await transaction.get(ventaRef);
    if (!currentSnap.exists) throw Object.assign(new Error('VENTA_NOT_FOUND'), {status: 404});
    const current = currentSnap.data() || {};
    const oldImei = current.imeiEquipo || '';
    const oldDni = current.dniCliente || '';
    const oldImeiChanged = oldImei && oldImei !== equipo.idEquipo;
    const oldDniChanged = oldDni && oldDni !== cliente.dni;
    let oldOtherVenta = false;
    let oldHasRegistro = false;
    let oldOtherEquipo = false;
    if (oldImeiChanged) {
      oldOtherVenta = await hasOther(ventasRef, 'imeiEquipo', oldImei, id, transaction);
      oldHasRegistro = await hasOther(registrosRef, 'imeiEquipo', oldImei, '', transaction);
    }
    if (oldDniChanged) {
      oldOtherEquipo = await hasOther(equiposRef, 'idDuenio', oldDni, oldImei, transaction);
    }
    const ventaData = {...venta, nVenta: current.nVenta || venta.nVenta || ''};

    if (oldImeiChanged && !oldOtherVenta && !oldHasRegistro) {
      transaction.delete(equiposRef.doc(oldImei));
    }
    if (oldDniChanged && !oldOtherEquipo) {
      transaction.delete(clientesRef.doc(oldDni));
    }
    transaction.set(clienteRef, cliente, {merge: true});
    transaction.set(equipoRef, equipo, {merge: true});
    transaction.set(ventaRef, ventaData);

    return {id, venta: {id, ...ventaData}};
  });
}

async function deleteVenta(db, payload) {
  const {id} = parseIdPayload(payload);
  const base = baseRef(db);
  const ventasRef = base.collection('ventas');
  const registrosRef = base.collection('registros');
  const equiposRef = base.collection('equipos');
  const clientesRef = base.collection('clientes');
  const ventaRef = ventasRef.doc(id);

  return db.runTransaction(async transaction => {
    const ventaSnap = await transaction.get(ventaRef);
    if (!ventaSnap.exists) return {deleted: true, missing: true};
    const venta = ventaSnap.data() || {};
    const imei1 = venta.imeiEquipo || '';
    const dni = venta.dniCliente || '';

    let otherVenta = false;
    let hasRegistro = false;
    let otherEquipo = false;
    if (imei1) {
      otherVenta = await hasOther(ventasRef, 'imeiEquipo', imei1, id, transaction);
      hasRegistro = await hasOther(registrosRef, 'imeiEquipo', imei1, '', transaction);
    }
    if (dni) {
      otherEquipo = await hasOther(equiposRef, 'idDuenio', dni, imei1, transaction);
    }

    transaction.delete(ventaRef);
    if (imei1 && !otherVenta && !hasRegistro) {
      transaction.delete(equiposRef.doc(imei1));
      if (dni && !otherEquipo) transaction.delete(clientesRef.doc(dni));
    } else if (imei1) {
      transaction.set(equiposRef.doc(imei1), {isVendido: otherVenta}, {merge: true});
    }

    return {deleted: true};
  });
}

async function dispatchVentas(body) {
  const db = getAdminDb();
  const action = String(body?.action || '');
  if (action === 'create') return createVenta(db, body);
  if (action === 'update') return updateVenta(db, body);
  if (action === 'delete') return deleteVenta(db, body);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchVentas, {
  rateLimit: {name: 'ventas', max: 120, windowMs: 60 * 1000},
});
