/* eslint-disable no-unused-vars, no-empty */
import {getPdfTools} from '../../utils/pdfLibraries.js';

export async function generarTicketRegistroPDF(data) {
  const {jsPDF, JsBarcode} = getPdfTools();
  const mmW = 62;
  const FONT = 'courier'; // fuente monoespaciada tipo consola

  // Código de barras a alta resolución
  const codigoBarras = data.imeiRegistrado || data.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (codigoBarras) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, codigoBarras, {
        format: 'CODE128', width: 3, height: 80,
        displayValue: true, fontSize: 20, margin: 8,
        background: '#ffffff', lineColor: '#000000'
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - 6) * (c.height / c.width);
    } catch (_) {}
  }

  const renderPDF = (doc, dibujar) => {
    let y = 4;
    const cx = mmW / 2;
    const F = 1.3; // factor de escala de fuente +30%
    const lh = 3.6;
    const lhB = (sz) => lh + (sz * F - 7) * 0.35;

    const sep = (dash = false) => {
      if (dibujar) { doc.setLineDash(dash ? [0.6, 0.6] : []); doc.setDrawColor(0); doc.line(1, y, mmW - 1, y); doc.setLineDash([]); }
      y += 2.5;
    };
    const tc = (text, sz) => {
      if (dibujar) { doc.setFontSize(sz * F); doc.setFont(FONT, 'normal'); doc.text(String(text ?? ''), cx, y, { align: 'center' }); }
      y += lhB(sz);
    };
    const fila = (label, valor, sz = 7) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      if (dibujar) doc.text(label + ':', 2, y);
      const lw = doc.getTextWidth(label + ': ');
      const lines = doc.splitTextToSize(String(valor ?? ''), mmW - 2 - lw - 1);
      if (dibujar) doc.text(lines, 2 + lw, y);
      y += lhB(sz) * Math.max(lines.length, 1);
    };
    const filaDerecha = (label, valor, sz = 7) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      if (dibujar) { doc.text(label + ':', 2, y); doc.text(String(valor ?? ''), mmW - 2, y, { align: 'right' }); }
      y += lhB(sz);
    };

    const fecha = new Date(data.fecha);
    const pad = n => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth()+1)}/${fecha.getFullYear()}`;
    const horaStr  = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;

    // CABECERA
    sep(true);
    tc('CENTRO DE REGISTRO', 8);
    tc('INDEPENDIENTE', 8);
    tc('REGISTRO DE EQUIPO', 7.5);
    tc('LISTA BLANCA - OSIPTEL', 7.5);
    tc(data.nRegistro || '', 7.5);
    tc('TACNA - TACNA', 7);
    sep(true);
    tc('AV. PATRICIO MELENDEZ 234', 6.5);
    tc('GALERIAS DE GAMARRA INT. 1B', 6.5);
    tc('CEL. 052 607 065', 6.5);
    sep(true);

    // DATOS CLIENTE
    fila('NOMBRE',   data.nombreCliente  || '');
    fila(data.tipoDocumentoCliente || 'DNI', data.dniCliente || '');
    fila('CORREO',   data.correoCliente  || '');
    fila('CELULAR',  data.celularCliente || '');
    fila('CEL. REF', data.celularRef     || '');
    sep(true);

    // DATOS EQUIPO
    fila('IMEI',     data.imeiRegistrado || data.imeiEquipo || '');
    fila('MARCA',    data.marcaEquipo    || '');
    fila('MODELO',   data.modeloEquipo   || '');
    fila('N. COM.',  data.nombreComercialEquipo || '');
    fila('OPERADOR', data.operador       || '');
    fila('TIPO',     data.tipo           || '');
    sep(true);

    // CÓDIGO DE BARRAS
    if (barcodeImg) {
      if (dibujar) doc.addImage(barcodeImg, 'PNG', 3, y, mmW - 6, barcodeH);
      y += barcodeH + 2;
    }
    sep(true);

    // FECHA HORA
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text('FECHA', 2, y); doc.text('HORA', mmW - 2, y, { align: 'right' });
    }
    y += lhB(6.5);
    if (dibujar) {
      doc.text(fechaStr, 2, y); doc.text(horaStr, mmW - 2, y, { align: 'right' });
    }
    y += lhB(6.5) + 2;

    // PIE
    tc('*************************************', 6);
    tc('ESTE EQUIPO HA PASADO', 7);
    tc('LAS VALIDACIONES', 7);
    tc('QUE EXIGIMOS PARA', 7);
    tc('REGISTRAR SU EQUIPO', 7);
    tc('A OSIPTEL', 7);
    tc('***********************************', 6);
    y += 4;

    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 300], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre = `REGISTRO-${data.nRegistro || 'ticket'}.pdf`;
  const blob = docFinal.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

