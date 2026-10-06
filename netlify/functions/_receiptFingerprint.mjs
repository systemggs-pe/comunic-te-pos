import {createHash} from 'node:crypto';

// Contract v1: deterministic business content, shared by all server endpoints.
const text = value => String(value ?? '').trim().normalize('NFC');
const number = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : text(value);
const imei = value => text(value).replace(/\s/g, '');
// Unzoned source dates stay unzoned; never infer the server's local timezone.
const date = value => {
  const v = text(value);
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : v;
};
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fields = (source, keys) => Object.fromEntries(keys.map(key => [key, text(source?.[key])]));
export function normalizeReceiptState(value) {return ['ACTIVA', 'ANULADA'].includes(value) ? value : null;}
export function receiptFingerprint(receipt) {
  const data = receipt.boletaData || {};
  const sales = (Array.isArray(data.ventas) ? data.ventas : []).map(sale => ({
    ...fields(sale, ['marcaEquipo', 'modeloEquipo', 'nombreComercial', 'memoria', 'color', 'sn', 'partNumber']),
    imeiEquipo: imei(sale?.imeiEquipo), imei2Equipo: imei(sale?.imei2Equipo), precio: number(sale?.precio),
  })).sort((a,b) => compare(JSON.stringify(stable(a)), JSON.stringify(stable(b))));
  const equipment = Object.entries(data.equiposMap || {}).map(([key, item]) => ({imei: imei(key), imei2: imei(item?.imei2),
    ...fields(item, ['marca', 'modelo', 'nombreComercial', 'memoria', 'color', 'sn', 'partNumber']),
  })).sort((a,b) => compare(a.imei, b.imei));
  const content = {contract: 1, id: text(receipt.id), estado: normalizeReceiptState(receipt.estado),
    nBoleta: number(receipt.nBoleta ?? data.nBoleta), fechaHora: date(receipt.fechaHora || data.fechaHora),
    cliente: fields(data.cliente, ['nombre', 'dni', 'tipoDocumento']),
    formato: number(receipt.formato ?? 1), origen: text(receipt.origen), sales, equipment,
    totalPen: number(receipt.totalPen), totalClp: number(receipt.totalClp ?? data.totalClp), totalUsd: number(receipt.totalUsd ?? data.totalUsd),
  };
  return createHash('sha256').update(JSON.stringify(stable(content))).digest('hex');
}
