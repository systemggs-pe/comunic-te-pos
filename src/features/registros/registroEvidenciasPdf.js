import {getPdfTools} from '../../utils/pdfLibraries.js';
import {drawAppleStoreReceiptPages} from './appleStoreReceiptPdf.js';

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

export function getRegistroEvidencePdfPlan({formatoApple = false} = {}) {
  const slots = formatoApple ? APPLE_SLOTS : SLOTS;
  return {
    pages: 2,
    slots: slots.map(slot => ({...slot})),
    requiredPages: [...new Set(slots.map(slot => slot.page))],
  };
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('PDF_IMAGE_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

async function resolveImageDataUrl(source) {
  if (String(source || '').startsWith('data:image/')) return source;
  const response = await fetch(source, {credentials: 'omit'});
  if (!response.ok) throw new Error('PDF_IMAGE_FETCH_FAILED');
  return readBlobAsDataUrl(await response.blob());
}

async function loadImage(source) {
  const dataUrl = await resolveImageDataUrl(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({image: img, dataUrl});
    img.onerror = () => reject(new Error('PDF_IMAGE_LOAD_FAILED'));
    img.src = dataUrl;
  });
}

function fitContain(image, boxW, boxH) {
  const ratio = Math.min(boxW / image.width, boxH / image.height);
  return {w: image.width * ratio, h: image.height * ratio};
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
  const loaded = await loadImage(evidencia.dataUrl);
  const fitted = fitContain(loaded.image, slot.w, slot.h);
  const x = slot.x + (slot.w - fitted.w) / 2;
  const y = slot.y + (slot.h - fitted.h) / 2;
  doc.addImage(loaded.dataUrl, 'JPEG', x, y, fitted.w, fitted.h, undefined, 'FAST');
}

function paintPage(doc) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
}

export async function generarRegistroEvidenciasPDF(registro, evidencias, options = {}) {
  const {jsPDF, JsBarcode} = getPdfTools();
  const plan = getRegistroEvidencePdfPlan(options);
  const doc = new jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait'});
  const numero = registro.nRegistro || 'REGISTRO';

  paintPage(doc);
  if (options.formatoApple) {
    if (!options.boletaExtranjera?.id) throw new Error('BOLETA_APPLE_NO_ENCONTRADA');
    for (const slot of plan.slots) {
      await drawEvidence(doc, slot, evidencias?.[slot.key]);
    }
    drawAppleStoreReceiptPages(doc, options.boletaExtranjera, JsBarcode);
    doc.save(`${numero}.pdf`);
    return;
  }

  for (const slot of plan.slots.filter(item => item.page === 1)) {
    await drawEvidence(doc, slot, evidencias?.[slot.key]);
  }
  doc.addPage('a4', 'portrait');
  paintPage(doc);
  for (const slot of plan.slots.filter(item => item.page === 2)) {
    await drawEvidence(doc, slot, evidencias?.[slot.key]);
  }
  doc.save(`${numero}.pdf`);
}
