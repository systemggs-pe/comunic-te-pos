import assert from 'node:assert/strict';
import test from 'node:test';
import {parseImageDataUri} from '../functions/_storage.mjs';

test('parseImageDataUri accepts supported images and returns binary metadata', () => {
  const dataUri = `data:image/jpg;base64,${Buffer.from('imagen').toString('base64')}`;
  const parsed = parseImageDataUri(dataUri);
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.equal(parsed.size, 6);
  assert.equal(parsed.buffer.toString(), 'imagen');
});

test('parseImageDataUri rejects unsupported or empty content', () => {
  assert.throws(() => parseImageDataUri('data:image/svg+xml;base64,PHN2Zy8+'), /EVIDENCIA_FORMATO_INVALIDO/);
  assert.throws(() => parseImageDataUri('data:image/jpeg;base64,'), /EVIDENCIA_FORMATO_INVALIDO/);
  const large = `data:image/jpeg;base64,${Buffer.from('123456').toString('base64')}`;
  assert.throws(() => parseImageDataUri(large, 5), /EVIDENCIA_MUY_GRANDE/);
});
