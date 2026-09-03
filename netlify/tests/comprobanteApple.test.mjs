import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getImeisComprobanteApple,
  luhnImeiApple,
  serializeComprobanteAppleData,
} from '../functions/_comprobanteApple.mjs';

const PRIMARY_IMEI = '490154203237518';
const SECONDARY_IMEI = '356938035643809';

function boletaData(imeis = [PRIMARY_IMEI]) {
  return {
    id: 'receipt-1042',
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
      ventas: [{imeiEquipo: imeis[0], imei2Equipo: imeis[1] || '', marcaEquipo: 'APPLE', precio: 1200, sn: 'SERIAL-APPLE'}],
      equiposMap: {[imeis[0]]: {imei2: imeis[1] || '', marca: 'APPLE', partNumber: 'MPUA3LL/A'}},
      totalClp: 300000,
      nBoleta: 1042,
      emisor: {
        nombre: 'Apple Columbia',
        tipoCambioPenUsd: 3.75,
        impuestoPorcentaje: 6,
        tarjetaUltimos4: '3282',
        codigoTerminal: '025039',
      },
    },
  };
}

test('Apple receipt serializer keeps only bounded fields and both valid IMEIs', () => {
  const result = serializeComprobanteAppleData(boletaData([PRIMARY_IMEI, SECONDARY_IMEI]));
  assert.equal(result.id, 'receipt-1042');
  assert.equal(result.nBoleta, 1042);
  assert.deepEqual(getImeisComprobanteApple(result), [PRIMARY_IMEI, SECONDARY_IMEI]);
  assert.equal(result.boletaData.ventas[0].marcaEquipo, 'APPLE');
  assert.equal(result.boletaData.ventas[0].sn, 'SERIAL-APPLE');
  assert.equal(result.boletaData.equiposMap[PRIMARY_IMEI].partNumber, 'MPUA3LL/A');
  assert.equal(result.boletaData.emisor.metodoPago, '');
  assert.equal(result.boletaData.emisor.tipoCambioPenUsd, 3.75);
  assert.equal(result.boletaData.emisor.tarjetaUltimos4, '3282');
});

test('luhnImeiApple validates the IMEI before a remote query', () => {
  assert.equal(luhnImeiApple(PRIMARY_IMEI), true);
  assert.equal(luhnImeiApple('490154203237519'), false);
  assert.equal(luhnImeiApple(`${PRIMARY_IMEI}9`), false);
});
