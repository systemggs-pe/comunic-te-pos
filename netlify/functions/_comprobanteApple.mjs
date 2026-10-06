import {luhn, normalizeImei} from '../../src/utils/imei.js';
const MAX_VENTAS = 20;

export function normalizarImeiApple(value) {
  return normalizeImei(value);
}

export function luhnImeiApple(value) {
  return luhn(normalizarImeiApple(value));
}

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function cleanMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function extractImeisFromBoletaData(data = {}) {
  const imeis = new Set();
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  ventas.forEach(venta => {
    const imei1 = normalizarImeiApple(venta?.imeiEquipo);
    const imei2 = normalizarImeiApple(venta?.imei2Equipo);
    if (imei1) imeis.add(imei1);
    if (imei2) imeis.add(imei2);
  });

  if (data.equiposMap && typeof data.equiposMap === 'object' && !Array.isArray(data.equiposMap)) {
    Object.entries(data.equiposMap).forEach(([key, equipo]) => {
      const imei1 = normalizarImeiApple(key);
      const imei2 = normalizarImeiApple(equipo?.imei2);
      if (imei1) imeis.add(imei1);
      if (imei2) imeis.add(imei2);
    });
  }
  return Array.from(imeis);
}

export function getImeisComprobanteApple(data = {}) {
  const imeis = new Set(extractImeisFromBoletaData(data.boletaData || {}));
  const stored = Array.isArray(data.boletaEquipoKeys) ? data.boletaEquipoKeys : [];
  [...stored, data.boletaEquipoKey].forEach(value => {
    const imei = normalizarImeiApple(value);
    if (imei) imeis.add(imei);
  });
  return Array.from(imeis);
}

function sanitizeEmisor(value = {}) {
  return {
    nombre: cleanText(value.nombre, 180),
    rut: cleanText(value.rut, 40),
    giro1: cleanText(value.giro1, 120),
    giro2: cleanText(value.giro2, 120),
    direccion: cleanText(value.direccion, 180),
    comuna: cleanText(value.comuna, 80),
    ciudad: cleanText(value.ciudad, 80),
    vendedor: cleanText(value.vendedor, 40),
    pais: cleanText(value.pais, 80),
    email: cleanText(value.email, 180),
    telefono: cleanText(value.telefono, 40),
    sitioWeb: cleanText(value.sitioWeb, 240),
    metodoPago: cleanText(value.metodoPago, 80),
    tipoCambioPenUsd: cleanMoney(value.tipoCambioPenUsd),
    impuestoPorcentaje: cleanMoney(value.impuestoPorcentaje),
    tarjetaUltimos4: cleanText(value.tarjetaUltimos4, 4).replace(/\D/g, ''),
    codigoTerminal: cleanText(value.codigoTerminal, 40),
    applicationId: cleanText(value.applicationId, 80),
    applicationPanSequence: cleanText(value.applicationPanSequence, 20),
    deviceId: cleanText(value.deviceId, 40),
    cardType: cleanText(value.cardType, 40),
    tvr: cleanText(value.tvr, 40),
    tsi: cleanText(value.tsi, 40),
    diasDevolucion: cleanMoney(value.diasDevolucion),
    partNumber: cleanText(value.partNumber, 80),
    policyUrl: cleanText(value.policyUrl, 300),
    supportMessage: cleanText(value.supportMessage, 300),
  };
}

function sanitizeBoletaData(value = {}) {
  const ventas = Array.isArray(value.ventas) ? value.ventas.slice(0, MAX_VENTAS) : [];
  const safeVentas = ventas.map(venta => ({
    id: cleanText(venta?.id, 160),
    imeiEquipo: normalizarImeiApple(venta?.imeiEquipo),
    imei2Equipo: normalizarImeiApple(venta?.imei2Equipo),
    marcaEquipo: cleanText(venta?.marcaEquipo, 80),
    modeloEquipo: cleanText(venta?.modeloEquipo, 100),
    nombreComercial: cleanText(venta?.nombreComercial, 140),
    memoria: cleanText(venta?.memoria, 20),
    color: cleanText(venta?.color, 80),
    sn: cleanText(venta?.sn, 100),
    partNumber: cleanText(venta?.partNumber, 80),
    precio: cleanMoney(venta?.precio),
  })).filter(venta => venta.imeiEquipo);

  const equiposMap = {};
  if (value.equiposMap && typeof value.equiposMap === 'object' && !Array.isArray(value.equiposMap)) {
    Object.entries(value.equiposMap).slice(0, MAX_VENTAS).forEach(([key, equipo]) => {
      const imei = normalizarImeiApple(key);
      if (!imei) return;
      equiposMap[imei] = {
        imei2: normalizarImeiApple(equipo?.imei2),
        marca: cleanText(equipo?.marca, 80),
        modelo: cleanText(equipo?.modelo, 100),
        nombreComercial: cleanText(equipo?.nombreComercial, 140),
        memoria: cleanText(equipo?.memoria, 20),
        color: cleanText(equipo?.color, 80),
        sn: cleanText(equipo?.sn, 100),
        partNumber: cleanText(equipo?.partNumber, 80),
      };
    });
  }

  return {
    cliente: {
      nombre: cleanText(value.cliente?.nombre, 180),
      dni: cleanText(value.cliente?.dni, 20),
    },
    ventas: safeVentas,
    equiposMap,
    totalClp: cleanMoney(value.totalClp),
    fechaHora: cleanText(value.fechaHora, 40),
    nBoleta: value.nBoleta != null && value.nBoleta !== '' && Number.isFinite(Number(value.nBoleta)) ? Number(value.nBoleta) : null,
    emisor: sanitizeEmisor(value.emisor),
  };
}

export function serializeComprobanteAppleData(rawData = {}, fallbackId = '') {
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData : {};
  const number = data.nBoleta ?? data.boletaData?.nBoleta;
  return {
    id: cleanText(data.id || fallbackId, 180),
    estado: ['ACTIVA', 'ANULADA'].includes(data.estado) ? data.estado : null,
    updatedAt: cleanText(data.updatedAt, 80),
    receiptFingerprint: cleanText(data.receiptFingerprint, 64),
    nBoleta: number != null && number !== '' && Number.isFinite(Number(number)) ? Number(number) : null,
    clienteDni: cleanText(data.clienteDni, 20),
    clienteNombre: cleanText(data.clienteNombre, 180),
    totalPen: cleanMoney(data.totalPen),
    totalClp: cleanMoney(data.totalClp),
    fechaHora: cleanText(data.fechaHora || data.boletaData?.fechaHora, 40),
    origen: cleanText(data.origen, 20),
    formato: [1, 2, 3, 4, 5, 6, 7].includes(Number(data.formato)) ? Number(data.formato) : 1,
    boletaEquipoKeys: getImeisComprobanteApple(data),
    boletaData: sanitizeBoletaData(data.boletaData),
  };
}
