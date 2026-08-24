import assert from 'node:assert/strict';
import test from 'node:test';
import {parseBoxOcr} from '../../src/utils/boxOcr.js';

test('local box parser prioritizes valid barcode IMEIs and extracts labelled fields', () => {
  const result = parseBoxOcr({
    barcodes: [
      {rawValue: '490154203237518', y: 20},
      {rawValue: '356938035643809', y: 80},
    ],
    text: [
      'SAMSUNG GALAXY A56 5G',
      'MODEL NO: SM-A566E',
      'S/N: RF8X12345YZ',
      'RAM: 8GB',
      'STORAGE: 256GB',
      'COLOR: AWESOME BLACK',
    ].join('\n'),
    ocrConfidence: 84,
  });

  assert.deepEqual(result.data, {
    imei1: '490154203237518',
    imei2: '356938035643809',
    sn: 'RF8X12345YZ',
    marca: 'SAMSUNG',
    modelo: 'SM-A566E',
    nombreComercial: 'SAMSUNG GALAXY A56 5G',
    ram: '8',
    memoria: '256',
    color: 'AWESOME BLACK',
  });
  assert.equal(result.fields.imei1.confidence, 'high');
  assert.equal(result.fields.imei1.source, 'barcode');
  assert.deepEqual(result.warnings, []);
});

test('local box parser corrects common OCR digit confusions only when Luhn remains valid', () => {
  const result = parseBoxOcr({
    text: [
      'IMEI 1: 49O1542O3237518',
      'IMEI 2: 356938O356438O9',
      'XIAOMI REDMI NOTE 13',
      'MODEL: 23053RN02A',
      'MEMORY: 8GB + 256GB',
      'COLOUR: MIDNIGHT BLACK',
    ].join('\n'),
    ocrConfidence: 72,
  });

  assert.equal(result.data.imei1, '490154203237518');
  assert.equal(result.data.imei2, '356938035643809');
  assert.equal(result.data.marca, 'XIAOMI');
  assert.equal(result.data.nombreComercial, 'XIAOMI REDMI NOTE 13');
  assert.equal(result.data.modelo, '23053RN02A');
  assert.equal(result.data.ram, '8');
  assert.equal(result.data.memoria, '256');
  assert.equal(result.data.color, 'MIDNIGHT BLACK');
});

test('local box parser never returns an IMEI that fails Luhn', () => {
  const result = parseBoxOcr({
    barcodes: [{rawValue: '123456789012345'}],
    text: 'IMEI 1: 123456789012345\nMODEL: XT2343-1\nMOTOROLA',
    ocrConfidence: 90,
  });

  assert.equal(result.data.imei1, '');
  assert.equal(result.data.imei2, '');
  assert.equal(result.data.marca, 'MOTOROLA');
  assert.equal(result.data.modelo, 'XT2343-1');
  assert.match(result.warnings[0], /No se encontro un IMEI valido/);
});
