import assert from 'node:assert/strict';
import test from 'node:test';
import verifierModel from '../../packages/local-field-verifier/models/model.generated.js';
import {buildBoxCorrectionExample, trainAutomaticBoxModel} from '../../src/services/boxLearningStore.js';
import {verifyBoxData} from '../../src/utils/boxDataVerifier.js';

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

test('local corrections train automatically and are applied before the bundled model', () => {
  const examples = [
    {
      before: {nombreComercial: 'EQUIPO A DESERT GOLD', color: 'GOLD'},
      after: {nombreComercial: 'EQUIPO A', color: 'DESERT GOLD'},
    },
    {
      before: {nombreComercial: 'EQUIPO B DESERT GOLD', color: 'GOLD'},
      after: {nombreComercial: 'EQUIPO B', color: 'DESERT GOLD'},
    },
  ];
  const localModel = trainAutomaticBoxModel(examples);
  const result = verifyBoxData({
    nombreComercial: 'EQUIPO C DESERT GOLD',
    color: 'GOLD',
  }, {models: [localModel, verifierModel]});

  assert.equal(localModel.version, 'local.2');
  assert.equal(result.data.nombreComercial, 'EQUIPO C');
  assert.equal(result.data.color, 'DESERT GOLD');
  assert.equal(result.modelVersion, 'local.2+1.0.0');
});

test('automatic training ignores a single correction to avoid overfitting', () => {
  const localModel = trainAutomaticBoxModel([
    {before: {marca: 'UNKNOWN'}, after: {marca: 'SAMSUNG'}},
  ]);

  assert.equal(localModel, null);
});
