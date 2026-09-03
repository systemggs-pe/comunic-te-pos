import assert from 'node:assert/strict';
import test from 'node:test';
import {APP_VERSION, SYSTEM_VERSION} from '../../src/config/branding.js';
import {LEGAL_DOCUMENT_VERSION, getRequiredLegalSnapshot} from '../../src/config/legal.js';
import {handler} from '../functions/legalConsent.mjs';

test('shared branding and legal config load in the Node API runtime', () => {
  assert.equal(APP_VERSION, '0.0.0');
  assert.equal(SYSTEM_VERSION, 'v0.0');
  assert.match(LEGAL_DOCUMENT_VERSION, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.ok(getRequiredLegalSnapshot().length > 0);
});

test('legal consent endpoint reaches authentication without an import-time failure', async () => {
  const response = await handler({
    httpMethod: 'POST',
    headers: {origin: 'http://localhost:5173'},
    body: '{}',
  });

  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, 'No autorizado');
});
