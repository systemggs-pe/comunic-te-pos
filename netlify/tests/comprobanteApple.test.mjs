import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findComprobanteAppleByIdAndImei,
  findComprobanteAppleByImei,
  luhnImeiApple,
} from '../functions/_comprobanteApple.mjs';

function fakeDoc(id, data) {
  return data
    ? {id, exists: true, data: () => data}
    : {id, exists: false, data: () => undefined};
}

function createBoletasRef(seed = {}) {
  const calls = [];
  return {
    calls,
    doc(id) {
      return {
        async get() {
          calls.push({type: 'doc', id});
          return fakeDoc(id, seed[id]);
        },
      };
    },
    where(field, operator, value) {
      return {
        limit(limitValue) {
          return {
            async get() {
              calls.push({type: 'query', field, operator, value, limit: limitValue});
              const match = Object.entries(seed).find(([, data]) => {
                if (operator === 'array-contains') return Array.isArray(data[field]) && data[field].includes(value);
                return data[field] === value;
              });
              const docs = match ? [fakeDoc(match[0], match[1])] : [];
              return {docs, empty: docs.length === 0};
            },
          };
        },
      };
    },
  };
}

const PRIMARY_IMEI = '490154203237518';
const SECONDARY_IMEI = '356938035643809';

function boletaData(imeis = [PRIMARY_IMEI]) {
  return {
    nBoleta: 1042,
    clienteDni: '12345678',
    clienteNombre: 'CLIENTE APPLE',
    totalPen: 1200,
    totalClp: 300000,
    formato: 1,
    boletaEquipoKey: imeis[0],
    boletaEquipoKeys: imeis,
    boletaData: {
      cliente: {nombre: 'CLIENTE APPLE', dni: '12345678'},
      ventas: [{imeiEquipo: imeis[0], imei2Equipo: imeis[1] || '', marcaEquipo: 'APPLE', precio: 1200}],
      equiposMap: {[imeis[0]]: {imei2: imeis[1] || '', marca: 'APPLE'}},
      totalClp: 300000,
      nBoleta: 1042,
    },
  };
}

test('findComprobanteAppleByImei resolves a primary IMEI with one document read', async () => {
  const ref = createBoletasRef({[PRIMARY_IMEI]: boletaData()});
  const result = await findComprobanteAppleByImei(ref, PRIMARY_IMEI);

  assert.equal(result.id, PRIMARY_IMEI);
  assert.equal(result.nBoleta, 1042);
  assert.equal(ref.calls.length, 1);
});

test('findComprobanteAppleByImei uses an exact array query for a secondary IMEI', async () => {
  const ref = createBoletasRef({[PRIMARY_IMEI]: boletaData([PRIMARY_IMEI, SECONDARY_IMEI])});
  const result = await findComprobanteAppleByImei(ref, SECONDARY_IMEI);

  assert.equal(result.id, PRIMARY_IMEI);
  assert.deepEqual(ref.calls.map(call => call.type), ['doc', 'query']);
  assert.equal(ref.calls[1].field, 'boletaEquipoKeys');
  assert.equal(ref.calls[1].limit, 1);
});

test('findComprobanteAppleByImei returns null after bounded exact lookups', async () => {
  const ref = createBoletasRef({});
  const result = await findComprobanteAppleByImei(ref, PRIMARY_IMEI);

  assert.equal(result, null);
  assert.equal(ref.calls.length, 3);
  assert.ok(ref.calls.slice(1).every(call => call.limit === 1));
});

test('findComprobanteAppleByIdAndImei verifies that the stored receipt contains the IMEI', async () => {
  const ref = createBoletasRef({receipt: boletaData([PRIMARY_IMEI])});

  assert.equal((await findComprobanteAppleByIdAndImei(ref, 'receipt', PRIMARY_IMEI))?.id, 'receipt');
  assert.equal(await findComprobanteAppleByIdAndImei(ref, 'receipt', SECONDARY_IMEI), null);
});

test('luhnImeiApple validates the IMEI before querying', () => {
  assert.equal(luhnImeiApple(PRIMARY_IMEI), true);
  assert.equal(luhnImeiApple('490154203237519'), false);
  assert.equal(luhnImeiApple(`${PRIMARY_IMEI}9`), false);
});
