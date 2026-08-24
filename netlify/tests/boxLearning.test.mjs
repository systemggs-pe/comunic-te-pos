import assert from 'node:assert/strict';
import test from 'node:test';
import {buildBoxCorrectionExample} from '../../src/services/boxLearningStore.js';

test('local learning example never contains IMEI, serial or raw OCR text', () => {
  const example = buildBoxCorrectionExample({
    data: {
      imei1: '490154203237518',
      imei2: '356938035643809',
      sn: 'RF8X12345YZ',
      marca: 'XIAOMI',
      modelo: '2601RN15G',
      nombreComercial: 'REDMI NOTE 15 PRO + 5G GLACIAR BLUE',
      ram: '8',
      memoria: '256',
      color: 'BLUE',
    },
    fields: {
      imei1: {source: 'barcode'},
      imei2: {source: 'ocr-labelled'},
    },
    diagnostics: {
      modelVersion: '0.0.0',
      rawText: 'IMEI1: 490154203237518',
    },
  }, {
    imei1: '490154203237518',
    imei2: '356938035643809',
    sn: 'RF8X12345YZ',
    marca: 'XIAOMI',
    modelo: '2601RN15G',
    nombreComercial: 'REDMI NOTE 15 PRO + 5G',
    ram: '8',
    memoria: '256',
    color: 'GLACIAR BLUE',
  });
  const serialized = JSON.stringify(example);

  assert.deepEqual(example.changedFields, ['nombreComercial', 'color']);
  assert.equal(serialized.includes('490154203237518'), false);
  assert.equal(serialized.includes('356938035643809'), false);
  assert.equal(serialized.includes('RF8X12345YZ'), false);
  assert.equal(serialized.includes('rawText'), false);
  assert.equal(example.quality.imei1ValidAfter, true);
});
