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
  drawPlaceholder(doc, slot);
  if (!evidencia?.dataUrl) return;

  const image = await loadImage(evidencia.dataUrl);
  const fitted = fitContain(image, slot.w, slot.h);
  const x = slot.x + (slot.w - fitted.w) / 2;
  const y = slot.y + (slot.h - fitted.h) / 2;

  doc.addImage(evidencia.dataUrl, 'JPEG', x, y, fitted.w, fitted.h, undefined, 'FAST');

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(slot.x, slot.y, slot.w, slot.h, 'S');
}

function paintPage(doc) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
}

export async function generarRegistroEvidenciasPDF(registro, evidencias) {
  const {jsPDF} = getPdfTools();
  const doc = new jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait'});
  const numero = registro.nRegistro || 'REGISTRO';

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
