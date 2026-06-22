import {getPdfTools} from '../../utils/pdfLibraries.js';
import {REGISTRO_EVIDENCIA_FIELDS} from './registroEvidencias.js';

const PAGE = {w: 210, h: 297};
const M = 12;

function fechaLocal(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-PE');
}

function soles(value) {
  const n = Number(value || 0);
  return `S/. ${n.toFixed(2)}`;
}

function fitImage(image, boxW, boxH) {
  const ratio = Math.min(boxW / image.width, boxH / image.height);
  return {
    w: image.width * ratio,
    h: image.height * ratio,
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('PDF_IMAGE_LOAD_FAILED'));
    img.src = dataUrl;
  });
}

async function addImageBox(doc, evidencia, label, x, y, w, h) {
  doc.setDrawColor(210, 220, 235);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(label.toUpperCase(), x + 3, y + 6);

  if (!evidencia?.dataUrl) return;
  const img = await loadImage(evidencia.dataUrl);
  const imageAreaY = y + 9;
  const imageAreaH = h - 12;
  const fitted = fitImage(img, w - 6, imageAreaH);
  const imgX = x + (w - fitted.w) / 2;
  const imgY = imageAreaY + (imageAreaH - fitted.h) / 2;
  doc.addImage(evidencia.dataUrl, 'JPEG', imgX, imgY, fitted.w, fitted.h, undefined, 'FAST');
}

function field(doc, label, value, x, y, w) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(String(value || '-'), w);
  doc.text(lines, x, y + 4.2);
}

function sectionTitle(doc, title, y) {
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(M, y - 5, PAGE.w - M * 2, 8, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(29, 78, 216);
  doc.text(title.toUpperCase(), M + 3, y);
}

export async function generarRegistroEvidenciasPDF(registro, evidencias) {
  const {jsPDF} = getPdfTools();
  const doc = new jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait'});
  const numero = registro.nRegistro || 'REGISTRO';

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 10, PAGE.w - M * 2, 34, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, 10, PAGE.w - M * 2, 34, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(numero, M + 4, 22);
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Registro de equipo con evidencias fotograficas', M + 4, 29);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Documento generado localmente. Las imagenes no se guardan en Firebase Storage en esta version.', M + 4, 36);

  sectionTitle(doc, 'Datos del registro', 55);
  field(doc, 'Cliente', registro.nombreCliente, M, 66, 58);
  field(doc, registro.tipoDocumentoCliente || 'DNI', registro.dniCliente, M + 64, 66, 38);
  field(doc, 'Celular', registro.celularCliente, M + 108, 66, 32);
  field(doc, 'Fecha', fechaLocal(registro.fecha), M + 146, 66, 42);
  field(doc, 'Equipo', `${registro.marcaEquipo || ''} ${registro.nombreComercialEquipo || registro.modeloEquipo || ''}`.trim(), M, 82, 72);
  field(doc, 'IMEI registrado', registro.imeiRegistrado || registro.imeiEquipo, M + 78, 82, 42);
  field(doc, 'Operador', registro.operador, M + 126, 82, 26);
  field(doc, 'Importe', soles(registro.precio), M + 158, 82, 30);
  field(doc, 'Estado', registro.estado, M, 98, 42);
  field(doc, 'Tipo', registro.tipo, M + 48, 98, 36);
  field(doc, 'Modelo', registro.modeloEquipo, M + 90, 98, 44);
  field(doc, 'Correo', registro.correoCliente, M + 140, 98, 48);

  sectionTitle(doc, 'Evidencias obligatorias', 119);
  const gap = 6;
  const colW = (PAGE.w - M * 2 - gap) / 2;
  const boxH = 62;
  const rows = [
    [REGISTRO_EVIDENCIA_FIELDS[0], REGISTRO_EVIDENCIA_FIELDS[1]],
    [REGISTRO_EVIDENCIA_FIELDS[2], REGISTRO_EVIDENCIA_FIELDS[3]],
  ];

  let y = 128;
  for (const row of rows) {
    await addImageBox(doc, evidencias[row[0].key], row[0].label, M, y, colW, boxH);
    await addImageBox(doc, evidencias[row[1].key], row[1].label, M + colW + gap, y, colW, boxH);
    y += boxH + gap;
  }
  await addImageBox(doc, evidencias.imeiLogico, 'IMEI logico', M, y, PAGE.w - M * 2, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${fechaLocal(new Date().toISOString())}`, M, PAGE.h - 8);

  doc.save(`${numero}.pdf`);
}
