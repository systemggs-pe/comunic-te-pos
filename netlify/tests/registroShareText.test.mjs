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

test('shared single Samsung registration omits store or external origin', () => {
  const externo = construirTextoRegistro(baseRegistro);
  const tienda = construirTextoRegistro({...baseRegistro, tipo: 'TIENDA'});
  assert.doesNotMatch(externo, /ORIGEN DEL EQUIPO SAMSUNG|TIPO:|EXTERNO/);
  assert.doesNotMatch(tienda, /ORIGEN DEL EQUIPO SAMSUNG|TIPO:|TIENDA/);
  assert.match(externo, /IMEI A REGISTRAR: 356938035643809/);
});

test('shared non-Samsung registration keeps its general type', () => {
  assert.match(construirTextoRegistro({...baseRegistro, marcaEquipo: 'APPLE', tipo: 'PASE'}), /TIPO: PASE/);
});

test('dual Samsung requests share both IMEIs and their distinct phone numbers', () => {
  const dual = construirTextoRegistro({
    ...baseRegistro,
    registroDual: true,
    registroGrupoPosicion: 2,
    celularCliente: '988777666',
    celularRef: '999111222',
    nombreCliente: 'CLIENTE SAMSUNG',
    direccionCliente: 'AV. TACNA 123',
    correoCliente: 'cliente@example.com',
    estado: 'NO BLOQUEADO',
  });

  assert.match(dual, /^DETALLE DE SOLICITUD: REGISTRO/);
  assert.match(dual, /IMEI 1: 490154203237518/);
  assert.match(dual, /IMEI 2: 356938035643809/);
  assert.match(dual, /CELULAR 1: 999111222/);
  assert.match(dual, /CELULAR 2: 988777666/);
  assert.match(dual, /CORREO ELECTRONICO: cliente@example\.com/);
  assert.match(dual, /\n\nEXTERNO$/);
  assert.doesNotMatch(dual, /IMEI A REGISTRAR|ORIGEN DEL EQUIPO SAMSUNG/);
});

test('dual blocked Samsung requests use the whitelist-unlock detail', () => {
  assert.match(
    construirTextoRegistro({...baseRegistro, registroDual: true, estado: 'BLOQUEADO'}),
    /^DETALLE DE SOLICITUD: DESBLOQUEO LISTA BLANCA/,
  );
});
