export function normalizeFieldValue(value, maxLength = 120) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

export function normalizeRecord(record = {}, fields = Object.keys(record || {})) {
  return Object.fromEntries(fields.map(field => [field, normalizeFieldValue(record?.[field])]));
}
