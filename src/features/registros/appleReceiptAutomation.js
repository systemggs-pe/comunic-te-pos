import {normalizeImei, luhn} from '../../utils/imei.js';
import {validarDocumento} from '../../utils/documentos.js';
import {createAppleReceiptLookup, canDeferStoredAppleReceipt} from './appleReceiptLookup.js';
import {appleReceiptErrorMessage} from './appleReceiptValidation.js';
import {prepareAppleReceiptDraft} from './appleReceiptDraft.js';

export const APPLE_FLOW_STATES = Object.freeze(['IDLE', 'WAITING_FOR_DATA', 'SEARCHING', 'RECEIPT_FOUND', 'RECEIPT_NOT_FOUND', 'PREPARING_RECEIPT', 'READY_TO_CREATE', 'VALIDATED', 'ERROR', 'SAVED_REFERENCE']);
export const APPLE_LOOKUP_DEBOUNCE_MS = 600;
const brand = form => String(form.marca === 'OTROS' ? form.marcaOtra : form.marca || '').trim().toUpperCase();
const keyFor = form => [brand(form), normalizeImei(form.imei), normalizeImei(form.imei1), normalizeImei(form.imei2)].join('|');
const ready = form => brand(form) === 'APPLE' && luhn(normalizeImei(form.imei))
  && luhn(normalizeImei(form.imei1)) && (!form.imei2 || luhn(normalizeImei(form.imei2)))
  && (!form.imei2 || form.imei1 !== form.imei2)
  && [normalizeImei(form.imei1), normalizeImei(form.imei2)].includes(normalizeImei(form.imei))
  && Boolean(String(form.nombre || '').trim()) && validarDocumento(form.tipoDocumento, form.dni);

export function receiptFlowCompatibility(flow) {
  const status = flow.state === 'VALIDATED' ? 'found' : flow.state === 'SEARCHING' ? 'loading'
    : flow.state === 'SAVED_REFERENCE' ? 'saved' : flow.state === 'ERROR' ? 'error'
      : ['RECEIPT_NOT_FOUND', 'PREPARING_RECEIPT', 'READY_TO_CREATE'].includes(flow.state) ? 'not_found' : 'idle';
  return {...flow, status};
}

export function createAppleReceiptAutomation(request, {onChange = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, debounceMs = APPLE_LOOKUP_DEBOUNCE_MS} = {}) {
  const lookup = createAppleReceiptLookup(request, {now});
  let state = {state: 'IDLE', imei: '', boleta: null};
  let pendingGeneration = -1;
  let timer, key = '', generation = 0, currentForm = null, disposed = false, pending = null, record;
  const publish = next => {if (!disposed) {state = next; onChange(state);}};
  const clearTimer = () => {cancel(timer); timer = undefined;};
  const invalidate = () => {clearTimer(); generation++; key = ''; lookup.invalidate(); publish({state: 'IDLE', imei: '', boleta: null});};
  const run = async (force = false, expectedId = '') => {
    if (disposed || !currentForm || !ready(currentForm)) return false;
    clearTimer();
    const ticket = generation, form = currentForm, imei = normalizeImei(form.imei);
    if (pending && pendingGeneration === ticket) return pending;
    if (pending) {await pending; if (ticket !== generation || disposed) return false; if (pending) return pending;}
    if (!force && ['READY_TO_CREATE', 'ERROR'].includes(state.state)) return false;
    if (!force && state.state === 'VALIDATED' && state.expiresAt > now()) return true;
    const operation = (async () => {
      publish({state: 'SEARCHING', imei, boleta: null});
      const result = await lookup.lookup(imei, {refresh: force, expectedId});
      if (!result.current || ticket !== generation || disposed) return false;
      if (result.error) {
        if (result.error.message === 'BOLETA_APPLE_NO_ENCONTRADA') {
          publish({state: 'RECEIPT_NOT_FOUND', imei, boleta: null});
          publish({state: 'PREPARING_RECEIPT', imei, boleta: null});
          publish({state: 'READY_TO_CREATE', imei, boleta: null, draft: {...prepareAppleReceiptDraft(currentForm), receiptAppUrl: result.error.receiptAppUrl},
            message: 'No encontramos una boleta para este equipo. Revisa el borrador antes de generar.'});
        } else publish({state: 'ERROR', imei, boleta: null, code: result.error.message, message: appleReceiptErrorMessage(result.error)});
        return false;
      }
      publish({state: 'RECEIPT_FOUND', imei, boleta: result.boleta});
      publish({state: 'VALIDATED', imei, boleta: result.boleta, expiresAt: result.expiresAt, message: 'Comprobante encontrado y validado.'});
      return true;
    })();
    pending = operation; pendingGeneration = ticket;
    try {return await operation;} finally {if (pending === operation) pending = null;}
  };
  return {
    snapshot: () => state,
    isBusy: () => Boolean(pending),
    invalidate,
    dispose() {disposed = true; clearTimer(); generation++; lookup.dispose();},
    update(form, options = {}) {
      if (disposed) return;
      currentForm = {...form}; record = options.record;
      const nextKey = keyFor(form);
      if (key !== nextKey) {invalidate(); key = nextKey;}
      if (brand(form) !== 'APPLE') {if (state.state !== 'IDLE') invalidate(); return;}
      if (!ready(form)) {clearTimer(); if (state.state !== 'WAITING_FOR_DATA') {generation++; lookup.invalidate(); publish({state: 'WAITING_FOR_DATA', imei: normalizeImei(form.imei), boleta: null, message: 'Completa cliente e IMEI válido para buscar el comprobante.'});} return;}
      if (record) {
        const saved = {status: 'saved', boleta: {id: record.boletaExtranjeraId, nBoleta: record.boletaExtranjeraNro, receiptFingerprint: record.receiptFingerprint, updatedAt: record.receiptUpdatedAt}};
        if (['IDLE', 'WAITING_FOR_DATA'].includes(state.state) && canDeferStoredAppleReceipt(record, {imei: form.imei, imei1: form.imei1, imei2: form.imei2, marca: brand(form)}, saved)) {
          publish({state: 'SAVED_REFERENCE', imei: form.imei, boleta: saved.boleta, message: 'Comprobante asociado. Se revalidará al guardar.'}); return;
        }
      }
      if (state.state === 'READY_TO_CREATE') {publish({...state, draft: {...prepareAppleReceiptDraft(form), receiptAppUrl: state.draft.receiptAppUrl}}); return;}
      if (!['IDLE', 'WAITING_FOR_DATA'].includes(state.state)) return;
      clearTimer(); timer = schedule(() => {timer = undefined; void run();}, debounceMs);
    },
    async search(form, {refresh = false, expectedId = ''} = {}) {currentForm = {...form}; const nextKey = keyFor(form); if (nextKey !== key) {invalidate(); key = nextKey;} return run(refresh, expectedId);},
  };
}
