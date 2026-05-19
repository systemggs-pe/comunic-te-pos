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

export async function generarBoletaExtranjera3({ cliente, ventas, equiposMap, totalClp, fechaHora, nBoleta: numeroBoleta }) {
  const {jsPDF} = getPdfTools();
  const gen417 = await getPdf417Generator();
  const mmW = 80;
  const M = 5;
  const FONT = 'helvetica';
  const FS = 9; // mismo tamano base que la boleta extranjera #2
  const nBoleta = numeroBoleta ? String(numeroBoleta) : String(Date.now()).slice(-4).padStart(4, '0');
  const emisor = {
    nombre: 'ALVARO JOSE PIZARRO VILLARROEL',
    rut: '18.478.314-2',
    giro1: 'VTA. CELULARES, TARJETAS PREPAGO,',
    giro2: 'CHIPS, ACCESORIOS, ELECTROD. ELECTRONICOS',
    direccion: '18 DE SEPTIEMBRE 257',
    comuna: 'ARICA',
    ciudad: 'ARICA',
    vendedor: '18478314-2',
  };

  const ventasBoleta = Array.isArray(ventas) ? ventas : [];
  const totalNum = typeof totalClp === 'number'
    ? totalClp
    : parseInt(String(totalClp).replace(/\D/g, ''), 10) || 0;
  const iva = Math.round(totalNum - totalNum / 1.19);
  const totalSinIva = totalNum - iva;
  const fecha = fechaHora ? new Date(fechaHora) : new Date();
  const pad = n => String(n).padStart(2, '0');
  const fechaStr = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  const hora12 = fecha.getHours() % 12 || 12;
  const horaStr = `${hora12}.${pad(fecha.getMinutes())}${fecha.getHours() >= 12 ? 'pm' : 'am'}`;
  const fechaIso = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
  const money = value => `$ ${Number(value || 0).toLocaleString('es-CL')}`;

  const obtenerEquipo = venta => equiposMap?.[venta.imeiEquipo] || {};
  const nombreItem = venta => {
    const eq = obtenerEquipo(venta);
    const marca = venta.marcaEquipo || eq.marca || '';
    const nombre = eq.nombreComercial || venta.nombreComercial || venta.modeloEquipo || eq.modelo || 'EQUIPO';
    return `${marca} ${nombre}`.replace(/\s+/g, ' ').trim();
  };
  const nombreComercialItem = venta => {
    const eq = obtenerEquipo(venta);
    return eq.nombreComercial || venta.nombreComercial || venta.modeloEquipo || eq.modelo || nombreItem(venta);
  };
  const memoriaItem = venta => {
    const eq = obtenerEquipo(venta);
    const memoria = eq.memoria || venta.memoria || '';
    const texto = String(memoria || '').trim();
    if (!texto) return '';
    return /\b(GB|TB|MB)\b/i.test(texto) ? texto.toUpperCase() : `${texto}GB`;
  };

  const texto417 = [
    nBoleta,
    emisor.rut,
    emisor.nombre,
    cliente?.dni || '',
    cliente?.nombre || '',
    ventasBoleta.map(v => [nombreItem(v), v.imeiEquipo, obtenerEquipo(v).imei2 || v.imei2Equipo].filter(Boolean).join(' ')).join('; '),
    totalSinIva,
    iva,
    totalNum,
    fechaIso,
    'SII Res.99/2014',
  ].join('|');
  const dataUrl417 = gen417(texto417, 2, 1);
  const img417 = new Image();
  await new Promise((resolve, reject) => {
    img417.onload = resolve;
    img417.onerror = reject;
    img417.src = dataUrl417;
  });
  const pdf417W = mmW - M * 2;
  const pdf417H = img417.naturalHeight > 0
    ? pdf417W * (img417.naturalHeight / img417.naturalWidth) * 1.28
    : 38;

  const renderPDF = (doc, dibujar) => {
    let y = 5;
    const cx = mmW / 2;
    const lh = size => size * 0.38 + 1.15;
    const ink = 18;
    const muted = 88;
    const ruleColor = 170;

    const drawText = (txt, x, yy, size, opts = {}) => {
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opts.muted ? muted : ink);
      if (!dibujar) return;
      if (opts.align) doc.text(String(txt ?? ''), x, yy, {align: opts.align});
      else doc.text(String(txt ?? ''), x, yy);
    };
    const center = (txt, size, bold = false) => {
      doc.setFont(FONT, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(ink);
      const lines = doc.splitTextToSize(String(txt ?? ''), mmW - M * 2);
      if (dibujar) lines.forEach((line, i) => doc.text(line, cx, y + i * lh(size), {align: 'center'}));
      y += lh(size) * lines.length;
    };
    const row = (label, value, size = FS) => {
      drawText(label, M, y, size, {bold: true, muted: true});
      doc.setFont(FONT, 'normal');
      doc.setFontSize(size);
      doc.setTextColor(ink);
      const xValue = M + 18;
      const lines = doc.splitTextToSize(String(value ?? ''), mmW - M - xValue);
      if (dibujar) lines.forEach((line, i) => doc.text(line, xValue, y + i * lh(size)));
      y += lh(size) * Math.max(lines.length, 1);
    };
    const rule = () => {
      if (dibujar) {
        doc.setLineWidth(0.25);
        doc.setDrawColor(ruleColor);
        doc.line(M, y, mmW - M, y);
      }
      y += 3;
    };
    const section = title => {
      if (dibujar) {
        doc.setDrawColor(ruleColor);
        doc.setLineWidth(0.18);
        doc.line(M, y, mmW - M, y);
      }
      y += 3.4;
      drawText(title, M, y, 7.6, {bold: true, muted: true});
      y += 4.5;
    };
    const totalRow = (label, value, options = {}) => {
      const {bold = false, fill = false} = options;
      const rowX = M;
      const rowW = mmW - M * 2;
      const rowH = bold ? 8.2 : 6.1;
      const labelX = M + 2;
      const valueX = mmW - M - 2;

      if (dibujar && fill) {
        doc.setFillColor(238);
        doc.rect(rowX, y - 4.8, rowW, rowH, 'F');
      }

      drawText(label, labelX, y, bold ? 9.1 : 8.5, {bold, muted: !bold});
      drawText(value, valueX, y, bold ? 9.4 : 8.5, {align: 'right', bold});
      y += bold ? 8.2 : 5.8;
    };
    const table = {
      qtyX: M + 3.8,
      itemX: M + 9.5,
      itemW: 22.5,
      valueX: 52,
      discountX: 58.6,
      subtotalX: mmW - M,
      headerSize: 6.5,
      itemSize: 8.5,
      moneySize: 7.1,
      metaSize: 7.8,
      imeiSize: 8.5,
    };
    const infoLine = (label, value, options = {}) => {
      const text = String(value ?? '').trim();
      if (!text) return;
      const {imei = false} = options;
      const size = imei ? table.imeiSize : table.metaSize;
      const labelText = `${label}:`;

      doc.setFont(FONT, 'bold');
      doc.setFontSize(size);
      const valueX = table.itemX + doc.getTextWidth(labelText) + 1.8;

      drawText(labelText, table.itemX, y, size, {bold: true, muted: !imei});
      doc.setFont(FONT, imei ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(imei ? ink : muted);
      const lines = doc.splitTextToSize(text, mmW - M - valueX);
      if (dibujar) lines.forEach((txt, i) => doc.text(txt, valueX, y + i * lh(size)));
      y += lh(size) * Math.max(lines.length, 1);
    };

    if (dibujar) {
      doc.setDrawColor(ink);
      doc.setLineWidth(0.28);
      doc.roundedRect(41, 4, 34, 24, 1, 1);
      doc.setFillColor(245);
      doc.rect(M, 4, 31, 24, 'F');
    }

    drawText('ALVARO', M + 2, 10.2, 10.8, {bold: true});
    drawText('PIZARRO', M + 2, 16, 10.8, {bold: true});
    drawText('VENTA CELULARES', M + 2, 21.5, 7.4, {muted: true});
    drawText('ARICA, CHILE', M + 2, 25.5, 7.4, {muted: true});

    drawText('RUT', 58, 9.2, 7.8, {align: 'center', bold: true, muted: true});
    drawText(emisor.rut, 58, 13.8, 8.7, {align: 'center', bold: true});
    drawText('BOLETA ELECTRONICA', 58, 19.2, 7.9, {align: 'center', bold: true});
    drawText(`Nro ${nBoleta}`, 58, 24, 8.5, {align: 'center', bold: true});
    y = 34;

    center(emisor.nombre, 8.9, true);
    center(`${emisor.giro1} ${emisor.giro2}`, 8.1);
    row('Direccion:', emisor.direccion);
    row('Comuna:', emisor.comuna);
    row('Ciudad:', emisor.ciudad);
    row('Vendedor:', emisor.vendedor);
    row('Fecha:', `${fechaStr} ${horaStr}`);
    row('Pago:', 'Contado');
    y += 2;

    section('CLIENTE');
    row('Sr@:', cliente?.nombre ? cliente.nombre.toUpperCase() : '');
    row('Rut/CI:', cliente?.dni || '');
    y += 3;

    section('DETALLE');
    if (dibujar) {
      doc.setFillColor(244);
      doc.rect(M, y - 3.3, mmW - M * 2, 5.8, 'F');
    }
    drawText('CANT.', table.qtyX, y, table.headerSize, {align: 'center', bold: true, muted: true});
    drawText('NOMBRE COM.', table.itemX, y, table.headerSize, {bold: true, muted: true});
    drawText('VALOR U.', table.valueX, y, table.headerSize, {align: 'right', bold: true, muted: true});
    drawText('DESC.', table.discountX, y, table.headerSize, {align: 'center', bold: true, muted: true});
    drawText('SUBTOTAL', table.subtotalX, y, table.headerSize, {align: 'right', bold: true, muted: true});
    y += 6.5;

    ventasBoleta.forEach((venta, index) => {
      const eq = obtenerEquipo(venta);
      const itemTotal = penToClp(parseFloat(venta.precio || 0));
      doc.setFont(FONT, 'bold');
      doc.setFontSize(table.itemSize);
      const itemLines = doc.splitTextToSize(nombreComercialItem(venta).toUpperCase(), table.itemW);

      if (dibujar) {
        doc.setDrawColor(215);
        doc.setLineWidth(0.14);
        doc.line(M, y - 1.8, mmW - M, y - 1.8);
      }
      drawText('1', table.qtyX, y, 8.7, {align: 'center', bold: true});
      if (dibujar) itemLines.forEach((line, i) => drawText(line, table.itemX, y + i * lh(table.itemSize), table.itemSize, {bold: true}));
      drawText(money(itemTotal), table.valueX, y, table.moneySize, {align: 'right'});
      drawText('$ 0', table.discountX, y, table.moneySize, {align: 'center'});
      drawText(money(itemTotal), table.subtotalX, y, table.moneySize, {align: 'right', bold: true});
      y += lh(table.itemSize) * Math.max(itemLines.length, 1) + 1.3;

      const memoria = memoriaItem(venta);
      const imei2 = eq.imei2 || venta.imei2Equipo || '';
      infoLine('MEMORIA', memoria);
      infoLine('IMEI', venta.imeiEquipo, {imei: true});
      infoLine('IMEI 2', imei2, {imei: true});
      y += 1.4;

      if (dibujar && index < ventasBoleta.length - 1) {
        doc.setDrawColor(210);
        doc.setLineWidth(0.12);
        doc.line(M, y + 0.8, mmW - M, y + 0.8);
      }
      if (index < ventasBoleta.length - 1) y += 3.2;
    });

    y += 3;
    if (dibujar) {
      doc.setDrawColor(ruleColor);
      doc.setLineWidth(0.2);
      doc.line(M, y, mmW - M, y);
    }
    y += 4.2;
    drawText('RESUMEN', M + 2, y, 7.8, {bold: true, muted: true});
    y += 4.8;
    totalRow('TOTAL SIN IVA', money(totalSinIva));
    totalRow('IVA 19%', money(iva));
    if (dibujar) {
      doc.setDrawColor(ink);
      doc.setLineWidth(0.35);
      doc.line(M, y - 1.3, mmW - M, y - 1.3);
    }
    y += 1.3;
    totalRow('TOTAL CON IVA', money(totalNum), {bold: true, fill: true});

    y = Math.max(y + 5, 132);
    if (dibujar) doc.addImage(dataUrl417, 'PNG', M, y, pdf417W, pdf417H);
    y += pdf417H + 4.5;
    center('Timbre Electronico S.I.I.', 8.2, true);
    center('Res. 99 de 2014', 7.8);
    center('Verifique documento en sii.cl', 7.8);
    y += 4;

    return Math.max(y, 188);
  };

  const docMedida = new jsPDF({ unit: 'mm', format: [mmW, 260], orientation: 'portrait' });
  const altoTotal = renderPDF(docMedida, false);
  const docFinal = new jsPDF({ unit: 'mm', format: [mmW, altoTotal], orientation: 'portrait' });
  renderPDF(docFinal, true);

  const nombre3 = `BOLETA3-${nBoleta}.pdf`;
  const blob3 = docFinal.output('blob');
  const url3 = URL.createObjectURL(blob3);
  window.open(url3, '_blank');
  const a3 = document.createElement('a');
  a3.href = url3; a3.download = nombre3; a3.click();
  setTimeout(() => URL.revokeObjectURL(url3), 15000);
}

