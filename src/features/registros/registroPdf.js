/* eslint-disable no-empty */
import {getPdfTools} from '../../utils/pdfLibraries.js';

export async function generarTicketRegistroPDF(data) {
  const {jsPDF, JsBarcode} = getPdfTools();
  const mmW = 62;
  const M = 4;
  const FONT = 'helvetica';
  const codigoBarras = data.imeiRegistrado || data.imeiEquipo || '';
  let barcodeImg = null;
  let barcodeH = 0;

  if (codigoBarras) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, codigoBarras, {
        format: 'CODE128',
        width: 2.6,
        height: 72,
        displayValue: true,
        fontSize: 18,
        margin: 7,
        background: '#ffffff',
        lineColor: '#000000',
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - M * 2) * (c.height / c.width);
    } catch {}
  }

  const renderPDF = (doc, dibujar) => {
    let y = 5;
    const cx = mmW / 2;
    const ink = 18;
    const muted = 88;
    const ruleColor = 176;
    const sectionFill = 244;
    const SZ = {xs: 6.5, sm: 7.2, md: 8.2, lg: 9.4, xl: 11.5};
    const lh = size => size * 0.36 + 1.15;

    const text = (value, x, yy, size, opts = {}) => {
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opts.muted ? muted : ink);
      if (!dibujar) return;
      if (opts.align) doc.text(String(value ?? ''), x, yy, {align: opts.align});
      else doc.text(String(value ?? ''), x, yy);
    };

    const center = (value, size, opts = {}) => {
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opts.muted ? muted : ink);
      const lines = doc.splitTextToSize(String(value ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((line, i) => doc.text(line, cx, y + i * lh(size), {align: 'center'}));
      y += lh(size) * Math.max(lines.length, 1);
    };

    const rule = (gap = 2.8) => {
      if (dibujar) {
        doc.setDrawColor(ruleColor);
        doc.setLineWidth(0.18);
        doc.line(M, y, mmW - M, y);
      }
      y += gap;
    };

    const section = title => {
      rule(2.2);
      if (dibujar) {
        doc.setFillColor(sectionFill);
        doc.rect(M, y - 1.1, mmW - M * 2, 4.8, 'F');
      }
      text(title, M + 1.4, y + 2.2, SZ.xs, {bold: true, muted: true});
      y += 6.1;
    };

    const field = (label, value, size = SZ.sm) => {
      if (!value) return;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(size);
      const labelText = `${label}: `;
      const labelWidth = doc.getTextWidth(labelText);
      const lines = doc.splitTextToSize(String(value), mmW - M * 2 - labelWidth - 1);
      if (dibujar) {
        doc.setTextColor(muted);
        doc.setFont(FONT, 'bold');
        doc.text(labelText, M, y);
        doc.setTextColor(ink);
        doc.setFont(FONT, 'normal');
        doc.text(lines, M + labelWidth, y);
      }
      y += lh(size) * Math.max(lines.length, 1);
    };

    const twoColDate = (fechaStr, horaStr) => {
      if (dibujar) {
        doc.setFillColor(244);
        doc.rect(M, y - 3.8, mmW - M * 2, 7.4, 'F');
      }
      text('FECHA', M + 2, y, SZ.xs, {bold: true, muted: true});
      text('HORA', mmW - M - 2, y, SZ.xs, {align: 'right', bold: true, muted: true});
      y += 3.4;
      text(fechaStr, M + 2, y, SZ.sm, {bold: true});
      text(horaStr, mmW - M - 2, y, SZ.sm, {align: 'right', bold: true});
      y += 5.4;
    };

    const fecha = new Date(data.fecha);
    const pad = n => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
    const horaStr = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;

    if (dibujar) {
      doc.setFillColor(245);
      doc.rect(M, y - 1, mmW - M * 2, 16.5, 'F');
    }
    center('CENTRO DE REGISTRO', SZ.lg, {bold: true});
    center('INDEPENDIENTE', SZ.lg, {bold: true});
    center('LISTA BLANCA, OSIPTEL', SZ.sm, {muted: true});
    if (data.nRegistro) center(data.nRegistro, SZ.sm, {bold: true});
    y += 1.5;
    center('Av. Patricio Melendez 234', SZ.xs, {muted: true});
    center('Galerias de Gamarra Int. 1B, Tacna', SZ.xs, {muted: true});
    center('Cel. 052 607 065', SZ.xs, {muted: true});

    section('CLIENTE');
    field('NOMBRE', data.nombreCliente || '');
    field(data.tipoDocumentoCliente || 'DNI', data.dniCliente || '');
    field('CORREO', data.correoCliente || '', SZ.xs);
    field('CELULAR', data.celularCliente || '');
    field('CEL. REF', data.celularRef || '');

    section('EQUIPO');
    field('IMEI', data.imeiRegistrado || data.imeiEquipo || '');
    field('MARCA', data.marcaEquipo || '');
    field('MODELO', data.modeloEquipo || '');
    field('N. COM.', data.nombreComercialEquipo || '');
    field('OPERADOR', data.operador || '');
    field('TIPO', data.tipo || '');

    y += 1.5;
    if (barcodeImg) {
      if (dibujar) doc.addImage(barcodeImg, 'PNG', M, y, mmW - M * 2, barcodeH);
      y += barcodeH + 3;
    }

    rule(3.4);
    twoColDate(fechaStr, horaStr);

    rule(3.2);
    center('EQUIPO VALIDADO', SZ.md, {bold: true});
    center('Este equipo paso las validaciones requeridas para registrar su equipo a OSIPTEL.', SZ.xs, {muted: true});
    y += 5;

    return y;
  };

  const docMedida = new jsPDF({unit: 'mm', format: [mmW, 300], orientation: 'portrait'});
  const altoTotal = renderPDF(docMedida, false);
  const docFinal = new jsPDF({unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait'});
  renderPDF(docFinal, true);

  const nombre = `REGISTRO-${data.nRegistro || 'ticket'}.pdf`;
  const blob = docFinal.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
