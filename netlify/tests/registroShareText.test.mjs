import test from 'node:test';
import assert from 'node:assert/strict';
import {construirTextoRegistro} from '../../src/features/registros/registroShareText.js';

const baseRegistro = {
  imeiEquipo: '490154203237518',
  imei2Equipo: '356938035643809',
  imeiRegistrado: '356938035643809',
  marcaEquipo: 'SAMSUNG',
  tipo: 'EXTERNO',
  tieneCaja: true,
  tipoDocumentoCliente: 'DNI',
  dniCliente: '12345678',
};

test('shared Samsung registration explicitly includes EXTERNO or TIENDA', () => {
  const externo = construirTextoRegistro(baseRegistro);
  const tienda = construirTextoRegistro({...baseRegistro, tipo: 'TIENDA'});
  assert.match(externo, /ORIGEN DEL EQUIPO SAMSUNG: EXTERNO/);
  assert.match(tienda, /ORIGEN DEL EQUIPO SAMSUNG: TIENDA/);
  assert.match(externo, /IMEI A REGISTRAR: 356938035643809/);
});

test('shared non-Samsung registration keeps its general type', () => {
  assert.match(construirTextoRegistro({...baseRegistro, marcaEquipo: 'APPLE', tipo: 'PASE'}), /TIPO: PASE/);
});
