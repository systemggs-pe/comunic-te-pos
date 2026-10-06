import {receiptFingerprint} from '../functions/_receiptFingerprint.mjs';
const signReceipt = r => ({...r, estado: 'ACTIVA', receiptFingerprint: receiptFingerprint({...r, estado: 'ACTIVA'})});
import assert from 'node:assert/strict';
import test from 'node:test';
import {__test} from '../functions/solicitudesPublicas.mjs';
import {__test as registrosTest} from '../functions/registros.mjs';
import {
  PUBLIC_SOLICITUD_INITIAL,
  sanitizePublicSolicitudField,
  validatePublicSolicitudForm,
} from '../../src/features/solicitudesPublicas/publicSolicitudModel.js';
import {publicSolicitudToRegistroDraft} from '../../src/features/solicitudesPublicas/publicSolicitudRegistroDraft.js';

const validToken = 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890';
const validImei1 = '490154203237518';
const validImei2 = '356938035643809';
const TEST_APPLE_ENV = {
  APPLE_RECEIPTS_API_URL: 'https://boletas.example.test/api/boletas',
  APPLE_RECEIPTS_API_KEY: 'server-only-test-key',
};

const validSubmission = {
  token: validToken,
  data: {
    nombres: 'cliente prueba',
    celular: '999 888 777',
    correo: 'CLIENTE@EXAMPLE.COM',
    direccion: 'av siempre viva 123',
    provincia: 'tacna',
    imei1: validImei1,
    imei2: validImei2,
    imeiRegistrado: validImei2,
    nombreEquipo: 'iphone 15 pro',
    marca: 'apple',
    modelo: 'a3102',
    ram: '8 gb',
    memoria: '256 gb',
    color: 'azul',
    precioCompra: '5600.50',
    fechaCompra: '2026-01-15',
    tieneCaja: 'SI',
  },
};

class FakeDocSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this._value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this._value;
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocSnapshot(this, this.db.store.get(this.path));
  }

  async set(value, options = {}) {
    if (options?.merge) {
      this.db.store.set(this.path, {...(this.db.store.get(this.path) || {}), ...value});
    } else {
      this.db.store.set(this.path, value);
    }
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id = `auto-${this.db.nextAutoId++}`) {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }

  where(field, op, value) {
    return new FakeQuery(this.db, this.path, [{field, op, value}], null, null);
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.db, this.path, [], {field, direction}, null);
  }

  limit(count) {
    return new FakeQuery(this.db, this.path, [], null, count);
  }

  async get() {
    return new FakeQuery(this.db, this.path, [], null, null).get();
  }
}

class FakeQuery {
  constructor(db, path, filters, order, limitCount) {
    this.db = db;
    this.path = path;
    this.filters = filters;
    this.order = order;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new FakeQuery(this.db, this.path, [...this.filters, {field, op, value}], this.order, this.limitCount);
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.db, this.path, this.filters, {field, direction}, this.limitCount);
  }

  limit(count) {
    return new FakeQuery(this.db, this.path, this.filters, this.order, count);
  }

  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.db.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => new FakeDocSnapshot(new FakeDocRef(this.db, path), value));
    docs = docs.filter(doc => this.filters.every(({field, op, value}) => op === '==' && doc.data()?.[field] === value));
    if (this.order) {
      docs.sort((left, right) => {
        const leftValue = left.data()?.[this.order.field] || '';
        const rightValue = right.data()?.[this.order.field] || '';
        const direction = this.order.direction === 'desc' ? -1 : 1;
        return String(leftValue).localeCompare(String(rightValue)) * direction;
      });
    }
    if (this.limitCount != null) docs = docs.slice(0, this.limitCount);
    return new FakeQuerySnapshot(docs);
  }
}

class FakeBatch {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }

  set(ref, value, options = {}) {
    this.writes.push({type: 'set', ref, value, options});
  }

  delete(ref) {
    this.writes.push({type: 'delete', ref});
  }

  async commit() {
    this.writes.forEach(write => {
      if (write.type === 'delete') {
        this.db.store.delete(write.ref.path);
      } else if (write.options?.merge) {
        this.db.store.set(write.ref.path, {...(this.db.store.get(write.ref.path) || {}), ...write.value});
      } else {
        this.db.store.set(write.ref.path, write.value);
      }
    });
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
    this.nextAutoId = 1;
  }

  collection(name) {
    return new FakeCollectionRef(this, name);
  }

  batch() {
    return new FakeBatch(this);
  }
}

const basePath = 'artifacts/comunicate-pos/users/shared';

test('solicitudes publicas hashes token and validates DNI', () => {
  assert.equal(__test.tokenHash('abc'), __test.tokenHash('abc'));
  assert.notEqual(__test.tokenHash('abc'), 'abc');
  assert.equal(__test.parseCreateLinkPayload({dni: '12345678'}).dni, '12345678');
  assert.throws(() => __test.parseCreateLinkPayload({dni: '123'}), /VALIDATION_ERROR/);
});

test('solicitudes publicas validates Luhn IMEI values', () => {
  assert.equal(__test.luhn(validImei1), true);
  assert.equal(__test.luhn(validImei2), true);
  assert.equal(__test.luhn('490154203237519'), false);
});

test('solicitudes publicas normalizes public payload', () => {
  const parsed = __test.parsePublicSubmission(validSubmission, {dni: '12345678'});
  assert.equal(parsed.token, validToken);
  assert.equal(parsed.tokenId, __test.tokenHash(validToken));
  assert.equal(parsed.submission.dni, '12345678');
  assert.equal(parsed.submission.nombres, 'CLIENTE PRUEBA');
  assert.equal(parsed.submission.celular, '999888777');
  assert.equal(parsed.submission.correo, 'cliente@example.com');
  assert.equal(parsed.submission.direccion, 'AV SIEMPRE VIVA 123');
  assert.equal(parsed.submission.provincia, 'TACNA');
  assert.equal(parsed.submission.imeiRegistrado, validImei2);
  assert.equal(parsed.submission.tieneCaja, true);
});

test('solicitudes publicas accepts public payload without second IMEI and optional model', () => {
  const parsed = __test.parsePublicSubmission({
    ...validSubmission,
    data: {
      ...validSubmission.data,
      imei2: '',
      imeiRegistrado: validImei1,
      modelo: '',
    },
  }, {dni: '12345678'});

  assert.equal(parsed.submission.imei1, validImei1);
  assert.equal(parsed.submission.imei2, '');
  assert.equal(parsed.submission.imeiRegistrado, validImei1);
  assert.equal(parsed.submission.modelo, '');
});

test('solicitudes publicas rejects duplicated IMEIs and invalid completion', () => {
  assert.throws(
    () => __test.parsePublicSubmission({
      ...validSubmission,
      data: {...validSubmission.data, imei2: validImei1},
    }, {dni: '12345678'}),
    /VALIDATION_ERROR/,
  );
  assert.throws(
    () => __test.parseCompletePayload({id: 'abc', operacion: {tramite: 'OTRO', imeiRegistrado: validImei1}}),
    /VALIDATION_ERROR/,
  );
  assert.throws(
    () => __test.parsePublicSubmission({
      ...validSubmission,
      data: {...validSubmission.data, imeiRegistrado: '865716088094342'},
    }, {dni: '12345678'}),
    /VALIDATION_ERROR/,
  );
});

test('solicitudes publicas only accepts hashed ids for link deletion', () => {
  const id = __test.tokenHash(validToken);
  assert.deepEqual(__test.parseDeletePayload({id}), {id});
  assert.throws(() => __test.parseDeletePayload({id: validToken}), /VALIDATION_ERROR/);
  assert.throws(() => __test.parseDeletePayload({id: '../clientes/12345678'}), /VALIDATION_ERROR/);
});

test('solicitudes publicas validates lookup payload and limits public equipment fields', () => {
  assert.deepEqual(__test.parseLookupImeiPayload({token: validToken, imei: validImei1}), {
    token: validToken,
    tokenId: __test.tokenHash(validToken),
    imei: validImei1,
  });
  assert.throws(() => __test.parseLookupImeiPayload({token: validToken, imei: '123'}), /VALIDATION_ERROR/);
  assert.deepEqual(__test.publicEquipmentData({
    id: validImei1,
    data: {
      idDuenio: '12345678',
      imei2: validImei2,
      nombreComercial: 'iphone 15 pro',
      marca: 'apple',
      modelo: 'a3102',
      ram: '8 gb',
      memoria: '256 gb',
      color: 'azul',
      privateNote: 'NO EXPONER',
    },
  }), {
    imei1: validImei1,
    imei2: validImei2,
    nombreEquipo: 'IPHONE 15 PRO',
    marca: 'APPLE',
    modelo: 'A3102',
    ram: '8 GB',
    memoria: '256 GB',
    color: 'AZUL',
  });
});

test('solicitud publica attaches Apple receipt before completing registration', async () => {
  const registro = {
    marcaEquipo: 'apple',
    imeiEquipo: validImei1,
    imeiRegistrado: validImei2,
    boletaExtranjeraId: '',
    boletaExtranjeraNro: '',
  };
  let captured;
  const receipt = await __test.attachAppleReceiptForPublicRegistro(registro, {authorization: 'Bearer operator-token'}, {
    env: TEST_APPLE_ENV,
    fetchImpl: async (url, options) => {
      captured = {url, options};
      return new Response(JSON.stringify({
        boletas: [signReceipt({
          id: 'apple-receipt-1263',
          nBoleta: '1263',
          fechaHora: '2026-10-01T12:00:00.000Z',
          boletaEquipoKeys: [validImei1, validImei2],
          boletaData: {
            cliente: {nombre: 'CLIENTE PRUEBA', dni: '12345678'},
            ventas: [{imeiEquipo: validImei1, imei2Equipo: validImei2, marcaEquipo: 'APPLE', precio: 1200}],
            equiposMap: {[validImei1]: {imei2: validImei2, marca: 'APPLE'}},
          },
        })],
      }), {status: 200, headers: {'Content-Type': 'application/json'}});
    },
  });

  assert.equal(receipt.id, 'apple-receipt-1263');
  assert.equal(registro.marcaEquipo, 'APPLE');
  assert.equal(registro.boletaExtranjeraId, 'apple-receipt-1263');
  assert.equal(registro.boletaExtranjeraNro, '1263');
  assert.equal(captured.url, TEST_APPLE_ENV.APPLE_RECEIPTS_API_URL);
  assert.equal(captured.options.headers['X-API-Key'], TEST_APPLE_ENV.APPLE_RECEIPTS_API_KEY);
  assert.equal(captured.options.headers.Authorization, 'Bearer operator-token');
});

test('preverified receipt requires exactly one final authoritative lookup', async () => {
  const receipt = signReceipt({id: 'apple-receipt-1263', nBoleta: 1263, fechaHora: '2026-10-01T12:00:00.000Z',
    boletaEquipoKeys: [validImei1, validImei2], boletaData: {cliente: {nombre: 'CLIENTE PRUEBA', dni: '12345678'},
      ventas: [{imeiEquipo: validImei1, imei2Equipo: validImei2, marcaEquipo: 'APPLE', precio: 1200}],
      equiposMap: {[validImei1]: {imei2: validImei2, marca: 'APPLE'}}}});
  let calls = 0;
  const registro = {marcaEquipo: 'APPLE', imeiEquipo: validImei1, imeiRegistrado: validImei2, boletaExtranjeraId: receipt.id};
  await registrosTest.assertComprobanteApple(registro, {env: TEST_APPLE_ENV, preverifiedAppleReceipt: receipt,
    fetchImpl: async () => {calls++; return new Response(JSON.stringify({boletas: [receipt]}));}});
  assert.equal(calls, 1);
  assert.equal(registro.receiptFingerprint, receipt.receiptFingerprint);
});

test('solicitud publica model sanitizes and validates client form', () => {
  assert.equal(sanitizePublicSolicitudField('nombres', 'juan pérez'), 'JUAN PÉREZ');
  assert.equal(sanitizePublicSolicitudField('celular', '9a9b8c8d8e7f7'), '9988877');
  assert.equal(sanitizePublicSolicitudField('imei1', '490154203237518999'), validImei1);

  const form = {
    ...PUBLIC_SOLICITUD_INITIAL,
    ...validSubmission.data,
    nombres: 'CLIENTE PRUEBA',
    celular: '999888777',
    correo: 'cliente@example.com',
    direccion: 'AV SIEMPRE VIVA 123',
    provincia: 'TACNA',
    marca: 'APPLE',
    nombreEquipo: 'IPHONE 15 PRO',
    modelo: 'A3102',
    ram: '8 GB',
    memoria: '256 GB',
    color: 'AZUL',
    imeiRegistrado: validImei2,
  };
  assert.equal(validatePublicSolicitudForm(form), null);
  assert.match(validatePublicSolicitudForm({...form, imei2: '490154203237519'}), /IMEI 2/);
  assert.match(validatePublicSolicitudForm({...form, imeiRegistrado: ''}), /Elige/);
  assert.match(validatePublicSolicitudForm({...form, imeiRegistradoBloqueado: true}), /ya esta registrado/);
  assert.equal(validatePublicSolicitudForm({...form, imei2: '', imeiRegistrado: validImei1, modelo: ''}), null);
});

test('solicitudes publicas pulls client name from RENIEC when creating a link', async () => {
  const db = new FakeDb();
  let reniecCalls = 0;

  const result = await __test.createLink(db, {dni: '12345678'}, {
    uid: 'operator-1',
    email: 'operator@example.test',
  }, {ipAddress: '127.0.0.1'}, {
    headers: {origin: 'https://app.example.test'},
  }, {
    consultarReniecDniSeguro: async dni => {
      reniecCalls += 1;
      assert.equal(dni, '12345678');
      return {success: true, result: {full_name: 'PEREZ LOPEZ ANA MARIA'}};
    },
  });

  assert.equal(result.nombreCliente, 'PEREZ LOPEZ ANA MARIA');
  assert.equal(reniecCalls, 1);
  const stored = [...db.store.entries()].find(([path]) => path.includes('/solicitudesPublicas/'))?.[1];
  assert.equal(stored.nombreCliente, 'PEREZ LOPEZ ANA MARIA');
  assert.equal(stored.nombreClienteSource, 'reniec');
});

test('solicitudes publicas completes old empty links from RENIEC on load and throttles failures', async () => {
  const tokenId = __test.tokenHash(validToken);
  const solicitudPath = `${basePath}/solicitudesPublicas/${tokenId}`;
  const db = new FakeDb({
    [solicitudPath]: {
      dni: '12345678',
      nombreCliente: '',
      status: 'CREADA',
      publicUrl: 'https://example.test/solicitud',
      createdAtIso: '2026-01-01T00:00:00.000Z',
    },
  });
  let reniecCalls = 0;

  const loaded = await __test.loadPublic(db, {token: validToken}, {
    consultarReniecDniSeguro: async () => {
      reniecCalls += 1;
      return {success: true, result: {full_name: 'GARCIA ROJAS LUIS'}};
    },
  });

  assert.equal(loaded.nombres, 'GARCIA ROJAS LUIS');
  assert.equal(reniecCalls, 1);
  assert.equal(db.store.get(solicitudPath).nombreClienteSource, 'reniec');

  const failingToken = 'ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210abcd';
  db.store.set(`${basePath}/solicitudesPublicas/${__test.tokenHash(failingToken)}`, {
    dni: '87654321',
    nombreCliente: '',
    status: 'CREADA',
    reniecLookup: {lastAttemptAt: new Date().toISOString(), status: 'ERROR', error: 'RENIEC_UPSTREAM_ERROR'},
  });
  await __test.loadPublic(db, {token: failingToken}, {
    consultarReniecDniSeguro: async () => {
      throw new Error('SHOULD_NOT_RETRY_IMMEDIATELY');
    },
  });
});

test('solicitud publica builds a registro draft with direccion and provincia separated', () => {
  const draft = publicSolicitudToRegistroDraft({
    id: 'public-id-1',
    dni: '12345678',
    nombreCliente: 'CLIENTE PRUEBA',
    submission: {
      ...validSubmission.data,
      dni: '12345678',
      nombres: 'CLIENTE PRUEBA',
      direccion: 'AV SIEMPRE VIVA 123',
      provincia: 'TACNA',
      imei1: validImei1,
      imei2: validImei2,
      imeiRegistrado: validImei2,
      nombreEquipo: 'IPHONE 15 PRO',
      marca: 'APPLE',
    },
  }, {
    tramite: 'REGISTRO',
    tipo: 'TIENDA',
    operador: 'BITEL',
    precio: '0',
    imeiRegistrado: validImei2,
  });

  assert.equal(draft.solicitudPublicaId, 'public-id-1');
  assert.equal(draft.direccionCliente, 'AV SIEMPRE VIVA 123');
  assert.equal(draft.departamentoCliente, 'TACNA');
  assert.equal(draft.imeiRegistrado, validImei2);
  assert.equal(draft.estado, 'NO BLOQUEADO');
});

test('solicitudes publicas validates completion with an existing registro payload', () => {
  const parsed = __test.parseCompleteExistingPayload({
    id: 'public-id-1',
    registroId: 'registro-id-1',
    nRegistro: 'RECO-00010',
    operacion: {
      tramite: 'REGISTRO',
      tipo: 'TIENDA',
      operador: 'BITEL',
      precio: '0',
      imeiRegistrado: validImei1,
    },
  });
  assert.equal(parsed.id, 'public-id-1');
  assert.equal(parsed.registroId, 'registro-id-1');
  assert.equal(parsed.nRegistro, 'RECO-00010');
  assert.equal(parsed.operacion.imeiRegistrado, validImei1);
  assert.throws(() => __test.parseCompleteExistingPayload({
    id: 'public-id-1',
    registroId: '../bad',
    operacion: {imeiRegistrado: validImei1},
  }), /VALIDATION_ERROR/);
});

test('solicitudes publicas list prunes completed links whose registro code no longer exists', async () => {
  const db = new FakeDb({
    [`${basePath}/solicitudesPublicas/keep`]: {
      dni: '12345678',
      status: 'TERMINADA',
      publicUrl: 'https://example.test/keep',
      createdAtIso: '2026-01-03T00:00:00.000Z',
      completedNRegistro: 'REG-1',
    },
    [`${basePath}/solicitudesPublicas/drop`]: {
      dni: '87654321',
      status: 'TERMINADA',
      publicUrl: 'https://example.test/drop',
      createdAtIso: '2026-01-02T00:00:00.000Z',
      completedNRegistro: 'REG-MISSING',
    },
    [`${basePath}/solicitudesPublicas/pending`]: {
      dni: '11223344',
      status: 'COMPLETADA',
      publicUrl: 'https://example.test/pending',
      createdAtIso: '2026-01-01T00:00:00.000Z',
    },
    [`${basePath}/registros/registro-1`]: {
      nRegistro: 'REG-1',
      dniCliente: '12345678',
    },
  });

  const result = await __test.listLinks(db);

  assert.deepEqual(result.solicitudes.map(item => item.id), ['keep', 'pending']);
  assert.equal(db.store.has(`${basePath}/solicitudesPublicas/drop`), false);
  assert.equal(db.store.get(`${basePath}/solicitudesPublicas/keep`).completedRegistroId, 'registro-1');
});
