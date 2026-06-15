import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DNI_PHOTO_TYPES,
  normalizeDniPhotosResponse,
  parseDniPhotoPayload,
} from '../functions/dniFotos.mjs';

test('parseDniPhotoPayload only accepts eight digit DNI values', () => {
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678'}), {dni: '12345678', tipo: 'azul'});
  assert.deepEqual(parseDniPhotoPayload({dni: '12345678', tipo: 'electronico'}), {dni: '12345678', tipo: 'electronico'});
  assert.throws(() => parseDniPhotoPayload({dni: 'ABC12345'}), /DNI_INVALIDO/);
  assert.throws(() => parseDniPhotoPayload({dni: '123456789'}), /DNI_INVALIDO/);
  assert.throws(() => parseDniPhotoPayload({dni: '12345678', tipo: 'verde'}), /DNI_FOTO_TIPO_INVALIDO/);
  assert.equal(DNI_PHOTO_TYPES.azul.url.endsWith('/dniv'), true);
  assert.equal(DNI_PHOTO_TYPES.electronico.url.endsWith('/dnivel'), true);
});

test('normalizeDniPhotosResponse maps safe image data URIs only', () => {
  const normalized = normalizeDniPhotosResponse({
    success: true,
    source: 'CODART_X_API_V1',
    data: {
      dni: '12345678',
      nombres: 'NOMBRE',
      apellidos: 'APELLIDO',
      images: [
        {data_uri: 'data:image/png;base64,aGVsbG8='},
        {data_uri: 'data:image/jpeg;base64,aGVsbG8='},
        {data_uri: 'data:image/svg+xml;base64,aGVsbG8='},
      ],
    },
  }, '12345678', 'electronico');

  assert.equal(normalized.success, true);
  assert.equal(normalized.data.tipo, 'electronico');
  assert.equal(normalized.data.tipoLabel, 'DNI electronico');
  assert.equal(normalized.data.dni, '12345678');
  assert.equal(normalized.data.images.length, 2);
  assert.equal(normalized.data.images[0].side, 'front');
  assert.equal(normalized.data.images[1].side, 'back');
});
