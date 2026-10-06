import {luhn, normalizeImei} from '../../utils/imei.js';

const text = value => String(value || '').trim();
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const invalid = code => ({valid: false, code});

// Validate the actual receipt body, not just its search index. Shared by UI/API/save.
export function validateAppleReceipt(receipt, rawImei) {
  const imei = normalizeImei(rawImei);
  if (!luhn(imei)) return invalid('IMEI_INVALIDO');
  if (!object(receipt) || typeof receipt.id !== 'string' || !text(receipt.id) || text(receipt.id).length > 180 || text(receipt.id).includes('/')) return invalid('APPLE_RECEIPTS_INVALID_RECEIPT');
  if (receipt.estado === 'ANULADA') return invalid('APPLE_RECEIPTS_ANNULLED');
  if (receipt.estado !== 'ACTIVA') return invalid('APPLE_RECEIPTS_LEGACY');
  const data = receipt.boletaData;
  if (!object(data) || !Array.isArray(data.ventas) || !data.ventas.length || data.ventas.length > 20) return invalid('APPLE_RECEIPTS_INCOMPLETE');
  const number = Number(receipt.nBoleta ?? data.nBoleta);
  const date = text(receipt.fechaHora || data.fechaHora);
  if (!Number.isSafeInteger(number) || number <= 0 || !date || Number.isNaN(Date.parse(date))
    || typeof data.cliente?.nombre !== 'string' || typeof data.cliente?.dni !== 'string'
    || !text(data.cliente.nombre) || !text(data.cliente.dni)) return invalid('APPLE_RECEIPTS_INCOMPLETE');
  if ((receipt.nBoleta != null && data.nBoleta != null && Number(receipt.nBoleta) !== Number(data.nBoleta))
    || (receipt.fechaHora && data.fechaHora && Date.parse(receipt.fechaHora) !== Date.parse(data.fechaHora))
    || (receipt.clienteDni && text(receipt.clienteDni) !== text(data.cliente.dni))
    || (receipt.clienteNombre && text(receipt.clienteNombre) !== text(data.cliente.nombre))) return invalid('APPLE_RECEIPTS_MISMATCH');
  if (receipt.formato != null && ![1, 2, 3, 4, 5, 6, 7].includes(Number(receipt.formato))) return invalid('APPLE_RECEIPTS_INVALID_RECEIPT');
  if (receipt.origen && !['ventas', 'manual'].includes(receipt.origen)) return invalid('APPLE_RECEIPTS_INVALID_RECEIPT');
  const sales = data.ventas.filter(sale => [normalizeImei(sale?.imeiEquipo), normalizeImei(sale?.imei2Equipo)].includes(imei));
  if (sales.length !== 1) return invalid(sales.length ? 'APPLE_RECEIPTS_CONFLICT' : 'APPLE_RECEIPTS_MISMATCH');
  const sale = sales[0];
  if (!luhn(normalizeImei(sale.imeiEquipo)) || !Number.isFinite(Number(sale.precio)) || !(Number(sale.precio) > 0)) return invalid('APPLE_RECEIPTS_INCOMPLETE');
  if (sale.imei2Equipo && !luhn(normalizeImei(sale.imei2Equipo))) return invalid('APPLE_RECEIPTS_INVALID_RECEIPT');
  if (sale.imei2Equipo && normalizeImei(sale.imei2Equipo) === normalizeImei(sale.imeiEquipo)) return invalid('APPLE_RECEIPTS_CONFLICT');
  const equipment = data.equiposMap?.[normalizeImei(sale.imeiEquipo)];
  if (equipment?.imei2 && normalizeImei(equipment.imei2) !== normalizeImei(sale.imei2Equipo)) return invalid('APPLE_RECEIPTS_MISMATCH');
  const brands = [sale.marcaEquipo, equipment?.marca].map(value => text(value).toUpperCase()).filter(Boolean);
  if (!brands.length || brands.some(brand => brand !== 'APPLE')) return invalid('APPLE_RECEIPTS_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(receipt.receiptFingerprint || '')) return invalid('APPLE_RECEIPTS_FINGERPRINT_REQUIRED');
  return {valid: true, code: 'VALID', imei};
}

export const APPLE_RECEIPT_MESSAGES = {
  APPLE_RECEIPTS_ANNULLED: 'El comprobante asociado a este IMEI está anulado.',
  APPLE_RECEIPTS_LEGACY: 'Este comprobante necesita ser actualizado antes de poder utilizarse.',
  APPLE_RECEIPTS_FINGERPRINT_REQUIRED: 'Vuelve a consultar el comprobante antes de guardar.',
  APPLE_RECEIPTS_CHANGED: 'El comprobante cambió desde la última validación. Vuelve a consultarlo antes de guardar.',
  IMEI_INVALIDO: 'Ingresa un IMEI válido de 15 dígitos.',
  BOLETA_APPLE_NO_ENCONTRADA: 'No encontramos un comprobante válido asociado a este IMEI.',
  APPLE_RECEIPTS_MISMATCH: 'Los datos del comprobante no coinciden con el equipo registrado.',
  APPLE_RECEIPTS_CONFLICT: 'Hay comprobantes en conflicto para este IMEI. Revisa el repositorio de boletas.',
  APPLE_RECEIPTS_INCOMPLETE: 'El comprobante tiene datos incompletos. Corrígelo en el repositorio de boletas.',
  APPLE_RECEIPTS_INVALID_RECEIPT: 'El comprobante no es válido. Revisa sus datos en el repositorio de boletas.',
  APPLE_RECEIPTS_INVALID_RESPONSE: 'El servicio de comprobantes devolvió una respuesta inválida.',
  APPLE_RECEIPTS_EMPTY_RESPONSE: 'El servicio de comprobantes respondió sin datos. Intenta nuevamente.',
  APPLE_RECEIPTS_BAD_REQUEST: 'El servicio de comprobantes rechazó la consulta. Revisa el IMEI.',
  APPLE_RECEIPTS_NOT_CONFIGURED: 'El servicio de comprobantes no está disponible temporalmente.',
  APPLE_RECEIPTS_ACCESS_DENIED: 'El servicio de comprobantes no está disponible temporalmente.',
  APPLE_RECEIPTS_UPSTREAM_ERROR: 'El servicio de comprobantes no está disponible temporalmente.',
  APPLE_RECEIPTS_NETWORK_ERROR: 'El servicio de comprobantes no está disponible temporalmente.',
  APPLE_RECEIPTS_RATE_LIMIT: 'El servicio de comprobantes está ocupado. Espera antes de volver a intentar.',
  APPLE_RECEIPTS_TIMEOUT: 'La consulta está tardando más de lo esperado. Intenta nuevamente.',
  UPSTREAM_TIMEOUT: 'La consulta está tardando más de lo esperado. Intenta nuevamente.',
};

export function appleReceiptErrorMessage(error) {
  return APPLE_RECEIPT_MESSAGES[error?.message] || 'El servicio de comprobantes no está disponible temporalmente.';
}
