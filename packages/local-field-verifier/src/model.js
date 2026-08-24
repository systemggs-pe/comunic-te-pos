import {removedSuffix} from './features.js';
import {normalizeFieldValue} from './normalize.js';
import {sanitizeCorrectionExample} from './sanitizer.js';

export const MODEL_SCHEMA_VERSION = 1;

function incrementNested(store, firstKey, secondKey) {
  if (!store.has(firstKey)) store.set(firstKey, new Map());
  const nested = store.get(firstKey);
  nested.set(secondKey, (nested.get(secondKey) || 0) + 1);
}

function bestOptions(nested, minCount) {
  const total = [...nested.values()].reduce((sum, count) => sum + count, 0);
  return [...nested.entries()]
    .map(([output, count]) => ({output, count, confidence: total ? count / total : 0}))
    .filter(option => option.count >= minCount)
    .sort((left, right) => right.confidence - left.confidence || right.count - left.count);
}

function learnTransfers(example, store) {
  for (const fromField of example.changedFields) {
    const phrase = removedSuffix(example.before[fromField], example.after[fromField]);
    if (!phrase) continue;
    for (const toField of example.changedFields) {
      if (fromField === toField || normalizeFieldValue(example.after[toField]) !== phrase) continue;
      const key = `${fromField}\u0000${toField}\u0000${phrase}`;
      store.set(key, (store.get(key) || 0) + 1);
    }
  }
}

export function createEmptyModel() {
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    kind: 'correction-memory-v1',
    version: '0.0.0',
    trainedAt: null,
    exampleCount: 0,
    fields: [],
    replacements: {},
    transfers: [],
  };
}

export function trainCorrectionModel(examples = [], {
  allowedFields,
  minCount = 2,
  version = '1.0.0',
  trainedAt = new Date().toISOString(),
} = {}) {
  const sanitized = examples
    .map(example => sanitizeCorrectionExample(example, {allowedFields}))
    .filter(Boolean);
  const replacements = new Map();
  const transfers = new Map();
  const fieldNames = new Set();

  for (const example of sanitized) {
    for (const field of example.changedFields) {
      fieldNames.add(field);
      const input = example.before[field];
      const output = example.after[field];
      if (!input || !output || input === output) continue;
      const key = `${field}\u0000${input}`;
      incrementNested(replacements, key, output);
    }
    learnTransfers(example, transfers);
  }

  const replacementOutput = {};
  for (const [key, nested] of replacements.entries()) {
    const [field, input] = key.split('\u0000');
    const options = bestOptions(nested, Math.max(1, Number(minCount) || 1));
    if (!options.length) continue;
    if (!replacementOutput[field]) replacementOutput[field] = {};
    replacementOutput[field][input] = options;
  }

  const transferOutput = [...transfers.entries()]
    .map(([key, count]) => {
      const [fromField, toField, phrase] = key.split('\u0000');
      return {fromField, toField, phrase, count, confidence: 1};
    })
    .filter(item => item.count >= Math.max(1, Number(minCount) || 1))
    .sort((left, right) => right.count - left.count || right.phrase.length - left.phrase.length);

  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    kind: 'correction-memory-v1',
    version: String(version || '1.0.0'),
    trainedAt,
    exampleCount: sanitized.length,
    fields: [...fieldNames].sort(),
    replacements: replacementOutput,
    transfers: transferOutput,
  };
}
