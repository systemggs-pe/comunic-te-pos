import {sanitizeCorrectionExample} from '../../packages/local-field-verifier/src/index.js';
import {luhn} from '../utils/imei.js';

const DATABASE_NAME = 'comunicate-local-learning';
const DATABASE_VERSION = 1;
const STORE_NAME = 'boxCorrections';
const MAX_EXAMPLES = 1000;
const SAFE_IMEI_SOURCES = new Set(['', 'barcode', 'ocr', 'ocr-labelled']);
export const BOX_LEARNING_FIELDS = ['marca', 'modelo', 'nombreComercial', 'ram', 'memoria', 'color'];

function selectFields(value = {}) {
  return Object.fromEntries(BOX_LEARNING_FIELDS.map(field => [field, value?.[field] || '']));
}

function edited(before, after) {
  return String(before || '') !== String(after || '');
}

function safeImeiSource(value) {
  const source = String(value || '').slice(0, 30);
  return SAFE_IMEI_SOURCES.has(source) ? source : '';
}

function sanitizedQuality(value = {}) {
  return {
    imei1Edited: value.imei1Edited === true,
    imei2Edited: value.imei2Edited === true,
    serialEdited: value.serialEdited === true,
    imei1ValidAfter: value.imei1ValidAfter === true,
    imei2ValidAfter: value.imei2ValidAfter === true,
    sameTacAfter: value.sameTacAfter === true,
    imei1Source: safeImeiSource(value.imei1Source),
    imei2Source: safeImeiSource(value.imei2Source),
  };
}

function imeiQuality(scanResult, correctedData) {
  const original = scanResult?.data || {};
  const first = String(correctedData?.imei1 || '');
  const second = String(correctedData?.imei2 || '');
  return {
    imei1Edited: edited(original.imei1, first),
    imei2Edited: edited(original.imei2, second),
    serialEdited: edited(original.sn, correctedData?.sn),
    imei1ValidAfter: Boolean(first && luhn(first)),
    imei2ValidAfter: Boolean(second && luhn(second)),
    sameTacAfter: Boolean(first && second && first.slice(0, 8) === second.slice(0, 8)),
    imei1Source: safeImeiSource(scanResult?.fields?.imei1?.source),
    imei2Source: safeImeiSource(scanResult?.fields?.imei2?.source),
  };
}

function sanitizeStoredExample(example = {}) {
  const sanitized = sanitizeCorrectionExample(example, {allowedFields: BOX_LEARNING_FIELDS});
  const quality = sanitizedQuality(example.quality);
  const hasQualityCorrection = quality.imei1Edited || quality.imei2Edited || quality.serialEdited;
  if (!sanitized && !hasQualityCorrection) return null;
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    before: sanitized?.before || selectFields({}),
    after: sanitized?.after || selectFields({}),
    changedFields: sanitized?.changedFields || [],
    meta: sanitized?.meta || {
      source: 'BOX_SCANNER',
      scannerVersion: 'LOCAL_OCR_V2',
      modelVersion: '0.0.0',
    },
    quality,
  };
}

export function buildBoxCorrectionExample(scanResult, correctedData) {
  if (!scanResult?.data || !correctedData) return null;
  const sanitized = sanitizeCorrectionExample({
    before: selectFields(scanResult.data),
    after: selectFields(correctedData),
    meta: {
      source: 'BOX_SCANNER',
      scannerVersion: 'LOCAL_OCR_V2',
      modelVersion: scanResult?.diagnostics?.modelVersion || '0.0.0',
    },
  }, {allowedFields: BOX_LEARNING_FIELDS});
  const quality = imeiQuality(scanResult, correctedData);
  const hasQualityCorrection = quality.imei1Edited || quality.imei2Edited || quality.serialEdited;
  if (!sanitized && !hasQualityCorrection) return null;
  return sanitizeStoredExample({
    schemaVersion: 1,
    before: sanitized?.before || selectFields({}),
    after: sanitized?.after || selectFields({}),
    changedFields: sanitized?.changedFields || [],
    meta: sanitized?.meta || {
      source: 'BOX_SCANNER',
      scannerVersion: 'LOCAL_OCR_V2',
      modelVersion: String(scanResult?.diagnostics?.modelVersion || '0.0.0'),
    },
    quality,
  });
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {keyPath: 'id', autoIncrement: true});
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
  });
}

async function trimOldExamples(database) {
  const countTransaction = database.transaction(STORE_NAME, 'readonly');
  const total = await requestResult(countTransaction.objectStore(STORE_NAME).count());
  const excess = total - MAX_EXAMPLES;
  if (excess <= 0) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const cursorRequest = transaction.objectStore(STORE_NAME).openCursor();
    let removed = 0;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || removed >= excess) return;
      cursor.delete();
      removed += 1;
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_TRIM_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_TRIM_ABORTED'));
  });
}

export async function saveBoxCorrection(example) {
  const sanitized = sanitizeStoredExample(example);
  if (!sanitized) return false;
  const database = await openDatabase();
  if (!database) return false;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).add(sanitized));
    await trimOldExamples(database);
    return true;
  } finally {
    database.close();
  }
}

export async function listBoxCorrections() {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const values = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    return values.map(value => {
      const example = {...value};
      delete example.id;
      return example;
    });
  } finally {
    database.close();
  }
}

export async function clearBoxCorrections() {
  const database = await openDatabase();
  if (!database) return false;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).clear());
    return true;
  } finally {
    database.close();
  }
}

export async function exportBoxCorrections() {
  const examples = await listBoxCorrections();
  if (!examples.length || typeof document === 'undefined') return 0;
  const payload = JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    examples,
  }, null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `correcciones-ocr-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return examples.length;
}
