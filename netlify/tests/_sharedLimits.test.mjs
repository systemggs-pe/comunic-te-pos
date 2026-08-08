import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBody} from '../functions/_shared.mjs';
import {__test as geminiTest} from '../functions/analizarCajaGemini.mjs';

test('parseBody rejects oversized JSON before parsing', () => {
  assert.throws(
    () => parseBody({body: JSON.stringify({payload: '1234567890'})}, 10),
    error => error.status === 413 && error.message === 'CUERPO_MUY_GRANDE',
  );
});

test('parseBody accepts JSON within the configured limit', () => {
  assert.deepEqual(parseBody({body: JSON.stringify({ok: true})}, 100), {ok: true});
});

test('Gemini image input enforces base64 MIME and size', () => {
  assert.equal(geminiTest.normalizeImageBase64('data:image/jpeg;base64,AA=='), 'AA==');
  assert.throws(() => geminiTest.normalizeImageBase64('data:text/plain;base64,AA=='), /IMAGEN_BASE64_INVALIDA/);
});
