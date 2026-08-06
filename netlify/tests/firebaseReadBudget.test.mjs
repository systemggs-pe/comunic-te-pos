import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {__test} from '../functions/clientes.mjs';
import {__test as registrosTest} from '../functions/registros.mjs';

function makeDoc(id, data = {}) {
  return {
    id,
    data: () => data,
    exists: true,
  };
}

function matchWhere(data, filter) {
  const value = data?.[filter.field];
  if (filter.op === '==') return value === filter.value;
  if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
  if (filter.op === 'array-contains') return Array.isArray(value) && value.includes(filter.value);
  return false;
}

class FakeQuery {
  constructor(store, collectionName, operations = []) {
    this.store = store;
    this.collectionName = collectionName;
    this.operations = operations;
  }

  where(field, op, value) {
    return new FakeQuery(this.store, this.collectionName, [...this.operations, {type: 'where', field, op, value}]);
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.store, this.collectionName, [...this.operations, {type: 'orderBy', field, direction}]);
  }

  limit(value) {
    return new FakeQuery(this.store, this.collectionName, [...this.operations, {type: 'limit', value}]);
  }

  startAfter(doc) {
    return new FakeQuery(this.store, this.collectionName, [...this.operations, {type: 'startAfter', doc}]);
  }

  doc(id) {
    return new FakeDocRef(this.store, this.collectionName, id);
  }

  async get() {
    const limitOp = [...this.operations].reverse().find(operation => operation.type === 'limit');
    this.store.calls.push({
      collection: this.collectionName,
      limit: limitOp?.value ?? null,
      operations: this.operations,
    });

    let docs = Array.from(this.store.collections.get(this.collectionName)?.entries() || [])
      .map(([id, data]) => makeDoc(id, data));

    this.operations.filter(operation => operation.type === 'where').forEach(filter => {
      docs = docs.filter(doc => matchWhere(doc.data(), filter));
    });

    const order = this.operations.find(operation => operation.type === 'orderBy');
    if (order) {
      docs = docs.sort((a, b) => {
        const left = a.data()?.[order.field] || '';
        const right = b.data()?.[order.field] || '';
        return order.direction === 'desc' ? String(right).localeCompare(String(left)) : String(left).localeCompare(String(right));
      });
    }

    const startAfter = this.operations.find(operation => operation.type === 'startAfter');
    if (startAfter?.doc?.id) {
      const index = docs.findIndex(doc => doc.id === startAfter.doc.id);
      if (index >= 0) docs = docs.slice(index + 1);
    }

    if (limitOp) docs = docs.slice(0, limitOp.value);

    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
    };
  }
}

class FakeDocRef {
  constructor(store, collectionName, id) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }

  collection(name) {
    return new FakeQuery(this.store, name);
  }

  async get() {
    this.store.calls.push({collection: this.collectionName, doc: this.id, limit: 1, operations: [{type: 'doc', id: this.id}]});
    const data = this.store.collections.get(this.collectionName)?.get(this.id);
    return data ? makeDoc(this.id, data) : {id: this.id, exists: false, data: () => ({})};
  }
}

function createFakeDb(seed = {}) {
  const store = {
    calls: [],
    collections: new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))])),
  };
  return {
    store,
    collection(name) {
      return {
        doc(id) {
          return new FakeDocRef(store, name, id);
        },
      };
    },
  };
}

function seedOperationalData(count = 500) {
  const collections = {
    clientes: {},
    equipos: {},
    ventas: {},
    registros: {},
  };

  for (let i = 1; i <= count; i += 1) {
    const dni = String(40000000 + i);
    const imei = `99000000000${String(i).padStart(4, '0')}`.slice(0, 15);
    collections.clientes[dni] = {dni, nombre: `Cliente ${i}`};
    collections.equipos[imei] = {idEquipo: imei, idDuenio: dni, imei2: `88000000000${String(i).padStart(4, '0')}`.slice(0, 15), modelo: `Modelo ${i}`};
    collections.ventas[`venta-${i}`] = {dniCliente: dni, imeiEquipo: imei, precio: 100, fecha: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`};
    collections.registros[`registro-${i}`] = {dniCliente: dni, imeiEquipo: imei, imeiRegistrado: imei, precio: 10, fecha: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T09:00:00.000Z`};
  }
  return collections;
}

test('queryOperational ignores searches shorter than 3 chars without Firestore reads', async () => {
  const db = createFakeDb(seedOperationalData(20));

  const response = await __test.queryOperationalClientes(db, {searchTerm: 'ab', searchField: 'todo'});

  assert.equal(response.total, 0);
  assert.equal(response.minSearchLength, 3);
  assert.equal(db.store.calls.length, 0);
});

test('queryOperational default load uses capped reads and fills recent client names', async () => {
  const db = createFakeDb(seedOperationalData(500));

  const response = await __test.queryOperationalClientes(db, {searchTerm: '', searchField: 'todo', limit: 10});

  const byCollection = Object.groupBy(db.store.calls, call => call.collection);
  assert.equal(db.store.calls.length, 5);
  assert.equal(byCollection.clientes.length, 2);
  assert.equal(byCollection.clientes[0].limit, 60);
  assert.equal(byCollection.clientes[1].limit, null);
  assert.equal(byCollection.clientes[1].operations[0].field, 'dni');
  assert.equal(byCollection.clientes[1].operations[0].op, 'in');
  assert.equal(byCollection.equipos[0].limit, 60);
  assert.equal(byCollection.ventas[0].limit, 25);
  assert.equal(byCollection.registros[0].limit, 25);
  assert.equal(byCollection.boletasExtranjeras, undefined);
  assert.ok(response.clientes.every(cliente => cliente.nombre));
  assert.ok(db.store.calls.filter(call => call.limit !== null).every(call => Number.isFinite(call.limit)));
});

test('queryOperational exact DNI/IMEI searches use targeted limited queries', async () => {
  const dbDni = createFakeDb(seedOperationalData(500));
  await __test.queryOperationalClientes(dbDni, {searchTerm: '40000010', searchField: 'dni', limit: 10});
  assert.equal(dbDni.store.calls.length, 4);
  assert.deepEqual(dbDni.store.calls.map(call => call.collection).sort(), ['clientes', 'equipos', 'registros', 'ventas']);
  assert.ok(dbDni.store.calls.every(call => Number.isFinite(call.limit)));

  const dbImei = createFakeDb(seedOperationalData(500));
  await __test.queryOperationalClientes(dbImei, {searchTerm: '990000000000010', searchField: 'imei', limit: 10});
  assert.equal(dbImei.store.calls.length, 5);
  assert.deepEqual(dbImei.store.calls.map(call => call.collection).sort(), ['equipos', 'equipos', 'registros', 'registros', 'ventas']);
  assert.ok(dbImei.store.calls.every(call => Number.isFinite(call.limit)));
});

test('checkRegisteredImeis finds old registrations with bounded exact queries', async () => {
  const db = createFakeDb({
    registros: {
      first: {imeiRegistrado: '865716088094342', imeiEquipo: '865716088094342', estadoSolicitud: 'REALIZADO'},
      second: {imeiEquipo: '865716088094359', estadoSolicitud: 'PENDIENTE'},
      unrelated: {imeiRegistrado: '490154203237518', estadoSolicitud: 'REALIZADO'},
    },
  });

  const response = await registrosTest.checkRegisteredImeis(db, {
    imeis: ['865716088094342', '865716088094359', '000000000000000'],
  });

  assert.deepEqual(response.registeredImeis.sort(), ['865716088094342']);
  assert.equal(db.store.calls.length, 2);
  assert.ok(db.store.calls.every(call => call.limit === 30));
});

test('client Firestore subscriptions and history searches keep strict free-tier caps', async () => {
  const [app, main] = await Promise.all([
    readFile(new URL('../../src/app/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8'),
  ]);
  const [ventasList, registrosList, registroPdf, clientesFunction] = await Promise.all([
    readFile(new URL('../../src/features/ventas/VentasList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/registros/RegistrosList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/registros/registroPdf.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/clientes.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /const MAX_HISTORY_SEARCH_DOCS = 120;/);
  assert.match(app, /while \(revisados < MAX_HISTORY_SEARCH_DOCS\)/);
  assert.match(app, /const REFERENCE_DATA_LIMIT = 200;/);
  assert.match(app, /query\(clientesRef, limit\(REFERENCE_DATA_LIMIT\)\)/);
  assert.match(app, /query\(collection\([^;]+?'equipos'\), limit\(REFERENCE_DATA_LIMIT\)\)/s);
  assert.match(app, /unsubRegistrosRef\.current\(\);\s*unsubRegistrosRef\.current = null;/);
  assert.match(app, /unsubVentasRef\.current\(\);\s*unsubVentasRef\.current = null;/);
  assert.doesNotMatch(main, /StrictMode/);
  assert.doesNotMatch(app, /boletasExtranjeras|boleta_extranjera|BoletaExtranjera/);
  assert.match(ventasList, /term\.length < 3/);
  assert.match(registrosList, /term\.length < 3/);
  assert.match(registrosList, /IMEI2:/);
  assert.match(registrosList, /IMEI A REGISTRAR:/);
  assert.match(registroPdf, /field\('IMEI 2'/);
  assert.match(registroPdf, /field\('IMEI A REG\.'/);
  assert.match(clientesFunction, /rateLimit: \{name: 'clientes', max: 30/);
  assert.match(clientesFunction, /const DEFAULT_ACTIVITY_SCAN_LIMIT = 25;/);
  assert.match(clientesFunction, /const SEARCH_ACTIVITY_SCAN_LIMIT = 60;/);
  assert.match(clientesFunction, /const SUPPORT_COLLECTION_SCAN_LIMIT = 60;/);
});

test('API runtime rate limiting does not read or write Firestore counters', async () => {
  const [shared, autoRegistros, registros] = await Promise.all([
    readFile(new URL('../functions/_shared.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../functions/autoRegistros.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../functions/registros.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(shared, /enforceMemoryRateLimit/);
  assert.match(autoRegistros, /enforceMemoryRateLimit/);
  assert.doesNotMatch(shared, /enforcePersistentRateLimit/);
  assert.doesNotMatch(autoRegistros, /enforcePersistentRateLimit/);
  assert.match(autoRegistros, /\.limit\(30\)/);
  assert.match(registros, /action === 'checkImeis'/);
  assert.match(registros, /\.slice\(0, 120\)/);
  assert.match(registros, /where\('imeiRegistrado', 'in', chunk\)/);
});

test('APPLE receipt lookup stays server-mediated and bounded', async () => {
  const [app, ventaForm, settings, functionsClient, registroForm, lookupHelper, netlifyConfig, rules] = await Promise.all([
    readFile(new URL('../../src/app/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/ventas/VentaForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/settings/ConfiguracionLogo.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/services/functionsClient.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/features/registros/RegistroForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../functions/_comprobanteApple.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../netlify.toml', import.meta.url), 'utf8'),
    readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  ]);

  const runtimeSource = [app, ventaForm, settings].join('\n');
  assert.doesNotMatch(runtimeSource, /boletasExtranjeras|boleta_extranjera|guardarBoletaExtranjera|publicBoleta/i);
  assert.match(functionsClient, /consultarComprobanteApplePorImei/);
  assert.match(registroForm, /consultarComprobanteApplePorImei/);
  assert.match(lookupHelper, /\.limit\(1\)/);
  assert.doesNotMatch(lookupHelper, /onSnapshot|collectionRef\.get\(\)/);
  assert.doesNotMatch(netlifyConfig, /api\/boletasExtranjeras|api\/publicBoleta/);
  assert.match(netlifyConfig, /api\/comprobanteApple/);
  assert.match(netlifyConfig, /from = "\/boleta"[\s\S]*comunicate-boletas-extranjeras\.netlify\.app\/boleta/);
  assert.match(rules, /match \/artifacts\/\{appId\}\/users\/\{scope\}\/boletasExtranjeras\/\{boletaId\} \{\s*allow read, write: if false;/);
});
