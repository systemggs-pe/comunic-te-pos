const MAX_VENTAS = 20;

export function normalizarImeiApple(value) {
  const imei = String(value || '').replace(/\D/g, '');
  return /^\d{15}$/.test(imei) ? imei : '';
}

export function luhnImeiApple(value) {
  const imei = normalizarImeiApple(value);
  if (!imei) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let index = imei.length - 1; index >= 0; index -= 1) {
    let digit = Number(imei[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
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
    nBoleta: Number.isFinite(Number(value.nBoleta)) ? Number(value.nBoleta) : null,
    emisor: sanitizeEmisor(value.emisor),
  };
}

export function serializeComprobanteApple(doc) {
  const data = doc?.data?.() || {};
  return {
    id: cleanText(doc?.id, 180),
    nBoleta: Number.isFinite(Number(data.nBoleta)) ? Number(data.nBoleta) : null,
    clienteDni: cleanText(data.clienteDni, 20),
    clienteNombre: cleanText(data.clienteNombre, 180),
    totalPen: cleanMoney(data.totalPen),
    totalClp: cleanMoney(data.totalClp),
    fechaHora: cleanText(data.fechaHora, 40),
    formato: [1, 2, 3].includes(Number(data.formato)) ? Number(data.formato) : 1,
    boletaEquipoKeys: getImeisComprobanteApple(data),
    boletaData: sanitizeBoletaData(data.boletaData),
  };
}

export async function findComprobanteAppleByImei(boletasRef, rawImei) {
  const imei = normalizarImeiApple(rawImei);
  if (!imei) return null;

  const directSnap = await boletasRef.doc(imei).get();
  if (directSnap.exists && getImeisComprobanteApple(directSnap.data() || {}).includes(imei)) {
    return serializeComprobanteApple(directSnap);
  }

  const keysSnap = await boletasRef.where('boletaEquipoKeys', 'array-contains', imei).limit(1).get();
  if (!keysSnap.empty) return serializeComprobanteApple(keysSnap.docs[0]);

  const legacySnap = await boletasRef.where('boletaEquipoKey', '==', imei).limit(1).get();
  if (!legacySnap.empty) return serializeComprobanteApple(legacySnap.docs[0]);
  return null;
}

export async function findComprobanteAppleByIdAndImei(boletasRef, rawId, rawImei) {
  const id = cleanText(rawId, 180);
  const imei = normalizarImeiApple(rawImei);
  if (!id || id.includes('/') || !imei) return null;

  const snap = await boletasRef.doc(id).get();
  if (!snap.exists || !getImeisComprobanteApple(snap.data() || {}).includes(imei)) return null;
  return serializeComprobanteApple(snap);
}
