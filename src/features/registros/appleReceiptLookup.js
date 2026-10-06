import {normalizeImei, luhn} from '../../utils/imei.js';
import {validateAppleReceipt} from './appleReceiptValidation.js';

export const APPLE_RECEIPT_TTL_MS = 30_000;

// A saved reference is pending, not valid. Unchanged edits can let the server
// perform the single authoritative lookup at save instead of querying twice.
export function canDeferStoredAppleReceipt(original, current, lookup) {
  const id = original?.boletaExtranjeraId;
  return Boolean(/^[a-f0-9]{64}$/.test(original?.receiptFingerprint || '')
    && lookup.boleta?.receiptFingerprint === original.receiptFingerprint
    && original?.id && typeof id === 'string' && id && id.length <= 180 && !id.includes('/')
    && luhn(normalizeImei(current.imei))
    && String(original.marcaEquipo || '').toUpperCase() === 'APPLE' && current.marca === 'APPLE'
    && lookup.status === 'saved' && lookup.boleta?.id === id
    && normalizeImei(current.imei) === normalizeImei(original.imeiRegistrado || original.imeiEquipo)
    && normalizeImei(current.imei1) === normalizeImei(original.imeiEquipo)
    && String(current.imei2 || '') === String(original.imei2Equipo || ''));
}

export function createAppleReceiptLookup(request, {now = Date.now} = {}) {
  let generation = 0;
  let busy = false;
  let cache = null;
  let disposed = false;
  return {
    isBusy() {return busy;},
    invalidate() {generation += 1; cache = null;},
    dispose() {disposed = true; generation += 1; cache = null;},
    async lookup(rawImei, {expectedId = '', refresh = false} = {}) {
      if (disposed || busy) return {current: false};
      const imei = normalizeImei(rawImei);
      if (!luhn(imei)) return {current: true, error: new Error('IMEI_INVALIDO')};
      if (!refresh && cache?.imei === imei && (!expectedId || cache.boleta.id === expectedId) && cache.expiresAt > now()) {
        return {current: true, boleta: cache.boleta, expiresAt: cache.expiresAt};
      }
      const ticket = generation;
      busy = true;
      try {
        const result = await request(imei);
        if (disposed || ticket !== generation) return {current: false};
        if (result?.found === false && result.boleta == null && !result.error && result.success !== false) throw Object.assign(new Error('BOLETA_APPLE_NO_ENCONTRADA'), {receiptAppUrl: result.receiptAppUrl});
        if (result?.found !== true || !result.boleta) throw new Error('APPLE_RECEIPTS_INVALID_RESPONSE');
        const validation = validateAppleReceipt(result.boleta, imei);
        if (!validation.valid) throw new Error(validation.code);
        if (expectedId && result.boleta.id !== expectedId) throw new Error('APPLE_RECEIPTS_MISMATCH');
        cache = {imei, boleta: result.boleta, expiresAt: now() + APPLE_RECEIPT_TTL_MS};
        return {current: true, boleta: cache.boleta, expiresAt: cache.expiresAt};
      } catch (error) {
        if (disposed || ticket !== generation) return {current: false};
        cache = null;
        return {current: true, error};
      } finally {busy = false;}
    },
  };
}
