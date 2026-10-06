export const BACKUP_COLLECTIONS = ['clientes', 'equipos', 'registros', 'ventas'];

function backupError(code, collection) {
  return Object.assign(new Error(code), {collection});
}

// Read-only export. A failed collection or count check prevents a success result.
export async function exportCompleteBackup(source, onProgress = () => {}, pageSize = 500) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('BACKUP_PAGE_SIZE_INVALID');
  const expected = {};
  const counts = {};
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    expected[name] = await source.backupCount(name);
    if (!Number.isSafeInteger(expected[name]) || expected[name] < 0) throw backupError('BACKUP_COUNT_INVALID', name);
  }
  for (const name of BACKUP_COLLECTIONS) {
    const items = [];
    const seen = new Set();
    let cursor = null;
    onProgress({collection: name, exported: 0, expected: expected[name]});
    for (;;) {
      const page = await source.backupPage(name, pageSize, cursor);
      for (const document of page.docs) {
        if (seen.has(document.id)) throw backupError('BACKUP_DUPLICATE_DOCUMENT', name);
        seen.add(document.id);
        items.push({...document.data(), id: document.id});
      }
      onProgress({collection: name, exported: items.length, expected: expected[name]});
      if (items.length > expected[name]) throw backupError('BACKUP_DATA_CHANGED', name);
      if (page.docs.length < pageSize) break;
      cursor = page.docs.at(-1);
    }
    if (items.length !== expected[name]) throw backupError('BACKUP_COUNT_MISMATCH', name);
    collections[name] = items;
    counts[name] = {expected: expected[name], exported: items.length};
  }
  for (const name of BACKUP_COLLECTIONS) {
    if (await source.backupCount(name) !== expected[name]) throw backupError('BACKUP_DATA_CHANGED', name);
  }
  return {fecha: new Date().toISOString(), ...collections, verification: {counts, collections: BACKUP_COLLECTIONS, complete: true}};
}
