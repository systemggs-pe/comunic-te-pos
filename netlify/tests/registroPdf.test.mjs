import assert from 'node:assert/strict';
import test from 'node:test';
import {getRegistroEvidencePdfPlan} from '../../src/features/registros/registroEvidenciasPdf.js';

test('registration evidence PDF plan keeps two pages and required evidence slots', () => {
  const plan = getRegistroEvidencePdfPlan();
  assert.equal(plan.pages, 2);
  assert.deepEqual(plan.requiredPages, [1, 2]);
  assert.deepEqual(plan.slots.map(slot => slot.key), ['dniFrente', 'dniReverso', 'cajaEquipo', 'boletaVenta', 'imeiLogico']);
});

test('Apple PDF plan uses the Apple layout without mutating shared slots', () => {
  const standard = getRegistroEvidencePdfPlan();
  const apple = getRegistroEvidencePdfPlan({formatoApple: true});
  assert.equal(apple.slots.length, 4);
  assert.deepEqual(apple.requiredPages, [1]);
  assert.equal(standard.slots.length, 5);
});
