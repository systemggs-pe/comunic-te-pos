import {normalizeFieldValue} from './normalize.js';

export const DEFAULT_SENSITIVE_FIELDS = new Set([
  'dni',
  'documento',
  'imei',
  'imei1',
  'imei2',
  'serial',
  'sn',
  'telefono',
  'correo',
  'direccion',
  'nombrecliente',
]);

function safeFieldName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
}

function allowedFieldList(example, allowedFields, sensitiveFields) {
  const source = allowedFields?.length
    ? allowedFields
    : [...new Set([...Object.keys(example?.before || {}), ...Object.keys(example?.after || {})])];
  return source
    .map(safeFieldName)
    .filter(Boolean)
    .filter(field => !sensitiveFields.has(field.toLowerCase()));
}

function sanitizedValue(value, maxValueLength) {
  const normalized = normalizeFieldValue(value, maxValueLength);
  if (/\b\d{15}\b/.test(normalized)) return '';
  return normalized;
}

export function sanitizeCorrectionExample(example = {}, {
  allowedFields,
  sensitiveFields = DEFAULT_SENSITIVE_FIELDS,
  maxValueLength = 120,
} = {}) {
  const fields = allowedFieldList(example, allowedFields, sensitiveFields);
  const before = {};
  const after = {};
  for (const field of fields) {
    before[field] = sanitizedValue(example?.before?.[field], maxValueLength);
    after[field] = sanitizedValue(example?.after?.[field], maxValueLength);
  }
  const changedFields = fields.filter(field => before[field] !== after[field]);
  if (changedFields.length === 0) return null;
  return {
    schemaVersion: 1,
    before,
    after,
    changedFields,
    meta: {
      source: normalizeFieldValue(example?.meta?.source || 'LOCAL', 30),
      scannerVersion: normalizeFieldValue(example?.meta?.scannerVersion, 30),
      modelVersion: normalizeFieldValue(example?.meta?.modelVersion, 30),
    },
  };
}
