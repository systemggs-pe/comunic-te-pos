const DB_NAME = 'ggs_dni_fotos';
const DB_VERSION = 1;
const STORE_NAME = 'consultas';
const MAX_HISTORY_ITEMS = 30;

function canUseIndexedDb() {
  return typeof window !== 'undefined' && Boolean(window.indexedDB);
}

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) return;

      const store = db.createObjectStore(STORE_NAME, {keyPath: 'id'});
      store.createIndex('createdAt', 'createdAt');
      store.createIndex('status', 'status');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_ERROR'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_ERROR'));
  });
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_ABORTED'));
    transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_ERROR'));
  });
}

function createHistoryId() {
  const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeHistoryEntry(entry) {
  const createdAt = entry?.createdAt || new Date().toISOString();
  const status = entry?.status === 'success' ? 'success' : 'failed';
  const dni = String(entry?.dni || '').replace(/\D/g, '').slice(0, 8);
  const tipo = entry?.tipo === 'electronico' ? 'electronico' : 'azul';

  return {
    id: entry?.id || createHistoryId(),
    createdAt,
    status,
    dni,
    tipo,
    tipoLabel: entry?.tipoLabel || (tipo === 'electronico' ? 'DNI electronico' : 'DNI azul'),
    message: entry?.message || '',
    result: entry?.result || null,
  };
}

export async function loadDniPhotoHistory() {
  if (!canUseIndexedDb()) return [];

  const db = await openHistoryDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const done = waitForTransaction(transaction);
    const entries = await requestToPromise(store.getAll());
    await done;

    return entries
      .map(normalizeHistoryEntry)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } finally {
    db.close();
  }
}

export async function saveDniPhotoHistoryEntry(entry) {
  const normalized = normalizeHistoryEntry(entry);
  const db = await openHistoryDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(normalized);
    await waitForTransaction(transaction);
  } finally {
    db.close();
  }

  const entries = await loadDniPhotoHistory();
  const oldEntries = entries.slice(MAX_HISTORY_ITEMS);
  await Promise.all(oldEntries.map(item => deleteDniPhotoHistoryEntry(item.id)));

  return normalized;
}

export async function deleteDniPhotoHistoryEntry(id) {
  if (!canUseIndexedDb()) return;

  const db = await openHistoryDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await waitForTransaction(transaction);
  } finally {
    db.close();
  }
}
