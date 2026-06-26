import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {withContactHistory} from './_clientesShared.mjs';
import {queueAuditEvent} from './_observability.mjs';
import {parseClienteUpdatePayload, parseDniPayload} from './_validators.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const QUERY_PAGE_SIZE = 500;
const DEFAULT_ACTIVITY_SCAN_LIMIT = 120;
const SEARCH_ACTIVITY_SCAN_LIMIT = 300;
const SUPPORT_COLLECTION_SCAN_LIMIT = 300;
const MIN_SEARCH_LENGTH = 3;
const DEFAULT_CLIENT_LIMIT = 10;
const MAX_CLIENT_LIMIT = 50;
const SEARCH_FIELDS = new Set(['todo', 'dni', 'imei', 'modelo', 'nombreComercial', 'sn', 'nombre']);

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function normalizeSearchTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function clean(value) {
  return String(value || '').trim();
}

function uniqueClean(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({offset}), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const offset = Number(parsed?.offset || 0);
    return Number.isFinite(offset) && offset > 0 ? offset : 0;
  } catch {
    return 0;
  }
}

function movementDate(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => movementDate(b.fecha || b.fechaHora || b.createdAt) - movementDate(a.fecha || a.fechaHora || a.createdAt));
}

function isoFromDate(value) {
  const time = movementDate(value);
  return time ? new Date(time).toISOString() : '';
}

function normalizarImei(value) {
  const imei = String(value || '').replace(/\D/g, '').slice(0, 15);
  return /^\d{15}$/.test(imei) ? imei : '';
}

function obtenerImeisBoleta(boleta = {}) {
  const data = boleta.boletaData || {};
  const keys = new Set();
  (Array.isArray(data.ventas) ? data.ventas : []).forEach(venta => {
    const imei1 = normalizarImei(venta.imeiEquipo);
    const imei2 = normalizarImei(venta.imei2Equipo);
    if (imei1) keys.add(imei1);
    if (imei2) keys.add(imei2);
    const equipo = imei1 ? data.equiposMap?.[imei1] : null;
    const imei2Equipo = normalizarImei(equipo?.imei2);
    if (imei2Equipo) keys.add(imei2Equipo);
  });
  if (data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap)) {
    Object.entries(data.equiposMap).forEach(([key, equipo]) => {
      const imei1 = normalizarImei(key);
      const imei2 = normalizarImei(equipo?.imei2);
      if (imei1) keys.add(imei1);
      if (imei2) keys.add(imei2);
    });
  }
  (Array.isArray(boleta.boletaEquipoKeys) ? boleta.boletaEquipoKeys : []).forEach(imei => {
    const normalizado = normalizarImei(imei);
    if (normalizado) keys.add(normalizado);
  });
  const key = normalizarImei(boleta.boletaEquipoKey);
  if (key) keys.add(key);
  return Array.from(keys);
}

function mergeClienteFallback(cliente, fallback = {}) {
  if (!cliente.tipoDocumento && fallback.tipoDocumento) cliente.tipoDocumento = fallback.tipoDocumento;
  if (!cliente.nombre && fallback.nombre) cliente.nombre = fallback.nombre;
  if (!cliente.celular && fallback.celular) cliente.celular = fallback.celular;
  if (!cliente.celularRef && fallback.celularRef) cliente.celularRef = fallback.celularRef;
  if (!cliente.correo && fallback.correo) cliente.correo = fallback.correo;
  if (!cliente.direccion && fallback.direccion) cliente.direccion = fallback.direccion;
}

function ensureCliente(mapa, dni, fallback = {}) {
  const id = clean(dni);
  if (!id) return null;
  if (!mapa.has(id)) {
    mapa.set(id, {
      id,
      dni: id,
      tipoDocumento: fallback.tipoDocumento || 'DNI',
      nombre: fallback.nombre || '',
      celular: fallback.celular || '',
      celularRef: fallback.celularRef || '',
      correo: fallback.correo || '',
      direccion: fallback.direccion || '',
      celulares: uniqueClean([fallback.celular, fallback.celularRef]),
      correos: uniqueClean([fallback.correo]).map(correo => correo.toLowerCase()),
      ventas: [],
      registros: [],
      boletas: [],
      totalVentas: 0,
      totalRegistros: 0,
      totalBoletas: 0,
      equiposMap: new Map(),
    });
  } else {
    mergeClienteFallback(mapa.get(id), fallback);
  }
  return mapa.get(id);
}

function addEquipo(cliente, equipo = {}) {
  if (!cliente || !equipo?.idEquipo) return;
  const current = cliente.equiposMap.get(equipo.idEquipo) || {};
  cliente.equiposMap.set(equipo.idEquipo, {
    ...current,
    ...equipo,
    idEquipo: equipo.idEquipo,
  });
}

function equipoFromVenta(venta = {}) {
  return {
    idEquipo: venta.imeiEquipo || '',
    imei2: venta.imei2Equipo || '',
    sn: venta.sn || '',
    marca: venta.marcaEquipo || '',
    modelo: venta.modeloEquipo || '',
    nombreComercial: venta.nombreComercial || '',
    color: venta.color || '',
    memoria: venta.memoria || '',
    ram: venta.ram || '',
  };
}

function equipoFromRegistro(registro = {}) {
  return {
    idEquipo: registro.imeiEquipo || '',
    imei2: registro.imei2Equipo || '',
    marca: registro.marcaEquipo || '',
    modelo: registro.modeloEquipo || '',
    nombreComercial: registro.nombreComercialEquipo || '',
  };
}

function equiposFromBoleta(boleta = {}) {
  const data = boleta.boletaData || {};
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const equiposMap = data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap) ? data.equiposMap : {};
  const salida = new Map();

  Object.entries(equiposMap).forEach(([key, equipo]) => {
    const imei = normalizarImei(key);
    if (!imei) return;
    salida.set(imei, {
      idEquipo: imei,
      imei2: normalizarImei(equipo?.imei2),
      sn: equipo?.sn || '',
      marca: equipo?.marca || '',
      modelo: equipo?.modelo || '',
      nombreComercial: equipo?.nombreComercial || '',
      color: equipo?.color || '',
      memoria: equipo?.memoria || '',
      ram: equipo?.ram || '',
    });
  });

  ventas.forEach(venta => {
    const imei = normalizarImei(venta.imeiEquipo);
    if (!imei) return;
    const actual = salida.get(imei) || {idEquipo: imei};
    salida.set(imei, {
      ...actual,
      imei2: actual.imei2 || normalizarImei(venta.imei2Equipo),
      sn: actual.sn || venta.sn || '',
      marca: actual.marca || venta.marcaEquipo || '',
      modelo: actual.modelo || venta.modeloEquipo || '',
      nombreComercial: actual.nombreComercial || venta.nombreComercial || '',
      color: actual.color || venta.color || '',
      memoria: actual.memoria || venta.memoria || '',
      ram: actual.ram || venta.ram || '',
    });
  });

  return Array.from(salida.values());
}

function docsFromSnap(snap) {
  if (!snap) return [];
  if (Array.isArray(snap.docs)) return snap.docs;
  return snap.exists ? [snap] : [];
}

function docsToItems(docs) {
  return docs.map(doc => ({id: doc.id, ...doc.data()}));
}

function uniqueDocs(...groups) {
  const docs = new Map();
  groups.flat().filter(Boolean).forEach(doc => docs.set(doc.id, doc));
  return Array.from(docs.values());
}

async function readDocs(queryRef) {
  const snap = await queryRef.get();
  return snap.docs;
}

async function readCollectionDocs(collectionRef, maxDocs) {
  return readDocs(collectionRef.limit(Math.max(Number(maxDocs || 1), 1)));
}

async function readRecentDocs(collectionRef, field, maxDocs) {
  return readDocs(collectionRef.orderBy(field, 'desc').limit(Math.max(Number(maxDocs || 1), 1)));
}

async function readByField(collectionRef, field, value, maxDocs) {
  return readDocs(collectionRef.where(field, '==', value).limit(Math.max(Number(maxDocs || 1), 1)));
}

async function readByArrayContains(collectionRef, field, value, maxDocs) {
  return readDocs(collectionRef.where(field, 'array-contains', value).limit(Math.max(Number(maxDocs || 1), 1)));
}

async function readMovements(collectionRef, maxDocs = QUERY_PAGE_SIZE) {
  const items = [];
  let cursor = null;
  const cap = Math.max(Number(maxDocs || QUERY_PAGE_SIZE), 1);
  while (items.length < cap) {
    const pageSize = Math.min(QUERY_PAGE_SIZE, cap - items.length);
    const pageQuery = cursor
      ? collectionRef.orderBy('fecha', 'desc').startAfter(cursor).limit(pageSize)
      : collectionRef.orderBy('fecha', 'desc').limit(pageSize);
    const snap = await pageQuery.get();
    items.push(...docsToItems(snap.docs));
    if (snap.size < pageSize) break;
    cursor = snap.docs.at(-1);
  }
  return items;
}

function clienteMatchesSearch(cliente, searchField, term) {
  if (!term) return true;
  const equipos = Array.isArray(cliente.equipos) ? cliente.equipos : [];
  const movimientos = [...(cliente.ventas || []), ...(cliente.registros || []), ...(cliente.boletas || [])];
  const campos = {
    dni: [cliente.dni],
    nombre: [cliente.nombre],
    imei: equipos.flatMap(equipo => [equipo.idEquipo, equipo.imei2]),
    modelo: equipos.map(equipo => equipo.modelo),
    nombreComercial: equipos.map(equipo => equipo.nombreComercial),
    sn: equipos.map(equipo => equipo.sn),
    todo: [
      cliente.dni,
      cliente.nombre,
      cliente.celular,
      cliente.celularRef,
      cliente.correo,
      ...equipos.flatMap(equipo => [equipo.idEquipo, equipo.imei2, equipo.modelo, equipo.nombreComercial, equipo.sn, equipo.marca]),
      ...movimientos.flatMap(item => [item.nVenta, item.nRegistro, item.nBoleta, item.imeiEquipo, item.imeiRegistrado, item.imei2Equipo, item.modeloEquipo, item.nombreComercial, item.nombreComercialEquipo, item.marcaEquipo, ...(Array.isArray(item.boletaEquipoKeys) ? item.boletaEquipoKeys : [])]),
    ],
  };
  const valores = searchField === 'todo' ? campos.todo : campos[searchField] || [];
  return valores.some(value => normalizeSearchTerm(value).includes(term));
}

function summarize(items) {
  return items.reduce((total, cliente) => ({
    clientes: total.clientes + 1,
    ventas: total.ventas + cliente.ventas.length,
    registros: total.registros + cliente.registros.length,
    boletas: total.boletas + (cliente.boletas?.length || 0),
    totalVentas: total.totalVentas + cliente.totalVentas,
    totalRegistros: total.totalRegistros + cliente.totalRegistros,
    totalBoletas: total.totalBoletas + (cliente.totalBoletas || 0),
    totalIngreso: total.totalIngreso + cliente.totalIngreso,
  }), {clientes: 0, ventas: 0, registros: 0, boletas: 0, totalVentas: 0, totalRegistros: 0, totalBoletas: 0, totalIngreso: 0});
}

async function queryOperationalClientes(db, payload) {
  const base = baseRef(db);
  const searchTerm = normalizeSearchTerm(payload?.searchTerm);
  const searchField = SEARCH_FIELDS.has(payload?.searchField) ? payload.searchField : 'todo';
  const limit = Math.min(Math.max(Number(payload?.limit || DEFAULT_CLIENT_LIMIT), 1), MAX_CLIENT_LIMIT);
  const offset = decodeCursor(payload?.cursor);

  if (searchTerm && searchTerm.length < MIN_SEARCH_LENGTH) {
    const empty = summarize([]);
    return {
      clientes: [],
      total: 0,
      nextCursor: null,
      stats: empty,
      filteredStats: empty,
      minSearchLength: MIN_SEARCH_LENGTH,
    };
  }

  const activityScanLimit = searchTerm ? SEARCH_ACTIVITY_SCAN_LIMIT : DEFAULT_ACTIVITY_SCAN_LIMIT;
  const exactDniSearch = searchTerm && /^\d{6,12}$/.test(searchTerm) && (searchField === 'todo' || searchField === 'dni');
  const exactImeiSearch = searchTerm && /^\d{14,15}$/.test(searchTerm) && (searchField === 'todo' || searchField === 'imei');
  let clientesDocs = [];
  let equiposDocs = [];
  let ventas = [];
  let registros = [];
  let boletasDocs = [];

  if (exactDniSearch) {
    const [clienteSnap, equiposResult, ventasResult, registrosResult, boletasResult] = await Promise.all([
      base.collection('clientes').doc(searchTerm).get(),
      readByField(base.collection('equipos'), 'idDuenio', searchTerm, SUPPORT_COLLECTION_SCAN_LIMIT),
      readByField(base.collection('ventas'), 'dniCliente', searchTerm, activityScanLimit),
      readByField(base.collection('registros'), 'dniCliente', searchTerm, activityScanLimit),
      readByField(base.collection('boletasExtranjeras'), 'clienteDni', searchTerm, activityScanLimit),
    ]);
    clientesDocs = docsFromSnap(clienteSnap);
    equiposDocs = equiposResult;
    ventas = sortByDateDesc(docsToItems(ventasResult));
    registros = sortByDateDesc(docsToItems(registrosResult));
    boletasDocs = boletasResult;
  } else if (exactImeiSearch) {
    const [equipoSnap, equiposImei2Result, ventasResult, registrosImeiResult, registrosImeiRegistradoResult, boletasResult] = await Promise.all([
      base.collection('equipos').doc(searchTerm).get(),
      readByField(base.collection('equipos'), 'imei2', searchTerm, SUPPORT_COLLECTION_SCAN_LIMIT),
      readByField(base.collection('ventas'), 'imeiEquipo', searchTerm, activityScanLimit),
      readByField(base.collection('registros'), 'imeiEquipo', searchTerm, activityScanLimit),
      readByField(base.collection('registros'), 'imeiRegistrado', searchTerm, activityScanLimit),
      readByArrayContains(base.collection('boletasExtranjeras'), 'boletaEquipoKeys', searchTerm, activityScanLimit),
    ]);
    equiposDocs = uniqueDocs(docsFromSnap(equipoSnap), equiposImei2Result);
    ventas = sortByDateDesc(docsToItems(ventasResult));
    registros = sortByDateDesc(docsToItems(uniqueDocs(registrosImeiResult, registrosImeiRegistradoResult)));
    boletasDocs = boletasResult;
  } else {
    const [clientesResult, equiposResult, ventasResult, registrosResult, boletasResult] = await Promise.all([
      readCollectionDocs(base.collection('clientes'), SUPPORT_COLLECTION_SCAN_LIMIT),
      readCollectionDocs(base.collection('equipos'), SUPPORT_COLLECTION_SCAN_LIMIT),
      readMovements(base.collection('ventas'), activityScanLimit),
      readMovements(base.collection('registros'), activityScanLimit),
      readRecentDocs(base.collection('boletasExtranjeras'), 'createdAt', activityScanLimit),
    ]);
    clientesDocs = clientesResult;
    equiposDocs = equiposResult;
    ventas = ventasResult;
    registros = registrosResult;
    boletasDocs = boletasResult;
  }

  const mapa = new Map();
  clientesDocs.forEach(doc => {
    const data = doc.data() || {};
    const dni = clean(data.dni || doc.id);
    if (!dni) return;
    mapa.set(dni, {
      id: doc.id,
      dni,
      ...data,
      ventas: [],
      registros: [],
      boletas: [],
      totalVentas: 0,
      totalRegistros: 0,
      totalBoletas: 0,
      equiposMap: new Map(),
    });
  });

  equiposDocs.forEach(doc => {
    const equipo = {id: doc.id, ...doc.data()};
    const dni = clean(equipo.idDuenio);
    if (!dni) return;
    const cliente = ensureCliente(mapa, dni);
    addEquipo(cliente, {...equipo, idEquipo: equipo.idEquipo || doc.id});
  });

  ventas.forEach(venta => {
    const cliente = ensureCliente(mapa, venta.dniCliente, {
      tipoDocumento: venta.tipoDocumentoCliente || 'DNI',
      nombre: venta.nombreCliente || '',
      celular: venta.celularCliente || '',
    });
    if (!cliente) return;
    cliente.ventas.push(venta);
    cliente.totalVentas += money(venta.precio);
    addEquipo(cliente, equipoFromVenta(venta));
  });

  registros.forEach(registro => {
    const cliente = ensureCliente(mapa, registro.dniCliente, {
      tipoDocumento: registro.tipoDocumentoCliente || 'DNI',
      nombre: registro.nombreCliente || '',
      celular: registro.celularCliente || '',
      celularRef: registro.celularRef || '',
    });
    if (!cliente) return;
    cliente.registros.push(registro);
    cliente.totalRegistros += money(registro.precio);
    addEquipo(cliente, equipoFromRegistro(registro));
  });

  boletasDocs.forEach(doc => {
    const raw = {id: doc.id, ...doc.data()};
    const boletaData = raw.boletaData || {};
    const dni = clean(raw.clienteDni || boletaData.cliente?.dni);
    const cliente = ensureCliente(mapa, dni, {
      tipoDocumento: boletaData.cliente?.tipoDocumento || 'DNI',
      nombre: raw.clienteNombre || boletaData.cliente?.nombre || '',
    });
    if (!cliente) return;

    const boleta = {
      ...raw,
      boletaData,
      clienteDni: dni,
      clienteNombre: raw.clienteNombre || boletaData.cliente?.nombre || cliente.nombre || '',
      fecha: raw.fechaHora || boletaData.fechaHora || isoFromDate(raw.updatedAt || raw.createdAt),
      boletaEquipoKeys: obtenerImeisBoleta(raw),
    };
    cliente.boletas.push(boleta);
    cliente.totalBoletas += money(raw.totalPen);
    equiposFromBoleta(boleta).forEach(equipo => addEquipo(cliente, {
      ...equipo,
      boletaExtranjera: {id: boleta.id, nBoleta: boleta.nBoleta || '', formato: boleta.formato || '', fecha: boleta.fecha},
    }));
  });

  const clientesOperativos = Array.from(mapa.values()).map(cliente => {
    const ventasOrdenadas = sortByDateDesc(cliente.ventas);
    const registrosOrdenados = sortByDateDesc(cliente.registros);
    const boletasOrdenadas = sortByDateDesc(cliente.boletas || []);
    const equipos = Array.from(cliente.equiposMap.values());
    const actividad = ventasOrdenadas.length + registrosOrdenados.length + boletasOrdenadas.length;
    const ultimoMovimiento = [...ventasOrdenadas, ...registrosOrdenados, ...boletasOrdenadas]
      .map(item => item.fecha)
      .filter(Boolean)
      .sort((a, b) => movementDate(b) - movementDate(a))[0] || '';
    const totalIngreso = cliente.totalVentas + cliente.totalRegistros;
    const {equiposMap, ...clienteData} = cliente;
    return {
      ...clienteData,
      ventas: ventasOrdenadas,
      registros: registrosOrdenados,
      boletas: boletasOrdenadas,
      totalVentas: cliente.totalVentas,
      totalRegistros: cliente.totalRegistros,
      totalBoletas: cliente.totalBoletas || 0,
      totalIngreso,
      equipos,
      actividad,
      ultimoMovimiento,
    };
  }).filter(cliente => cliente.actividad > 0);

  const filtrados = clientesOperativos
    .filter(cliente => clienteMatchesSearch(cliente, searchField, searchTerm))
    .sort((a, b) => {
      if (b.actividad !== a.actividad) return b.actividad - a.actividad;
      return normalizeSearchTerm(a.nombre).localeCompare(normalizeSearchTerm(b.nombre));
    });

  const page = filtrados.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    clientes: page,
    total: filtrados.length,
    nextCursor: nextOffset < filtrados.length ? encodeCursor(nextOffset) : null,
    stats: summarize(clientesOperativos),
    filteredStats: summarize(filtrados),
    scanLimited: true,
    activityScanLimit,
    supportCollectionScanLimit: SUPPORT_COLLECTION_SCAN_LIMIT,
  };
}

async function hasAny(collectionRef, field, value, transaction) {
  const snap = await transaction.get(collectionRef.where(field, '==', value).limit(1));
  return !snap.empty;
}

async function updateCliente(db, payload, context) {
  const {cliente} = parseClienteUpdatePayload(payload);
  const base = baseRef(db);
  const ref = base.collection('clientes').doc(cliente.dni);

  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const data = withContactHistory(current, cliente, {preservePrimary: false});
    transaction.set(ref, data, {merge: true});
    queueAuditEvent(transaction, base, context, {
      entityType: 'cliente',
      entityId: cliente.dni,
      action: 'update',
      metadata: {
        existed: snap.exists,
        tipoDocumento: data.tipoDocumento,
        dni: cliente.dni,
        contactos: {
          celulares: Array.isArray(data.celulares) ? data.celulares.length : 0,
          correos: Array.isArray(data.correos) ? data.correos.length : 0,
        },
      },
    });
    return {cliente: {id: cliente.dni, ...data}};
  });
}

async function deleteCliente(db, payload, context) {
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
    queueAuditEvent(transaction, base, context, {
      entityType: 'cliente',
      entityId: dni,
      action: 'delete',
      metadata: {
        dni,
        hasVentas,
        hasRegistros,
        equiposDeleted: !hasVentas && !hasRegistros ? equiposSnap.size : 0,
      },
    });

    return {deleted: true};
  });
}

async function dispatchClientes(body, user, context) {
  const db = getAdminDb();
  const action = String(body?.action || '');
  if (action === 'queryOperational') return queryOperationalClientes(db, body);
  if (action === 'update') return updateCliente(db, body, context);
  if (action === 'delete') return deleteCliente(db, body, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchClientes, {
  rateLimit: {name: 'clientes', max: 30, windowMs: 60 * 1000},
});

export const __test = {
  queryOperationalClientes,
};
