import admin from 'firebase-admin';
import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {queueAuditEvent} from './_observability.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function cleanMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function cleanImei(value) {
  const imei = String(value || '').replace(/\D/g, '').slice(0, 15);
  return /^\d{15}$/.test(imei) ? imei : '';
}

function normalizeVentas(ventas) {
  return Array.isArray(ventas)
    ? ventas.slice(0, 20).map(venta => ({
      id: cleanText(venta?.id, 160),
      imeiEquipo: cleanImei(venta?.imeiEquipo),
      imei2Equipo: cleanImei(venta?.imei2Equipo),
      sn: cleanText(venta?.sn, 80),
      marcaEquipo: cleanText(venta?.marcaEquipo, 80),
      modeloEquipo: cleanText(venta?.modeloEquipo, 100),
      nombreComercial: cleanText(venta?.nombreComercial, 140),
      memoria: cleanText(venta?.memoria, 20),
      color: cleanText(venta?.color, 80),
      precio: String(venta?.precio || '').trim().slice(0, 20),
    })).filter(venta => venta.imeiEquipo && Number(venta.precio) > 0)
    : [];
}

function normalizeEquiposMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((map, [key, equipo]) => {
    const imei = cleanImei(key);
    if (!imei) return map;

    map[imei] = {
      imei2: cleanImei(equipo?.imei2),
      sn: cleanText(equipo?.sn, 80),
      marca: cleanText(equipo?.marca, 80),
      modelo: cleanText(equipo?.modelo, 100),
      nombreComercial: cleanText(equipo?.nombreComercial, 140),
      memoria: cleanText(equipo?.memoria, 20),
      color: cleanText(equipo?.color, 80),
    };
    return map;
  }, {});
}

function filterEquiposMapForVentas(equiposMap, ventas) {
  return ventas.reduce((filtered, venta) => {
    const imei = cleanImei(venta?.imeiEquipo);
    if (!imei) return filtered;
    filtered[imei] = equiposMap[imei] || {};
    return filtered;
  }, {});
}

function normalizeEmisor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    nombre: cleanText(value.nombre, 180),
    rut: cleanText(value.rut, 40),
    giro1: cleanText(value.giro1, 120),
    giro2: cleanText(value.giro2, 120),
    direccion: cleanText(value.direccion, 180),
    comuna: cleanText(value.comuna, 80),
    ciudad: cleanText(value.ciudad, 80),
    vendedor: cleanText(value.vendedor, 40),
  };
}

function normalizeBoletaData(rawData, formato) {
  const data = rawData || {};
  const ventas = normalizeVentas(data.ventas);
  const equiposMap = normalizeEquiposMap(data.equiposMap);
  const equiposMapFiltrado = filterEquiposMapForVentas(equiposMap, ventas);
  const totalPen = ventas.reduce((sum, venta) => sum + cleanMoney(venta.precio), 0);

  if (!ventas.length) {
    throw Object.assign(new Error('BOLETA_SIN_EQUIPO'), {status: 400});
  }

  const fechaHora = cleanText(data.fechaHora, 40);
  if (fechaHora && Number.isNaN(Date.parse(fechaHora))) {
    throw Object.assign(new Error('FECHA_INVALIDA'), {status: 400});
  }

  const boletaData = {
    cliente: {
      nombre: cleanText(data.cliente?.nombre, 180),
      dni: cleanText(data.cliente?.dni, 20),
    },
    ventas,
    equiposMap: equiposMapFiltrado,
    totalClp: cleanMoney(data.totalClp),
    fechaHora,
    nBoleta: Number.isInteger(Number(data.nBoleta)) ? Number(data.nBoleta) : null,
    emisor: normalizeEmisor(data.emisor),
  };

  if (!boletaData.cliente.nombre || !boletaData.cliente.dni) {
    throw Object.assign(new Error('CLIENTE_INVALIDO'), {status: 400});
  }
  if (!boletaData.totalClp) {
    throw Object.assign(new Error('TOTAL_INVALIDO'), {status: 400});
  }

  return {
    boletaData,
    totalPen,
    origen: ventas.some(venta => venta.id) ? 'ventas' : 'manual',
    formato,
  };
}

function extractEquipoKeysFromBoletaData(data = {}) {
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const keysFromVentas = new Set();
  ventas.forEach(venta => {
    const imei1 = cleanImei(venta?.imeiEquipo);
    const imei2 = cleanImei(venta?.imei2Equipo);
    if (imei1) keysFromVentas.add(imei1);
    if (imei2) keysFromVentas.add(imei2);

    const equipo = imei1 ? data.equiposMap?.[imei1] : null;
    const imei2Equipo = cleanImei(equipo?.imei2);
    if (imei2Equipo) keysFromVentas.add(imei2Equipo);
  });

  if (keysFromVentas.size) return Array.from(keysFromVentas);

  const keysFromMap = new Set();
  if (data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap)) {
    Object.entries(data.equiposMap).forEach(([key, equipo]) => {
      const imei1 = cleanImei(key);
      const imei2 = cleanImei(equipo?.imei2);
      if (imei1) keysFromMap.add(imei1);
      if (imei2) keysFromMap.add(imei2);
    });
  }
  return Array.from(keysFromMap);
}

function getBoletaEquipoKeys(docData = {}) {
  const dataKeys = extractEquipoKeysFromBoletaData(docData.boletaData || {});
  if (dataKeys.length) return dataKeys;

  const stored = Array.isArray(docData.boletaEquipoKeys)
    ? docData.boletaEquipoKeys.map(cleanImei).filter(Boolean)
    : [];
  return Array.from(new Set([
    ...stored,
    cleanImei(docData.boletaEquipoKey),
  ].filter(Boolean)));
}

function parsePayload(payload) {
  const action = String(payload?.action || '');
  if (!['save', 'update'].includes(action)) {
    throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
  }

  const formato = Number(payload?.formato);
  if (![1, 2, 3].includes(formato)) {
    throw Object.assign(new Error('FORMATO_INVALIDO'), {status: 400});
  }

  const historialId = cleanText(payload?.historialId, 180);
  const normalized = normalizeBoletaData(payload?.boletaData, formato);
  const equipoKeys = extractEquipoKeysFromBoletaData(normalized.boletaData);
  if (!equipoKeys.length) {
    throw Object.assign(new Error('BOLETA_SIN_IMEI'), {status: 400});
  }

  return {
    action,
    historialId,
    ...normalized,
    equipoKeys,
  };
}

async function getNextBoletaNumber(transaction, contadorRef) {
  const snap = await transaction.get(contadorRef);
  const last = Number(snap.data()?.last || 999);
  const next = Math.max(last + 1, 1000);
  transaction.set(contadorRef, {
    last: next,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return next;
}

function assertNoDuplicateBoleta(docs, equipoKeys, excludeId) {
  const keys = new Set(equipoKeys);
  for (const doc of docs) {
    if (excludeId && doc.id === excludeId) continue;

    const docKeys = getBoletaEquipoKeys(doc.data() || {});
    const duplicateKey = docKeys.find(key => keys.has(key));
    if (duplicateKey) {
      throw Object.assign(new Error('BOLETA_EQUIPO_YA_EXISTE'), {
        status: 409,
        payload: {
          imei: duplicateKey,
          boletaId: doc.id,
          nBoleta: doc.data()?.nBoleta || null,
        },
      });
    }
  }
}

async function saveBoleta(db, payload, context) {
  const parsed = parsePayload(payload);
  const base = baseRef(db);
  const boletasRef = base.collection('boletasExtranjeras');
  const contadorRef = base.collection('configuracion').doc('contadorBoletas');

  return db.runTransaction(async transaction => {
    const allBoletasSnap = await transaction.get(boletasRef);
    assertNoDuplicateBoleta(allBoletasSnap.docs, parsed.equipoKeys, parsed.historialId);

    const isUpdate = Boolean(parsed.historialId);
    const boletaRef = isUpdate
      ? boletasRef.doc(parsed.historialId)
      : boletasRef.doc(parsed.equipoKeys[0]);

    const currentSnap = await transaction.get(boletaRef);
    if (isUpdate && !currentSnap.exists) {
      throw Object.assign(new Error('BOLETA_NOT_FOUND'), {status: 404});
    }
    if (!isUpdate && currentSnap.exists) {
      throw Object.assign(new Error('BOLETA_EQUIPO_YA_EXISTE'), {
        status: 409,
        payload: {
          imei: parsed.equipoKeys[0],
          boletaId: boletaRef.id,
          nBoleta: currentSnap.data()?.nBoleta || null,
        },
      });
    }

    const current = currentSnap.exists ? currentSnap.data() || {} : {};
    const nBoleta = current.nBoleta || parsed.boletaData.nBoleta || await getNextBoletaNumber(transaction, contadorRef);
    const boletaData = {...parsed.boletaData, nBoleta};
    const data = {
      nBoleta,
      clienteDni: boletaData.cliente?.dni || '',
      clienteNombre: boletaData.cliente?.nombre || '',
      totalPen: parsed.totalPen,
      totalClp: Number(boletaData.totalClp || 0),
      fechaHora: boletaData.fechaHora || '',
      formato: parsed.formato,
      origen: parsed.origen,
      boletaEquipoKey: parsed.equipoKeys[0],
      boletaEquipoKeys: parsed.equipoKeys,
      boletaData,
      createdAt: current.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.set(boletaRef, data, {merge: true});
    queueAuditEvent(transaction, base, context, {
      entityType: 'boletaExtranjera',
      entityId: boletaRef.id,
      action: isUpdate ? 'update' : 'create',
      metadata: {
        nBoleta,
        clienteDni: data.clienteDni,
        formato: parsed.formato,
        equipoKeys: parsed.equipoKeys,
      },
    });

    return {
      id: boletaRef.id,
      boleta: {
        id: boletaRef.id,
        nBoleta,
        clienteDni: data.clienteDni,
        clienteNombre: data.clienteNombre,
        totalPen: data.totalPen,
        totalClp: data.totalClp,
        fechaHora: data.fechaHora,
        formato: data.formato,
        origen: data.origen,
        boletaEquipoKey: data.boletaEquipoKey,
        boletaEquipoKeys: data.boletaEquipoKeys,
        boletaData,
      },
    };
  });
}

async function dispatchBoletas(body, user, context) {
  const db = getAdminDb();
  return saveBoleta(db, body, context);
}

export const handler = event => handlePost(event, dispatchBoletas, {
  rateLimit: {name: 'boletasExtranjeras', max: 90, windowMs: 60 * 1000},
});
