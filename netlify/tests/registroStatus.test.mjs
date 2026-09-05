import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEstadoSolicitudPayload, parseRegistroPayload, parseRegistroSamsungDualPayload} from '../functions/_validators.mjs';
import {__test as registrosTest, buildSamsungDualRegistrationData} from '../functions/registros.mjs';
import {registroMatchesStatus} from '../../src/utils/searchRecords.js';
import {emptyRegistroEvidencias, missingRegistroEvidencias} from '../../src/features/registros/registroEvidencias.js';

function payloadRegistro(overrides = {}) {
  return {
    cliente: {
      tipoDocumento: 'DNI', dni: '12345678', nombre: 'CLIENTE PRUEBA',
      celular: '999111222', celularRef: '', correo: 'cliente@ejemplo.com',
      direccion: 'TACNA, TACNA', celulares: ['999111222'], correos: ['cliente@ejemplo.com'],
    },
    equipo: {
      idEquipo: '490154203237518', idDuenio: '12345678', imei2: '', sn: '',
      marca: 'PRUEBA', modelo: 'MODELO', nombreComercial: 'EQUIPO PRUEBA',
      ram: '', memoria: '', color: '', isRegistrado: true,
      imei1Registrado: true, imei2Registrado: false,
    },
    registro: {
      tipoDocumentoCliente: 'DNI', dniCliente: '12345678', celularCliente: '999111222',
      celularRef: '', imeiEquipo: '490154203237518', imeiRegistrado: '490154203237518',
      imei2Equipo: '', modeloEquipo: 'MODELO', marcaEquipo: 'PRUEBA',
      nombreComercialEquipo: 'EQUIPO PRUEBA', estado: 'NO BLOQUEADO',
      estadoSolicitud: 'PENDIENTE', operador: 'BITEL', tipo: 'TIENDA', tieneCaja: false,
      precio: '20.00', fecha: '2026-07-23T12:00:00.000Z', boletaExtranjeraId: '',
      boletaExtranjeraNro: '', pdfDniUrl: '', pdfCajaUrl: '', pdfReciboUrl: '',
      ...overrides,
    },
  };
}

function createFirestoreForDualTest() {
  const docs = new Map([['_counters/registros', {last: 40}]]);
  let autoId = 0;
  const collection = path => ({
    kind: 'collection',
    path,
    doc(id = `auto-${++autoId}`) {
      return document(`${path}/${id}`, id);
    },
    where(field, operator, value) {
      assert.equal(operator, '==');
      return {kind: 'query', path, field, value, limit() { return this; }};
    },
  });
  const document = (path, id = path.split('/').at(-1)) => ({
    kind: 'document', path, id,
    collection(name) { return collection(`${path}/${name}`); },
  });
  const snapshotFor = ref => {
    const data = docs.get(ref.path);
    return {exists: Boolean(data), data: () => data ? structuredClone(data) : undefined};
  };
  const querySnapshotFor = query => {
    const prefix = `${query.path}/`;
    const matches = [...docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && data?.[query.field] === query.value)
      .map(([path, data]) => ({id: path.split('/').at(-1), data: () => structuredClone(data), ref: document(path)}));
    return {docs: matches, empty: matches.length === 0, size: matches.length};
  };
  const db = {
    collection(name) { return collection(name); },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        get: async ref => ref.kind === 'query' ? querySnapshotFor(ref) : snapshotFor(ref),
        set: (ref, data, options = {}) => writes.push({ref, data, merge: options.merge === true}),
      };
      const result = await callback(transaction);
      writes.forEach(({ref, data, merge}) => docs.set(ref.path, merge ? {...(docs.get(ref.path) || {}), ...data} : {...data}));
      return result;
    },
  };
  return {db, docs};
}

test('ninguna evidencia fotografica es obligatoria', () => {
  assert.deepEqual(missingRegistroEvidencias(emptyRegistroEvidencias()), []);
});

test('un registro no bloqueado inicia con solicitud pendiente', () => {
  const parsed = parseRegistroPayload(payloadRegistro());
  assert.equal(parsed.registro.estadoSolicitud, 'PENDIENTE');
});

test('tienda y pase no bloqueados aceptan precio cero con IMEI, marca y nombre comercial obligatorios', () => {
  const payload = payloadRegistro({precio: '0', modeloEquipo: ''});
  payload.equipo.modelo = '';

  const parsed = parseRegistroPayload(payload);

  assert.equal(parsed.registro.precio, '0');
  assert.equal(parsed.equipo.nombreComercial, 'EQUIPO PRUEBA');
  assert.equal(parsed.equipo.idEquipo, '490154203237518');

  const pase = parseRegistroPayload(payloadRegistro({tipo: 'PASE', precio: '0'}));
  assert.equal(pase.registro.tipo, 'PASE');
  assert.equal(pase.registro.precio, '0');
});

test('la marca es obligatoria y Samsung exige origen de tienda o externo', () => {
  const missingBrand = payloadRegistro({marcaEquipo: ''});
  missingBrand.equipo.marca = '';
  assert.throws(
    () => parseRegistroPayload(missingBrand),
    error => error.payload?.issues?.some(issue => issue.message === 'MARCA_REQUERIDA'),
  );

  const samsungPase = payloadRegistro({marcaEquipo: 'SAMSUNG', tipo: 'PASE'});
  samsungPase.equipo.marca = 'SAMSUNG';
  assert.throws(
    () => parseRegistroPayload(samsungPase),
    error => error.payload?.issues?.some(issue => issue.message === 'TIPO_SAMSUNG_REQUERIDO'),
  );
  assert.equal(parseRegistroPayload({...samsungPase, registro: {...samsungPase.registro, tipo: 'EXTERNO'}}).registro.tipo, 'EXTERNO');
});

test('el backend valida el registro Samsung doble y los dos celulares distintos', () => {
  const dual = payloadRegistro({
    marcaEquipo: 'SAMSUNG',
    tipo: 'TIENDA',
    imei2Equipo: '356938035643809',
  });
  dual.equipo.marca = 'SAMSUNG';
  dual.equipo.imei2 = '356938035643809';
  dual.celular2 = '988777666';

  const parsed = parseRegistroSamsungDualPayload(dual);
  assert.equal(parsed.celular2, '988777666');
  assert.equal(parsed.equipo.imei2, '356938035643809');

  assert.throws(
    () => parseRegistroSamsungDualPayload({...dual, celular2: dual.cliente.celular}),
    error => error.payload?.issues?.some(issue => issue.message === 'CELULARES_DUPLICADOS'),
  );
  assert.throws(
    () => parseRegistroSamsungDualPayload({...dual, equipo: {...dual.equipo, marca: 'XIAOMI'}, registro: {...dual.registro, marcaEquipo: 'XIAOMI'}}),
    error => error.payload?.issues?.some(issue => issue.message === 'REGISTRO_DUAL_SOLO_SAMSUNG'),
  );
});

test('el registro Samsung doble produce dos solicitudes consecutivas con IMEI y celular propios', () => {
  const parsed = parseRegistroSamsungDualPayload((() => {
    const payload = payloadRegistro({
      marcaEquipo: 'SAMSUNG',
      tipo: 'EXTERNO',
      imei2Equipo: '356938035643809',
    });
    payload.equipo.marca = 'SAMSUNG';
    payload.equipo.imei2 = '356938035643809';
    payload.celular2 = '988777666';
    return payload;
  })());
  const result = buildSamsungDualRegistrationData({...parsed, grupoId: 'samsung-grupo', firstNumber: 41});

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.nRegistro), ['RECO-00041', 'RECO-00042']);
  assert.deepEqual(result.map(item => item.imeiRegistrado), ['490154203237518', '356938035643809']);
  assert.deepEqual(result.map(item => item.celularCliente), ['999111222', '988777666']);
  assert.deepEqual(result.map(item => item.celularRef), ['988777666', '999111222']);
  assert.ok(result.every(item => item.registroDual && item.registroGrupoId === 'samsung-grupo'));
});

test('la transaccion Samsung doble persiste ambas solicitudes, contactos y locks juntos', async () => {
  const payload = payloadRegistro({
    marcaEquipo: 'SAMSUNG',
    tipo: 'TIENDA',
    imei2Equipo: '356938035643809',
  });
  payload.equipo.marca = 'SAMSUNG';
  payload.equipo.imei2 = '356938035643809';
  payload.celular2 = '988777666';
  const {db, docs} = createFirestoreForDualTest();

  const response = await registrosTest.createSamsungDualRegistro(db, payload, {requestId: 'dual-test', user: {uid: 'operator'}});
  assert.equal(response.registros.length, 2);
  assert.deepEqual(response.registros.map(item => item.nRegistro), ['RECO-00041', 'RECO-00042']);
  assert.equal(docs.get('_counters/registros').last, 42);
  assert.deepEqual(docs.get('artifacts/comunicate-pos/users/shared/clientes/12345678').celulares.sort(), ['988777666', '999111222']);
  assert.equal(docs.get('artifacts/comunicate-pos/users/shared/equipos/490154203237518').imei2Registrado, true);
  assert.equal(docs.get('artifacts/comunicate-pos/users/shared/imeiLocks/490154203237518').registroId, response.ids[0]);
  assert.equal(docs.get('artifacts/comunicate-pos/users/shared/imeiLocks/356938035643809').registroId, response.ids[1]);
});

test('el IMEI a registrar debe pertenecer a los dos IMEI editables del equipo', () => {
  const secondary = '356938035643809';
  const payload = payloadRegistro({imei2Equipo: secondary, imeiRegistrado: secondary});
  payload.equipo.imei2 = secondary;
  assert.equal(parseRegistroPayload(payload).registro.imeiRegistrado, secondary);

  assert.throws(
    () => parseRegistroPayload({...payload, registro: {...payload.registro, imeiRegistrado: '865716088094342'}}),
    error => error.payload?.issues?.some(issue => issue.message === 'IMEI_REGISTRADO_NO_PERTENECE'),
  );
  assert.throws(
    () => parseRegistroPayload({...payload, registro: {...payload.registro, imei2Equipo: ''}}),
    error => error.payload?.issues?.some(issue => issue.message === 'IMEI2_NO_COINCIDE'),
  );
});

test('precio cero sigue rechazado fuera de tienda no bloqueada', () => {
  assert.throws(
    () => parseRegistroPayload(payloadRegistro({tipo: 'EXTERNO', precio: '0'})),
    error => error.payload?.issues?.some(issue => issue.message === 'PRECIO_DEBE_SER_MAYOR_A_CERO'),
  );
});

test('un registro bloqueado no acepta estado de solicitud', () => {
  assert.throws(
    () => parseRegistroPayload(payloadRegistro({estado: 'BLOQUEADO', estadoSolicitud: 'PENDIENTE', precio: '50.00'})),
    error => error.payload?.issues?.some(issue => issue.message === 'ESTADO_SOLICITUD_NO_APLICA'),
  );
});

test('un equipo bloqueado pasa a realizado cuando se desbloquea', () => {
  assert.equal(
    registrosTest.resolveEstadoSolicitud(
      {estado: 'BLOQUEADO'},
      {estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'},
    ),
    'REALIZADO',
  );
  assert.equal(
    registrosTest.resolveEstadoSolicitud(
      {estado: 'NO BLOQUEADO'},
      {estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'},
    ),
    'PENDIENTE',
  );
});

test('los filtros separan registrados, pendientes y bloqueados', () => {
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'REALIZADO'}, 'REGISTRADOS'), true);
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'}, 'PENDIENTES'), true);
  assert.equal(registroMatchesStatus({estado: 'NO BLOQUEADO'}, 'PENDIENTES'), true);
  assert.equal(registroMatchesStatus({estado: 'BLOQUEADO'}, 'BLOQUEADOS'), true);
  assert.equal(registroMatchesStatus({estado: 'BLOQUEADO'}, 'REGISTRADOS'), false);
});

test('la accion masiva incluye pendientes y registros antiguos, pero excluye bloqueados y realizados', () => {
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE'}), true);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO'}), true);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'NO BLOQUEADO', estadoSolicitud: 'REALIZADO'}), false);
  assert.equal(registrosTest.shouldCompleteRequestStatus({estado: 'BLOQUEADO', estadoSolicitud: 'PENDIENTE'}), false);
});

test('la accion rapida solo acepta PENDIENTE o REALIZADO', () => {
  assert.deepEqual(
    parseEstadoSolicitudPayload({id: 'registro_1', estadoSolicitud: 'REALIZADO'}),
    {id: 'registro_1', estadoSolicitud: 'REALIZADO'},
  );
  assert.throws(() => parseEstadoSolicitudPayload({id: 'registro_1', estadoSolicitud: 'OTRO'}));
});
