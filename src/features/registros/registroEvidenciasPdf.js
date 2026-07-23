import {getPdfTools} from '../../utils/pdfLibraries.js';

const PAGE = {w: 210, h: 297};
const PLACEHOLDER_FILL = [218, 235, 249];
const BORDER = [15, 23, 42];

const SLOTS = [
  {key: 'dniFrente', label: 'DNI CARA', page: 1, x: 56, y: 28, w: 94, h: 51},
  {key: 'dniReverso', label: 'DNI CARA', page: 1, x: 54, y: 99, w: 98, h: 52},
  {key: 'cajaEquipo', label: 'CAJA DE\nEQUIPO', page: 1, x: 53, y: 182, w: 100, h: 54},
  {key: 'boletaVenta', label: 'BOLETA\nDE\nVENTA', page: 2, x: 23, y: 29, w: 60, h: 127},
  {key: 'imeiLogico', label: 'IMEI\nLOGICO', page: 2, x: 112, y: 29, w: 60, h: 127},
];

const APPLE_SLOTS = [
  {key: 'dniFrente', label: 'DNI FRONTAL', page: 1, x: 48, y: 22, w: 78, h: 52},
  {key: 'dniReverso', label: 'DNI POSTERIOR', page: 1, x: 48, y: 79, w: 78, h: 52},
  {key: 'imeiLogico', label: 'IMEI LOGICO', page: 1, x: 48, y: 143, w: 68, h: 117},
  {key: 'cajaEquipo', label: 'CAJA DE EQUIPOS', page: 1, x: 124, y: 143, w: 68, h: 117},
];

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('PDF_IMAGE_LOAD_FAILED'));
    img.src = dataUrl;
  });
}

function fitContain(image, boxW, boxH) {
  const ratio = Math.min(boxW / image.width, boxH / image.height);
  return {
    w: image.width * ratio,
    h: image.height * ratio,
  };
}

function drawPlaceholder(doc, slot) {
  doc.setFillColor(...PLACEHOLDER_FILL);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(slot.x, slot.y, slot.w, slot.h, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(slot.h > slot.w ? 14 : 10);
  doc.setTextColor(15, 23, 42);
  const lines = String(slot.label).split('\n');
  const lineHeight = slot.h > slot.w ? 8 : 5;
  const startY = slot.y + slot.h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    doc.text(line, slot.x + slot.w / 2, startY + index * lineHeight, {
      align: 'center',
      baseline: 'middle',
    });
  });
}

async function drawEvidence(doc, slot, evidencia) {
  if (!evidencia?.dataUrl) {
    if (slot.key === 'cajaEquipo') return;
    drawPlaceholder(doc, slot);
    return;
  }

  const image = await loadImage(evidencia.dataUrl);
  const fitted = fitContain(image, slot.w, slot.h);
  const x = slot.x + (slot.w - fitted.w) / 2;
  const y = slot.y + (slot.h - fitted.h) / 2;

  doc.addImage(evidencia.dataUrl, 'JPEG', x, y, fitted.w, fitted.h, undefined, 'FAST');
}

function paintPage(doc) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
}

function formatClp(value) {
  return new Intl.NumberFormat('es-CL', {maximumFractionDigits: 0}).format(Number(value || 0));
}

function cleanReceiptText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getReceiptItemName(venta, equiposMap) {
  const equipo = equiposMap?.[venta?.imeiEquipo] || {};
  return cleanReceiptText([
    venta?.marcaEquipo || equipo.marca,
    venta?.nombreComercial || equipo.nombreComercial || venta?.modeloEquipo || equipo.modelo,
    venta?.memoria || equipo.memoria,
  ].filter(Boolean).join(' ')) || 'EQUIPO APPLE';
}

function drawAppleReceipt(doc, boleta) {
  const data = boleta?.boletaData || {};
  const emisor = data.emisor || {};
  const cliente = data.cliente || {};
  const todasLasVentas = Array.isArray(data.ventas) ? data.ventas : [];
  const ventas = todasLasVentas.slice(0, 10);
  const receipt = {x: 49, y: 14, w: 112, padding: 8};
  const left = receipt.x + receipt.padding;
  const right = receipt.x + receipt.w - receipt.padding;
  const center = receipt.x + receipt.w / 2;
  const maxWidth = receipt.w - receipt.padding * 2;
  let y = receipt.y + 10;

  const addCentered = (text, size = 8, bold = false, gap = 1.5) => {
    const value = cleanReceiptText(text);
    if (!value) return;
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, maxWidth);
    lines.forEach(line => {
      doc.text(line, center, y, {align: 'center'});
      y += size * 0.42 + 1;
    });
    y += gap;
  };

  const addLeft = (text, size = 7, bold = false, gap = 1) => {
    const value = cleanReceiptText(text);
    if (!value) return;
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, maxWidth);
    lines.forEach(line => {
      doc.text(line, left, y);
      y += size * 0.42 + 1;
    });
    y += gap;
  };

  const addRow = (label, value, {size = 7, bold = false} = {}) => {
    const text = `${label}: ${cleanReceiptText(value)}`;
    addLeft(text, size, bold, 0.8);
  };

  const separator = () => {
    doc.setDrawColor(120, 126, 136);
    doc.setLineWidth(0.25);
    doc.setLineDash([1, 1]);
    doc.line(left, y, right, y);
    doc.setLineDash([]);
    y += 4;
  };

  const fecha = data.fechaHora || boleta?.fechaHora;
  const fechaValida = fecha && !Number.isNaN(new Date(fecha).getTime()) ? new Date(fecha) : null;
  const fechaTexto = fechaValida
    ? fechaValida.toLocaleString('es-PE', {dateStyle: 'short', timeStyle: 'short'})
    : cleanReceiptText(fecha);
  const nBoleta = data.nBoleta || boleta?.nBoleta || '';
  const totalClp = Number(data.totalClp || boleta?.totalClp || 0);
  const totalPen = ventas.reduce((total, venta) => total + Number(venta?.precio || 0), 0) || Number(boleta?.totalPen || 0);

  addCentered(emisor.nombre || 'BOLETA EXTRANJERA', 9, true);
  addCentered(emisor.rut ? `R.U.T. ${emisor.rut}` : '', 8, true, 0.5);
  addCentered(`BOLETA ELECTRONICA NRO. ${nBoleta || '-'}`, 8, true, 0.5);
  addCentered('SII ARICA', 7, true, 2);
  addCentered([emisor.direccion, emisor.comuna, emisor.ciudad].filter(Boolean).join(', '), 6.5, false, 2);
  separator();
  addRow('FECHA', fechaTexto || '-');
  addRow('CLIENTE', cliente.nombre || boleta?.clienteNombre || '-');
  addRow('RUT / DNI', cliente.dni || boleta?.clienteDni || '-');
  separator();

  ventas.forEach((venta, index) => {
    const precioPen = Number(venta?.precio || 0);
    const precioClp = totalPen > 0 ? Math.round(totalClp * (precioPen / totalPen)) : 0;
    addLeft(`${index + 1}. ${getReceiptItemName(venta, data.equiposMap)}`, 7, true, 0.8);
    addRow('IMEI', venta?.imeiEquipo || '-', {size: 6.5});
    if (venta?.imei2Equipo) addRow('IMEI 2', venta.imei2Equipo, {size: 6.5});
    addRow('IMPORTE', `$${formatClp(precioClp)}`, {size: 7});
    y += 1;
  });

  if (todasLasVentas.length > ventas.length) {
    addLeft(`+ ${todasLasVentas.length - ventas.length} equipos adicionales`, 6.5, false, 1);
  }
  separator();
  addCentered(`TOTAL $${formatClp(totalClp)}`, 11, true, 2);
  addCentered(`REFERENCIA S/. ${Number(boleta?.totalPen || totalPen || 0).toFixed(2)}`, 6.5, false, 2);
  separator();
  addCentered('DOCUMENTO ASOCIADO AL REGISTRO APPLE', 6.5, true, 1);
  addCentered(`FORMATO ${boleta?.formato || 1}`, 6, false, 1);

  const receiptHeight = Math.min(PAGE.h - receipt.y - 14, Math.max(120, y - receipt.y + 8));
  doc.setDrawColor(194, 201, 211);
  doc.setLineWidth(0.35);
  doc.rect(receipt.x, receipt.y, receipt.w, receiptHeight, 'S');
}

export async function generarRegistroEvidenciasPDF(registro, evidencias, options = {}) {
  const {jsPDF} = getPdfTools();
  const doc = new jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait'});
  const numero = registro.nRegistro || 'REGISTRO';

  if (options.formatoApple) {
    if (!options.boletaExtranjera?.id) throw new Error('BOLETA_APPLE_NO_ENCONTRADA');
    paintPage(doc);
    for (const slot of APPLE_SLOTS) {
      await drawEvidence(doc, slot, evidencias?.[slot.key]);
    }
    doc.addPage('a4', 'portrait');
    paintPage(doc);
    drawAppleReceipt(doc, options.boletaExtranjera);
    doc.save(`${numero}.pdf`);
    return;
  }

  paintPage(doc);
  for (const slot of SLOTS.filter(item => item.page === 1)) {
    await drawEvidence(doc, slot, evidencias?.[slot.key]);
  }

  doc.addPage('a4', 'portrait');
  paintPage(doc);
  for (const slot of SLOTS.filter(item => item.page === 2)) {
    await drawEvidence(doc, slot, evidencias?.[slot.key]);
  }

  doc.save(`${numero}.pdf`);
}
