import assert from 'node:assert/strict';
import test from 'node:test';
import {getRegistroEvidencePdfPlan} from '../../src/features/registros/registroEvidenciasPdf.js';
import {createAppleStoreReceiptPages} from '../../src/features/registros/appleStoreReceiptPdf.js';

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

test('Apple receipt uses the canonical Apple Store letter content', () => {
  const [page] = createAppleStoreReceiptPages({
    id: 'apple-receipt-1',
    nBoleta: 1263,
    boletaData: {
      fechaHora: '2025-06-21T15:48:00-04:00',
      nBoleta: 1263,
      ventas: [{
        imeiEquipo: '356649305325197',
        imei2Equipo: '356649305004321',
        nombreComercial: 'iPhone 16e',
        color: 'WHITE',
        memoria: '128',
        precio: 2100,
        sn: 'M0W2T7PWQG',
      }],
      equiposMap: {},
      emisor: {tipoCambioPenUsd: 3.75, impuestoPorcentaje: 6},
    },
  });

  assert.equal(page.emisor.nombre, 'Apple Columbia');
  assert.equal(page.productName, 'IPHONE 16E WHITE 128-USA');
  assert.equal(page.imei1, '356649305325197');
  assert.equal(page.imei2, '356649305004321');
  assert.equal(page.serial, 'M0W2T7PWQG');
  assert.equal(page.total, 560);
  assert.equal(page.subtotal, 528.3);
  assert.equal(page.tax, 31.7);
  assert.doesNotMatch(JSON.stringify(page), /R\.U\.T\. SIMULADO|DOCUMENTO ASOCIADO|FORMATO 6/);
});
