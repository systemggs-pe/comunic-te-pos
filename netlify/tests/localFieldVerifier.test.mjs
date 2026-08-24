import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeCorrectionExample,
  trainCorrectionModel,
  verifyFields,
} from '../../packages/local-field-verifier/src/index.js';

const learningExamples = [
  {
    before: {nombreComercial: 'REDMI NOTE 14 GLACIAR BLUE', color: 'BLUE'},
    after: {nombreComercial: 'REDMI NOTE 14', color: 'GLACIAR BLUE'},
  },
  {
    before: {nombreComercial: 'POCO X8 GLACIAR BLUE', color: 'BLUE'},
    after: {nombreComercial: 'POCO X8', color: 'GLACIAR BLUE'},
  },
];

test('reusable model learns a cross-field phrase transfer and generalizes it', () => {
  const model = trainCorrectionModel(learningExamples, {
    allowedFields: ['nombreComercial', 'color'],
    minCount: 2,
    trainedAt: '2026-08-24T00:00:00.000Z',
  });
  const result = verifyFields({
    extracted: {nombreComercial: 'EQUIPO DEMO GLACIAR BLUE', color: 'BLUE'},
    model,
  });

  assert.equal(model.transfers.length, 1);
  assert.deepEqual(result.data, {
    nombreComercial: 'EQUIPO DEMO',
    color: 'GLACIAR BLUE',
  });
  assert.equal(result.changes[0].source, 'model-transfer');
});

test('reusable model cannot modify protected identifiers', () => {
  const model = trainCorrectionModel([
    {before: {imei1: '123'}, after: {imei1: '456'}},
  ], {allowedFields: ['imei1'], minCount: 1});
  const result = verifyFields({
    extracted: {imei1: '123'},
    model,
    protectedFields: ['imei1'],
  });

  assert.equal(result.data.imei1, '123');
  assert.deepEqual(result.changes, []);
});

test('training sanitizer removes sensitive fields and 15-digit values', () => {
  const example = sanitizeCorrectionExample({
    before: {nombreComercial: '123456789012345', color: 'BLUE', imei1: '490154203237518', sn: 'SECRET123'},
    after: {nombreComercial: 'REDMI NOTE', color: 'GLACIAR BLUE', imei1: '356938035643809', sn: 'OTHER456'},
  }, {allowedFields: ['nombreComercial', 'color', 'imei1', 'sn']});

  assert.deepEqual(Object.keys(example.before), ['nombreComercial', 'color']);
  assert.equal(example.before.nombreComercial, '');
  assert.equal(example.after.nombreComercial, 'REDMI NOTE');
  assert.equal(JSON.stringify(example).includes('490154203237518'), false);
  assert.equal(JSON.stringify(example).includes('SECRET123'), false);
});
