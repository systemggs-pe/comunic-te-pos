import {stripSuffix, targetAcceptsPhrase} from './features.js';
import {normalizeRecord} from './normalize.js';
import {MODEL_SCHEMA_VERSION} from './model.js';

function accepted(field, value, validators) {
  const validator = validators?.[field];
  return typeof validator !== 'function' || validator(value) === true;
}

function addChange(changes, field, before, after, source, confidence, reason) {
  if (before === after) return;
  changes.push({field, before, after, source, confidence, reason});
}

export function verifyFields({
  extracted = {},
  model,
  threshold = 0.92,
  protectedFields = [],
  validators = {},
} = {}) {
  const fields = Object.keys(extracted || {});
  const original = normalizeRecord(extracted, fields);
  const data = {...original};
  const changes = [];
  const protectedSet = new Set(protectedFields);
  const usableModel = model?.schemaVersion === MODEL_SCHEMA_VERSION ? model : null;

  for (const transfer of usableModel?.transfers || []) {
    if (Number(transfer.confidence) < threshold) continue;
    if (protectedSet.has(transfer.fromField) || protectedSet.has(transfer.toField)) continue;
    if (!Object.prototype.hasOwnProperty.call(data, transfer.fromField)
      || !Object.prototype.hasOwnProperty.call(data, transfer.toField)) continue;
    const fromValue = data[transfer.fromField];
    const toValue = data[transfer.toField];
    const nextFrom = stripSuffix(fromValue, transfer.phrase);
    if (nextFrom === fromValue || !targetAcceptsPhrase(toValue, transfer.phrase)) continue;
    if (!accepted(transfer.fromField, nextFrom, validators)
      || !accepted(transfer.toField, transfer.phrase, validators)) continue;
    data[transfer.fromField] = nextFrom;
    data[transfer.toField] = transfer.phrase;
    addChange(changes, transfer.fromField, fromValue, nextFrom, 'model-transfer', transfer.confidence, `Separado hacia ${transfer.toField}`);
    addChange(changes, transfer.toField, toValue, transfer.phrase, 'model-transfer', transfer.confidence, `Tomado desde ${transfer.fromField}`);
  }

  for (const field of fields) {
    if (protectedSet.has(field)) continue;
    const options = usableModel?.replacements?.[field]?.[data[field]] || [];
    const best = options.find(option => Number(option.confidence) >= threshold);
    if (!best || !accepted(field, best.output, validators)) continue;
    const before = data[field];
    data[field] = best.output;
    addChange(changes, field, before, best.output, 'model-exact', best.confidence, 'Correccion aprendida');
  }

  return {
    data,
    changes,
    modelVersion: usableModel?.version || '0.0.0',
  };
}
