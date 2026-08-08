import test from 'node:test';
import assert from 'node:assert/strict';
import {getRetentionConfig, retentionCutoffIso} from '../functions/_retention.mjs';

test('retention config applies safe defaults and caps', () => {
  const config = getRetentionConfig({dniFotosDays: 0, batchSize: 9999});
  assert.equal(config.dniFotosDays, 90);
  assert.equal(config.batchSize, 100);
});

test('retention cutoff is deterministic', () => {
  const now = Date.parse('2026-08-08T00:00:00.000Z');
  assert.equal(retentionCutoffIso(1, now), '2026-08-07T00:00:00.000Z');
});
