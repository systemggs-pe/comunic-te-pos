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

test('local box parser handles the Redmi A7 Pro label layout and separates its color', () => {
  const result = parseBoxOcr({
    barcodes: [
      {rawValue: 'https://www.mi.com/cl/regulatoryinfo/subt', y: 10},
      {rawValue: '74440/66NN07979', y: 20},
    ],
    text: [
      'REDMI A7 Pro Black',
      '4GB RAM 64GB ROM',
      'Product Model: 25128RN17L',
      'Manufacturer: Xiaomi Communications Co., Ltd.',
      'IMEI1:869084082793146',
      'Regulatory: 781517700107715',
      '869084082793153',
    ].join('\n'),
    ocrConfidence: 82,
  });

  assert.deepEqual(result.data, {
    imei1: '869084082793146',
    imei2: '869084082793153',
    sn: '74440/66NN07979',
    marca: 'XIAOMI',
    modelo: '25128RN17L',
    nombreComercial: 'REDMI A7 PRO',
    ram: '4',
    memoria: '64',
    color: 'BLACK',
  });
  assert.equal(result.fields.sn.source, 'barcode');
  assert.equal(result.fields.color.source, 'ocr-suffix');
});

test('local verifier moves a specific color out of the commercial name and upgrades a generic color', () => {
  const result = parseBoxOcr({
    text: [
      'REDMI NOTE 15 PRO + 5G GLACIAR BLUE',
      'MODEL: 2601RN15G',
      'RAM: 8GB',
      'ROM: 256GB',
      'COLOR: BLUE',
    ].join('\n'),
    ocrConfidence: 86,
  });

  assert.equal(result.data.marca, 'XIAOMI');
  assert.equal(result.data.nombreComercial, 'REDMI NOTE 15 PRO + 5G');
  assert.equal(result.data.color, 'GLACIAR BLUE');
  assert.equal(result.fields.color.source, 'domain-rule');
  assert.match(result.fields.color.reason, /color comercial/i);
});
