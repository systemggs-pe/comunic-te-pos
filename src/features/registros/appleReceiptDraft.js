import {normalizeImei, luhn} from '../../utils/imei.js';

const clean = value => String(value ?? '').trim();
const types = {DNI: 'DNI', CE: 'Carné de Extranjería', PASAPORTE: 'Pasaporte', RUC: 'RUC'};
// Registro.precio is the registration/service fee, NOT the product sale price.
export function prepareAppleReceiptDraft(form) {
  const fields = {nombre: clean(form.nombre), rut: clean(form.dni), tipoDocumento: types[form.tipoDocumento] || '',
    imei1: normalizeImei(form.imei1), imei2: normalizeImei(form.imei2), marca: 'APPLE',
    modelo: clean(form.modelo), nombreComercial: clean(form.nombreComercial), sn: clean(form.sn),
    memoria: clean(form.memoria), color: clean(form.color), precio: '', fechaHora: ''};
  return {version: 1, selectedImei: normalizeImei(form.imei), fields,
    automatic: Object.keys(fields).filter(key => Boolean(fields[key])), manual: [...Object.keys(fields).filter(key => !fields[key]), 'formato'],
    derived: ['nBoleta', 'totalClp', 'totalUsd', 'estado', 'receiptFingerprint', 'updatedAt', 'emisor']};
}
export function buildAppleReceiptDraftUrl(draft, baseUrl = 'https://comunicate-boletas-extranjeras.netlify.app') {
  if (!luhn(draft?.selectedImei)) throw new Error('IMEI_INVALIDO');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('INVALID_BOLETAS_URL');
  if (url.username || url.password) throw new Error('INVALID_BOLETAS_URL');
  url.pathname = '/'; url.search = '?section=boletas&mode=nueva';
  // Fragment never goes to HTTP servers. Receiver removes it before authentication.
  url.hash = `posDraft=${encodeURIComponent(JSON.stringify(draft))}`;
  return url.href;
}


export function createAppleReceiptDraftHandoff(browser, {channel = () => crypto.randomUUID()} = {}) {
  let active = null;
  return {
    open(draft) {
      this.invalidate();
      const outgoing = {...draft, posOrigin: browser.location.origin, channelId: channel()};
      const url = buildAppleReceiptDraftUrl(outgoing, draft.receiptAppUrl || undefined);
      const child = browser.open(url, '_blank');
      if (!child) return false;
      // Retain a sender reference, but remove reverse access to the POS window.
      try {child.opener = null;} catch { /* Browser isolation can already detach the opener. */ }
      active = {child, origin: new URL(url).origin, channelId: outgoing.channelId, fields: JSON.stringify(draft.fields)};
      return true;
    },
    invalidate() {
      if (!active) return;
      try {active.child.postMessage({type: 'comunicate.pos-draft.invalidate', channelId: active.channelId}, active.origin);} catch { /* Closed tab. */ }
      active = null;
    },
    sync(draft) {if (active && (!draft || JSON.stringify(draft.fields) !== active.fields)) this.invalidate();},
  };
}
