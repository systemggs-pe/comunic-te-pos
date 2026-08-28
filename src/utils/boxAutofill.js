import {luhn} from './imei.js';
import {normalizarEscaneo} from './scanner.js';

export const BOX_FORM_FIELDS = ['imei1', 'imei2', 'sn', 'marca', 'modelo', 'nombreComercial', 'ram', 'memoria', 'color'];

export function safeBoxAutofill(data = {}) {
  const result = normalizarEscaneo(data);
  for (const key of ['imei1', 'imei2']) {
    const raw = String(data[key] || '').trim();
    // No truncar, completar ni reparar un identificador para hacerlo pasar por valido.
    result[key] = /^\d{15}$/.test(raw) && luhn(raw) && !/^(\d)\1{14}$/.test(raw) ? raw : '';
  }
  if (result.imei2 === result.imei1) result.imei2 = '';
  return result;
}

export function mergeBoxAutofill(current, extracted, baseline = current) {
  const next = {...current};
  const data = safeBoxAutofill(extracted);
  // Si el operador cambio de equipo mientras Gemini respondia, no mezclar dos cajas.
  const identityChanged = ['imei1', 'imei2', 'sn'].some(key => current[key] !== baseline[key]);
  if (identityChanged) return next;
  const replacesDevice = ['imei1', 'imei2', 'sn'].some(key => data[key] && current[key] && data[key] !== current[key]);
  for (const key of BOX_FORM_FIELDS) {
    if (current[key] === baseline[key] && (data[key] || replacesDevice)) next[key] = data[key] || '';
  }
  return next;
}
