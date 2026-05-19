/* eslint-disable no-unused-vars, no-empty */
import { penToClp } from '../../utils/currency.js';
import {getPdf417Generator, getPdfTools} from '../../utils/pdfLibraries.js';

export async function generarBoletaExtranjera({ cliente, ventas, equiposMap, totalClp, fechaHora, nBoleta: numeroBoleta }) {
  const {jsPDF, JsBarcode} = getPdfTools();
  const mmW = 48;
  const FONT = 'courier';
  // Courier es ancho — sin escala, tamaños pequeños para que quepan en 48mm
  const F = 1.0;

  // Código de barras: S/N del primer equipo o IMEI
  const primerEq = equiposMap[ventas[0]?.imeiEquipo] || {};
  const codigoBarras = primerEq.sn || ventas[0]?.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (codigoBarras) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, codigoBarras, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 6, background: '#ffffff', lineColor: '#000000' });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - 6) * (c.height / c.width);
    } catch (_) {}
  }

  // Número de boleta auto (timestamp)
  const nBoleta = numeroBoleta ? String(numeroBoleta) : String(Date.now()).slice(-4).padStart(4, '0');

  const renderPDF = (doc, dibujar) => {
    let y = 4;
    const cx  = mmW / 2;
    const M   = 2;
    const F   = 1; // mismo factor que tickets de venta y registro
    const lh  = (sz) => sz * F * 0.42 + 1.0;

    const sep = () => {
      if (dibujar) {
        doc.setLineDash([0.5, 0.5]);
        doc.setDrawColor(130);
        doc.line(M, y, mmW - M, y);
        doc.setLineDash([]);
        doc.setDrawColor(0);
      }
      y += 2.5;
    };

    const tc = (text, sz, bold = false) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(text ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((l, i) => doc.text(l, cx, y + i * lh(sz), { align: 'center' }));
      y += lh(sz) * lines.length;
    };

    const tl = (text, sz) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      const lines = doc.splitTextToSize(String(text ?? ''), mmW - M * 2);
      if (dibujar) {
        lines.forEach((l, i) => doc.text(l, i === 0 ? M : M + 3, y + i * lh(sz)));
      }
      y += lh(sz) * lines.length;
    };

    const fila = (label, valor, sz = 6.5) => {
      doc.setFontSize(sz * F); doc.setFont(FONT, 'normal');
      const labelTxt = label + ': ';
      const lw    = doc.getTextWidth(labelTxt);
      const lines = doc.splitTextToSize(String(valor ?? ''), mmW - M - lw - M);
      if (dibujar) {
        doc.text(labelTxt, M, y);
        lines.forEach((l, i) => doc.text(l, M + lw, y + i * lh(sz)));
      }
      y += lh(sz) * Math.max(lines.length, 1);
    };

    const fecha = fechaHora ? new Date(fechaHora) : new Date();
    const pad = n => String(n).padStart(2, '0');
    const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth()+1)}/${fecha.getFullYear().toString().slice(2)}`;
    const horaStr  = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;

    // ── CABECERA (centrada, bold) ──
    y += 1;
    tc(`R.U.T.  17.673.680 - 1`, 7, true);
    tc(`BOLETA ELECTRONICA N°  ${nBoleta}`, 7, true);
    tc('SII ARICA', 7, true);
    y += 1;
    sep();
    y += 1;

    // ── TIENDA (izquierda) ──
    tl('ROBERTO IGNACIO', 6.5);
    tl('PIZARRO VILLAROEL', 6.5);
    tl('VENTA CELULARES ACCESORIOS', 6.5);
    tl('18 DE SEPTIEMBRE #257', 6.5);
    tl('LOCAL 68 - COM. SANTA BLANCA', 6.5);
    y += 1;
    sep();
    y += 2;

    // ── CLIENTE + EQUIPOS (izquierda, sin separador entre cliente y equipo) ──
    if (cliente.nombre) fila('NOMBRE', cliente.nombre.toUpperCase(), 6.5);
    if (cliente.dni)    fila('RUT',    cliente.dni, 6.5);
    y += 1;

    ventas.forEach(v => {
      const eq  = equiposMap[v.imeiEquipo] || {};
      const mem = eq.memoria || v.memoria || '';
      const nom = eq.nombreComercial || v.nombreComercial || v.modeloEquipo || '';
      // "IPHONE 11 128GB" — sin etiqueta
      tl(`${nom}${mem ? ' ' + mem + 'GB' : ''}`.trim(), 6.5);
      const color = eq.color || v.color || '';
      if (color) fila('COLOR', color, 6.5);
      fila('IMEI', v.imeiEquipo || '', 6.5);
      if (eq.imei2) fila('IMEI', eq.imei2, 6.5);
    });

    y += 1;
    // SUB TOTAL e DESCUENTOS (izquierda)
    const subClp = penToClp(ventas.reduce((s,v) => s + parseFloat(v.precio||0), 0));
    fila('SUB TOTAL',        subClp.toLocaleString('es-CL'), 6.5);
    fila('TOTAL DESCUENTOS', '0', 6.5);
    y += 2;

    // TOTAL grande alineado a la derecha
    if (dibujar) {
      doc.setFontSize(8 * F); doc.setFont(FONT, 'normal');
      doc.text(`TOTAL:  $ ${totalClp.toLocaleString('es-CL')}`, mmW - M, y, { align: 'right' });
    }
    y += lh(8) + 1;
    sep();
    y += 2;

    // ── CÓDIGO DE BARRAS (centrado) ──
    if (barcodeImg) {
      if (dibujar) doc.addImage(barcodeImg, 'PNG', 3, y, mmW - 6, barcodeH);
      y += barcodeH + 2;
    }
    sep();
    y += 1;

    // ── FECHA / HORA ──
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text('FECHA', M, y);
      doc.text('HORA', mmW - M, y, { align: 'right' });
    }
    y += lh(6.5);
    if (dibujar) {
      doc.setFontSize(6.5 * F); doc.setFont(FONT, 'normal');
      doc.text(fechaStr, M, y);
      doc.text(horaStr, mmW - M, y, { align: 'right' });
    }
    y += lh(6.5) + 2;

    // ── PIE (mixtas, centrado) ──
    tc('********************************', 5.5);
    tc('Esta boleta es indispensable', 6.5);
    tc('para', 6.5);
    tc('cambios y devoluciones.', 6.5);
    tc('********************************', 5.5);
    y += 4;

    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 300], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre = `BOLETA-${nBoleta}.pdf`;
  const blob = docFinal.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}


export async function generarBoletaExtranjera2({ cliente, ventas, equiposMap, totalClp, fechaHora, nBoleta: numeroBoleta }) {
  const {jsPDF} = getPdfTools();
  const gen417 = await getPdf417Generator();
  const mmW  = 80;
  const M    = 5;
  const FONT = 'courier';
  const FS   = 9; // ← tamaño de fuente de la boleta 2, cámbialo aquí
  const nBoleta = numeroBoleta ? String(numeroBoleta) : String(Date.now()).slice(-4).padStart(4, '0');

  // Totales
  const totalNum = typeof totalClp === 'number' ? totalClp
    : parseInt(String(totalClp).replace(/\D/g, ''), 10) || 0;
  const iva = Math.round(totalNum - totalNum / 1.19);

  // Fecha aaaa-mm-dd
  const fecha    = fechaHora ? new Date(fechaHora) : new Date();
  const pad      = n => String(n).padStart(2, '0');
  const fechaStr = `${fecha.getFullYear()}-${pad(fecha.getMonth()+1)}-${pad(fecha.getDate())}`;

  // Equipo
  const pV  = ventas[0] || {};
  const pEq = equiposMap[pV.imeiEquipo] || {};
  const nombreComercial = pEq.nombreComercial || pV.nombreComercial || pV.modeloEquipo || '';
  const memoria = pEq.memoria || pV.memoria || '';
  const color   = pEq.color   || pV.color   || '';
  const imei1   = pV.imeiEquipo || '';
  const imei2   = pEq.imei2 || pV.imei2Equipo || '';

  // PDF417 real — obligatorio
  const pdf417W = mmW - M * 2;
  const texto417 = [
    nBoleta, cliente.dni || '', cliente.nombre || '',
    imei1, imei2,
    `${nombreComercial}${memoria ? ' ' + memoria + 'GB' : ''}`,
    color, totalNum, iva, fechaStr, '18.478.314-2', 'SII Res.99/2014'
  ].join('|');
  const dataUrl417 = gen417(texto417, 2, 1);
  const img417 = new Image();
  await new Promise((res, rej) => { img417.onload = res; img417.onerror = rej; img417.src = dataUrl417; });
  const pdf417Img = dataUrl417;
  const pdf417H = img417.naturalHeight > 0
    ? pdf417W * (img417.naturalHeight / img417.naturalWidth)
    : 24;

  const renderPDF = (doc, dibujar) => {
    let y = 0;
    const cx = mmW / 2;
    const lh = sz => sz * 0.37 + 1.2;

    const nl = (n = 1) => { y += n; };
    const tl = (txt, sz, bold = false) => {
      doc.setFontSize(sz); doc.setFont(FONT, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(txt ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((l, i) => doc.text(l, M, y + i * lh(sz)));
      y += lh(sz) * lines.length;
    };
    const tr = (txt, sz) => {
      doc.setFontSize(sz); doc.setFont(FONT, 'normal');
      if (dibujar) doc.text(String(txt ?? ''), mmW - M, y, { align: 'right' });
      y += lh(sz);
    };

    nl(5);
    tl('                               ', FS);
    tl('                               ', FS);
    tl('ALVARO JOSE PIZARRO VILLARROEL', FS);
    tl('18.478.314-2', FS);
    tl('Giro: VTA.CELULARES,TARJETA', FS);
    tl('PREPAGO,', FS);
    tl('CHIPS,ACCESORIOS,ELECTROD.ELECTRONI', FS);
    tl('COS.', FS);
    tl('18 DE SEPTIEMBRE 257', FS);
    tl('Arica', FS);
    nl(2);
    tl(`BOLETA ELECTRÓNICA NUMERO: ${nBoleta}`, FS);
    tl('REF. VENDEDOR: 18478314-2', FS);
    tl(`Fecha: ${fechaStr}`, FS);
    nl(2);
    tl('Dirección: Santiago', FS);
    nl(3);
    tl('Venta', FS);
    nl(2);
    if (cliente.nombre) tl(`NOMBRE: ${cliente.nombre.toUpperCase()}`, FS);
    if (cliente.dni)    tl(`RUT: ${cliente.dni}`, FS);
    nl(1);
    const prodStr = `${nombreComercial}${memoria ? ' ' + memoria + 'GB' : ''}`.trim();
    if (prodStr) tl(prodStr, FS);
    if (color)   tl(`COLOR: ${color.toUpperCase()}`, FS);
    if (imei1)   tl(`IMEI: ${imei1}`, FS);
    if (imei2)   tl(`IMEI: ${imei2}`, FS);
    nl(2);
    tr(`$ ${totalNum.toLocaleString('es-CL')}`, FS);
    nl(2);
    tl('El IVA incluido en esta boleta es', FS);
    tl(`de: $ ${iva.toLocaleString('es-CL')}`, FS);
    nl(5);
    if (pdf417Img) {
      if (dibujar) doc.addImage(pdf417Img, 'PNG', M, y, pdf417W, pdf417H);
      y += pdf417H;
    }
    nl(3);
    tl('Timbre Electrónico SII', FS);
    tl('Res. 99 de 2014', FS);
    tl('Verifique documento en sii.cl', FS);
    tl('                               ', FS);
    tl('                               ', FS);
    nl(6);
    return y;
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 500], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal  = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre2 = `BOLETA2-${nBoleta}.pdf`;
  const blob2   = docFinal.output('blob');
  const url2    = URL.createObjectURL(blob2);
  window.open(url2, '_blank');
  const a2 = document.createElement('a');
  a2.href = url2; a2.download = nombre2; a2.click();
  setTimeout(() => URL.revokeObjectURL(url2), 15000);
}

