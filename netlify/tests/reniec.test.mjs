import test from 'node:test';
import assert from 'node:assert/strict';
import {__test} from '../functions/reniec.mjs';

test('RENIEC expone solo documento y nombre al formulario', () => {
  const normalized = __test.normalizeReniecResponse({
    success: true,
    result: {
      dni: '12345678',
      nombres: 'ANA MARIA',
      apellidoPaterno: 'PEREZ',
      apellidoMaterno: 'LOPEZ',
      direccion: 'DIRECCION QUE NO DEBE SALIR',
      correo: 'reniec@ejemplo.com',
      telefono: '999111222',
    },
  }, '12345678');

  assert.deepEqual(normalized.result, {
    document_number: '12345678',
    full_name: 'PEREZ LOPEZ ANA MARIA',
  });
  assert.equal('address' in normalized.result, false);
  assert.equal('email' in normalized.result, false);
  assert.equal('phone' in normalized.result, false);
});
