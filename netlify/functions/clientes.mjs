import {handlePost} from './_shared.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {withContactHistory} from './_clientesShared.mjs';
import {queueAuditEvent} from './_observability.mjs';
import {parseClienteUpdatePayload, parseDniPayload} from './_validators.mjs';
import {buscarClienteParaRegistro} from './_registroCliente.mjs';

const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const QUERY_PAGE_SIZE = 60;
const DEFAULT_ACTIVITY_SCAN_LIMIT = 25;
const SEARCH_ACTIVITY_SCAN_LIMIT = 60;
const SUPPORT_COLLECTION_SCAN_LIMIT = 60;
const MIN_SEARCH_LENGTH = 3;
const DEFAULT_CLIENT_LIMIT = 10;
const MAX_CLIENT_LIMIT = 50;
const HISTORY_SEARCH_LIMIT = 120;
const HISTORY_CLIENT_LIMIT = 120;
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
      totalVentas: 0,
      totalRegistros: 0,
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

async function readByField(collectionRef, field, value, maxDocs) {
  return readDocs(collectionRef.where(field, '==', value).limit(Math.max(Number(maxDocs || 1), 1)));
}

async function readByFieldIn(collectionRef, field, values, maxDocs = Number.POSITIVE_INFINITY) {
  const cleanValues = uniqueClean(values);
  if (!cleanValues.length) return [];

  const docs = [];
  // Firestore limits an `in` filter to 30 values. Keep each lookup bounded so
  // the client directory never falls back to a full collection scan.
  for (let index = 0; index < cleanValues.length; index += 30) {
    if (docs.length >= maxDocs) break;
    const chunk = cleanValues.slice(index, index + 30);
    let queryRef = collectionRef.where(field, 'in', chunk);
    if (Number.isFinite(maxDocs)) queryRef = queryRef.limit(Math.max(maxDocs - docs.length, 1));
    docs.push(...await readDocs(queryRef));
  }
  return docs;
}

async function readDocumentsByIds(collectionRef, ids, maxDocs = HISTORY_SEARCH_LIMIT) {
  const cleanIds = uniqueClean(ids).slice(0, Math.max(Number(maxDocs || 1), 1));
  const refs = cleanIds.map(id => collectionRef.doc(id));
  const snapshots = typeof collectionRef.firestore?.getAll === 'function'
    ? await collectionRef.firestore.getAll(...refs)
    : await Promise.all(refs.map(ref => ref.get()));
  return snapshots.filter(snapshot => snapshot.exists);
}

async function readIndexed(collectionRef, searchTerm, maxDocs) {
  return readDocs(collectionRef.where('searchTerms', 'array-contains', searchTerm).limit(maxDocs));
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

async function findHistoryDocs(base, payload = {}) {
  const rawTerm = clean(payload.searchTerm);
  const searchTerm = normalizeSearchTerm(rawTerm);
  const resultLimit = Math.min(Math.max(Number(payload.limit || HISTORY_SEARCH_LIMIT), 1), HISTORY_SEARCH_LIMIT);
  if (searchTerm.length < MIN_SEARCH_LENGTH) {
    return {clientesDocs: [], equiposDocs: [], ventasDocs: [], registrosDocs: []};
  }

  const clientesRef = base.collection('clientes');
  const equiposRef = base.collection('equipos');
  const ventasRef = base.collection('ventas');
  const registrosRef = base.collection('registros');
  const exactDniSearch = /^\d{6,12}$/.test(searchTerm);
  const exactImeiSearch = /^\d{14,15}$/.test(searchTerm);
  const exactVentaNumber = /^ven-\d+$/i.test(rawTerm);
  const exactRegistroNumber = /^reco-\d+$/i.test(rawTerm);

  let clientesDocs = [];
  let equiposDocs = [];
  let ventasDocs = [];
  let registrosDocs = [];

  if (exactDniSearch) {
    const [clienteSnap, equiposResult, ventasResult, registrosResult] = await Promise.all([
      clientesRef.doc(rawTerm).get(),
      readByField(equiposRef, 'idDuenio', rawTerm, resultLimit),
      readByField(ventasRef, 'dniCliente', rawTerm, resultLimit),
      readByField(registrosRef, 'dniCliente', rawTerm, resultLimit),
    ]);
    clientesDocs = docsFromSnap(clienteSnap);
    equiposDocs = equiposResult;
    ventasDocs = ventasResult;
    registrosDocs = registrosResult;
  } else if (exactImeiSearch) {
    const [equipoSnap, equiposImei2, ventasImei1, ventasImei2, registrosImei1, registrosImei2, registrosRegistrado] = await Promise.all([
      equiposRef.doc(rawTerm).get(),
      readByField(equiposRef, 'imei2', rawTerm, resultLimit),
      readByField(ventasRef, 'imeiEquipo', rawTerm, resultLimit),
      readByField(ventasRef, 'imei2Equipo', rawTerm, resultLimit),
      readByField(registrosRef, 'imeiEquipo', rawTerm, resultLimit),
      readByField(registrosRef, 'imei2Equipo', rawTerm, resultLimit),
      readByField(registrosRef, 'imeiRegistrado', rawTerm, resultLimit),
    ]);
    equiposDocs = uniqueDocs(docsFromSnap(equipoSnap), equiposImei2);
    ventasDocs = uniqueDocs(ventasImei1, ventasImei2);
    registrosDocs = uniqueDocs(registrosImei1, registrosImei2, registrosRegistrado);
  } else {
    const [clientesIndexed, equiposIndexed, ventasIndexed, registrosIndexed] = await Promise.all([
      readIndexed(clientesRef, searchTerm, HISTORY_CLIENT_LIMIT),
      readIndexed(equiposRef, searchTerm, resultLimit),
      readIndexed(ventasRef, searchTerm, resultLimit),
      readIndexed(registrosRef, searchTerm, resultLimit),
    ]);
    clientesDocs = clientesIndexed;
    equiposDocs = equiposIndexed;
    ventasDocs = ventasIndexed;
    registrosDocs = registrosIndexed;

    if (exactVentaNumber) {
      ventasDocs = uniqueDocs(ventasDocs, await readByField(ventasRef, 'nVenta', rawTerm.toUpperCase(), resultLimit));
    }
    if (exactRegistroNumber) {
      registrosDocs = uniqueDocs(registrosDocs, await readByField(registrosRef, 'nRegistro', rawTerm.toUpperCase(), resultLimit));
    }
    if (['pendiente', 'realizado'].includes(searchTerm)) {
      registrosDocs = uniqueDocs(registrosDocs, await readByField(registrosRef, 'estadoSolicitud', searchTerm.toUpperCase(), resultLimit));
    }
    if (searchTerm === 'bloqueado') {
      registrosDocs = uniqueDocs(registrosDocs, await readByField(registrosRef, 'estado', 'BLOQUEADO', resultLimit));
    }
  }

  const relatedDnis = uniqueClean([
    ...clientesDocs.map(doc => doc.data()?.dni || doc.id),
    ...equiposDocs.map(doc => doc.data()?.idDuenio),
  ]);
  if (relatedDnis.length && !exactDniSearch) {
    const [ventasRelated, registrosRelated] = await Promise.all([
      readByFieldIn(ventasRef, 'dniCliente', relatedDnis, resultLimit),
      readByFieldIn(registrosRef, 'dniCliente', relatedDnis, resultLimit),
    ]);
    ventasDocs = uniqueDocs(ventasDocs, ventasRelated);
    registrosDocs = uniqueDocs(registrosDocs, registrosRelated);
  }

  const movementDnis = uniqueClean([
    ...ventasDocs.map(doc => doc.data()?.dniCliente),
    ...registrosDocs.map(doc => doc.data()?.dniCliente),
    ...equiposDocs.map(doc => doc.data()?.idDuenio),
  ]);
  const loadedDnis = new Set(clientesDocs.map(doc => clean(doc.data()?.dni || doc.id)));
  const missingDnis = movementDnis.filter(dni => !loadedDnis.has(dni));
  if (missingDnis.length) {
    clientesDocs = uniqueDocs(clientesDocs, await readDocumentsByIds(clientesRef, missingDnis));
  }

  const movementImeis = uniqueClean([
    ...ventasDocs.flatMap(doc => [doc.data()?.imeiEquipo, doc.data()?.imei2Equipo]),
    ...registrosDocs.flatMap(doc => [doc.data()?.imeiEquipo, doc.data()?.imeiRegistrado, doc.data()?.imei2Equipo]),
  ]);
  const loadedImeis = new Set(equiposDocs.map(doc => clean(doc.data()?.idEquipo || doc.id)));
  const missingImeis = movementImeis.filter(imei => !loadedImeis.has(imei));
  if (missingImeis.length) {
    equiposDocs = uniqueDocs(equiposDocs, await readDocumentsByIds(equiposRef, missingImeis));
  }

  return {
    clientesDocs,
    equiposDocs,
    ventasDocs: ventasDocs.slice(0, resultLimit),
    registrosDocs: registrosDocs.slice(0, resultLimit),
  };
}

async function queryHistory(db, payload) {
  const base = baseRef(db);
  const searchTerm = normalizeSearchTerm(payload?.searchTerm);
  if (searchTerm.length < MIN_SEARCH_LENGTH) {
    return {clientes: [], ventas: [], registros: [], minSearchLength: MIN_SEARCH_LENGTH};
  }

  const resultLimit = Math.min(Math.max(Number(payload?.limit || HISTORY_SEARCH_LIMIT), 1), HISTORY_SEARCH_LIMIT);
  const {clientesDocs, ventasDocs, registrosDocs} = await findHistoryDocs(base, {...payload, limit: resultLimit});
  const clientes = clientesDocs.map(doc => ({id: doc.id, dni: clean(doc.data()?.dni || doc.id), ...doc.data()}));
  const clientePorDni = new Map(clientes.map(cliente => [clean(cliente.dni || cliente.id), cliente]));
  const withClientName = item => ({
    ...item,
    nombreCliente: item.nombreCliente || clientePorDni.get(clean(item.dniCliente))?.nombre || '',
  });

  return {
    clientes,
    ventas: sortByDateDesc(docsToItems(ventasDocs)).slice(0, resultLimit).map(withClientName),
    registros: sortByDateDesc(docsToItems(registrosDocs)).slice(0, resultLimit).map(withClientName),
    indexed: true,
    resultLimit,
  };
}

function clienteMatchesSearch(cliente, searchField, term) {
  if (!term) return true;
  const equipos = Array.isArray(cliente.equipos) ? cliente.equipos : [];
  const movimientos = [...(cliente.ventas || []), ...(cliente.registros || [])];
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
      ...movimientos.flatMap(item => [item.nVenta, item.nRegistro, item.imeiEquipo, item.imeiRegistrado, item.imei2Equipo, item.modeloEquipo, item.nombreComercial, item.nombreComercialEquipo, item.marcaEquipo]),
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
    totalVentas: total.totalVentas + cliente.totalVentas,
    totalRegistros: total.totalRegistros + cliente.totalRegistros,
    totalIngreso: total.totalIngreso + cliente.totalIngreso,
  }), {clientes: 0, ventas: 0, registros: 0, totalVentas: 0, totalRegistros: 0, totalIngreso: 0});
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
  let clientesDocs = [];
  let equiposDocs = [];
  let ventas = [];
  let registros = [];

  if (searchTerm) {
    const matched = await findHistoryDocs(base, {searchTerm: payload?.searchTerm, limit: Math.max(limit, QUERY_PAGE_SIZE)});
    clientesDocs = matched.clientesDocs;
    equiposDocs = matched.equiposDocs;
    ventas = sortByDateDesc(docsToItems(matched.ventasDocs));
    registros = sortByDateDesc(docsToItems(matched.registrosDocs));
  } else {
    const [clientesResult, equiposResult, ventasResult, registrosResult] = await Promise.all([
      readCollectionDocs(base.collection('clientes'), SUPPORT_COLLECTION_SCAN_LIMIT),
      readCollectionDocs(base.collection('equipos'), SUPPORT_COLLECTION_SCAN_LIMIT),
      readMovements(base.collection('ventas'), activityScanLimit),
      readMovements(base.collection('registros'), activityScanLimit),
    ]);
    clientesDocs = clientesResult;
    equiposDocs = equiposResult;
    ventas = ventasResult;
    registros = registrosResult;

    // The support collection read is intentionally capped for the free tier.
    // Recent movements can belong to clients outside that first page, so load
    // only those missing client documents by their exact DNI values. Without
    // this bounded lookup the UI creates a fallback "Cliente sin nombre".
    const loadedDnis = new Set(clientesDocs.map(doc => clean(doc.data()?.dni || doc.id)));
    const movementDnis = uniqueClean([
      ...ventas.map(venta => venta.dniCliente),
      ...registros.map(registro => registro.dniCliente),
    ]).filter(dni => !loadedDnis.has(dni));
    if (movementDnis.length) {
      clientesDocs = uniqueDocs(clientesDocs, await readDocumentsByIds(base.collection('clientes'), movementDnis));
    }
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
      totalVentas: 0,
      totalRegistros: 0,
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

  const clientesOperativos = Array.from(mapa.values()).map(cliente => {
    const ventasOrdenadas = sortByDateDesc(cliente.ventas);
    const registrosOrdenados = sortByDateDesc(cliente.registros);
    const equipos = Array.from(cliente.equiposMap.values());
    const actividad = ventasOrdenadas.length + registrosOrdenados.length;
    const ultimoMovimiento = [...ventasOrdenadas, ...registrosOrdenados]
      .map(item => item.fecha)
      .filter(Boolean)
      .sort((a, b) => movementDate(b) - movementDate(a))[0] || '';
    const totalIngreso = cliente.totalVentas + cliente.totalRegistros;
    const {equiposMap, ...clienteData} = cliente;
    return {
      ...clienteData,
      ventas: ventasOrdenadas,
      registros: registrosOrdenados,
      totalVentas: cliente.totalVentas,
      totalRegistros: cliente.totalRegistros,
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
    scanLimited: !searchTerm,
    indexed: Boolean(searchTerm),
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
  if (action === 'forRegistration') return buscarClienteParaRegistro(db, body);
  if (action === 'queryOperational') return queryOperationalClientes(db, body);
  if (action === 'queryHistory') return queryHistory(db, body);
  if (action === 'update') return updateCliente(db, body, context);
  if (action === 'delete') return deleteCliente(db, body, context);
  throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
}

export const handler = event => handlePost(event, dispatchClientes, {
  rateLimit: {name: 'clientes', max: 30, windowMs: 60 * 1000},
});

export const __test = {
  findHistoryDocs,
  queryHistory,
  queryOperationalClientes,
};
