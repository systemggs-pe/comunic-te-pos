import {APPLE_RECEIPT_LOGO} from './appleReceiptAssets.js';

const DEFAULT_EMISOR = {
  nombre: 'Apple Columbia',
  direccion: '10300 Little Patuxent Parkway, Space 2040',
  ciudad: 'Columbia, MD 21044',
  email: 'columbia@apple.com',
  telefono: '410-423-1801',
  sitioWeb: 'www.apple.com/retail/columbia/',
  metodoPago: 'DEBIT (Contactless)',
  tipoCambioPenUsd: 3.75,
  impuestoPorcentaje: 6,
  tarjetaUltimos4: '3282',
  codigoTerminal: '025039',
  applicationId: 'A0000000042203',
  applicationPanSequence: '00',
  deviceId: '0565',
  cardType: 'Debit',
  tvr: '0000008001',
  tsi: 'E800',
  diasDevolucion: 16,
  partNumber: 'MPUA3LL/A',
  policyUrl: 'https://www.apple.com/legal/sales-support/sales-policies/retail_us.html',
  supportMessage: 'Learn how to set up your product and transfer your data from home at support.apple.com.',
};

function roundUsd(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function penToUsd(value, rate) {
  const safeRate = Number(rate);
  if (!Number.isFinite(safeRate) || safeRate <= 0) return 0;
  return roundUsd(Number(value || 0) / safeRate);
}

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function crearReferenciaAppleStore(value, dateValue = new Date(), page = 0) {
  const fecha = safeDate(dateValue);
  const dateDigits = `${fecha.getFullYear()}${pad(fecha.getMonth() + 1)}${pad(fecha.getDate())}`;
  const source = `${String(value ?? '').replace(/\D/g, '')}${page || ''}`;
  const referenceDigits = `${dateDigits}${source || String(fecha.getTime())}`.slice(-10);
  return {barcode: `${dateDigits}R${referenceDigits}`, reference: `R${referenceDigits}`};
}

export function createAppleStoreReceiptPages(boleta) {
  const data = boleta?.boletaData || {};
  const emisorGuardado = Object.fromEntries(
    Object.entries(data.emisor || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );
  const emisor = {...DEFAULT_EMISOR, ...emisorGuardado};
  const fecha = safeDate(data.fechaHora || boleta?.fechaHora);
  const ventas = Array.isArray(data.ventas) && data.ventas.length ? data.ventas : [{}];
  const equiposMap = data.equiposMap && typeof data.equiposMap === 'object' ? data.equiposMap : {};
  const nBoleta = String(data.nBoleta || boleta?.nBoleta || Date.now());
  const sourceTotalPen = ventas.reduce((sum, venta) => sum + Number(venta?.precio || 0), 0)
    || Number(boleta?.totalPen || 0);
  const totalUsd = sourceTotalPen > 0
    ? penToUsd(sourceTotalPen, emisor.tipoCambioPenUsd)
    : penToUsd(Math.max(0, Number(data.totalClp || boleta?.totalClp || 0)) / 266.67, emisor.tipoCambioPenUsd);
  const taxPercent = Math.min(100, Math.max(0, Number(emisor.impuestoPorcentaje || 0)));
  const returnDate = new Date(fecha);
  returnDate.setDate(returnDate.getDate() + Math.max(0, Number(emisor.diasDevolucion || 16)));
  const returnMonths = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  const cardLast4 = String(emisor.tarjetaUltimos4 || '3282').replace(/\D/g, '').slice(-4).padStart(4, '0');
  let allocatedTotal = 0;

  const itemTotals = ventas.map((venta, index) => {
    if (index === ventas.length - 1) return roundUsd(totalUsd - allocatedTotal);
    const value = roundUsd(totalUsd * Number(venta?.precio || 0) / (sourceTotalPen || 1));
    allocatedTotal = roundUsd(allocatedTotal + value);
    return value;
  });

  return ventas.map((venta, pageIndex) => {
    const equipo = equiposMap[venta?.imeiEquipo] || {};
    const itemTotal = itemTotals[pageIndex] || 0;
    const subtotal = taxPercent > 0 ? roundUsd(itemTotal / (1 + taxPercent / 100)) : itemTotal;
    const tax = roundUsd(itemTotal - subtotal);
    const model = String(equipo.nombreComercial || venta?.nombreComercial || venta?.modeloEquipo || equipo.modelo || 'IPHONE').trim();
    const color = String(venta?.color || equipo.color || '').trim();
    const memory = String(venta?.memoria || equipo.memoria || '').trim();
    return {
      emisor,
      nBoleta,
      headerDate: `${new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', year: 'numeric'}).format(fecha)} ${new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}).format(fecha)}`,
      transactionDate: `${fecha.getFullYear()}/${pad(fecha.getMonth() + 1)}/${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`,
      returnDateText: `${returnMonths[returnDate.getMonth()]} ${pad(returnDate.getDate())}, ${returnDate.getFullYear()}`,
      cardLast4,
      productName: [model.toUpperCase(), color, memory ? `${memory.toUpperCase()}-USA` : 'USA'].filter(Boolean).join(' ').replace(/\s+/g, ' '),
      serial: venta?.sn || equipo.sn || '-',
      imei1: venta?.imeiEquipo || equipo.imei || '-',
      imei2: equipo.imei2 || venta?.imei2Equipo || '-',
      partNumber: venta?.partNumber || equipo.partNumber || emisor.partNumber || 'MPUA3LL/A',
      reference: crearReferenciaAppleStore(nBoleta, fecha, pageIndex),
      subtotal,
      tax,
      total: itemTotal,
    };
  });
}

function drawBarcode(doc, JsBarcode, reference, pageW) {
  if (typeof JsBarcode !== 'function') return;
  try {
    const barcodeTarget = {};
    JsBarcode(barcodeTarget, reference.barcode, {format: 'CODE39', displayValue: false, margin: 0});
    const bits = barcodeTarget.encodings?.map(encoding => encoding.data).join('') || '';
    const moduleWidth = 0.5;
    const barcodeWidth = bits.length * moduleWidth;
    const barcodeX = (pageW - barcodeWidth) / 2;
    doc.setFillColor(0, 0, 0);
    let runStart = -1;
    for (let index = 0; index <= bits.length; index += 1) {
      if (bits[index] === '1' && runStart < 0) runStart = index;
      if (bits[index] !== '1' && runStart >= 0) {
        doc.rect(barcodeX + runStart * moduleWidth, 498.6, (index - runStart) * moduleWidth, 18, 'F');
        runStart = -1;
      }
    }
  } catch {
    // La boleta sigue siendo legible aunque el navegador no pueda pintar el código.
  }
}

export function drawAppleStoreReceiptPages(doc, boleta, JsBarcode, {addFirstPage = true} = {}) {
  const pages = createAppleStoreReceiptPages(boleta);
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0 || addFirstPage) doc.addPage('letter', 'portrait');
    const pageW = doc.internal.pageSize.getWidth();
    const money = value => `$ ${Number(value || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const text = (value, x, y, options = {}) => {
      doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
      doc.setFontSize(options.size || 8);
      doc.setTextColor(0, 0, 0);
      doc.text(String(value ?? ''), x, y, options.align ? {align: options.align} : undefined);
    };
    const rule = (y, width = 1) => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(width);
      doc.line(144, y, 468, y);
    };

    doc.addImage(APPLE_RECEIPT_LOGO, 'JPEG', 140, 76, 24, 24);
    text(page.emisor.nombre, 144, 109);
    text(page.emisor.direccion, 144, 120);
    text(page.emisor.ciudad, 144, 131);
    text(page.emisor.email, 144, 141);
    text(page.emisor.telefono, 144, 150);
    text(page.emisor.sitioWeb, 144, 160);

    rule(178.54);
    text(page.headerDate, 144, 192);
    rule(213.84);
    text(page.productName, 144, 227, {bold: true});
    text(money(page.subtotal), 468, 227, {bold: true, align: 'right'});
    text(`Part Number: ${page.partNumber}`, 144, 241);
    text(`Serial Number: ${page.serial}`, 144, 252);
    text(`IMEI: ${page.imei1}`, 144, 263);
    text(`IMEI2: ${page.imei2}`, 144, 274);
    text(`Return Date: ${page.returnDateText}`, 144, 284);
    text('ForSupport, Visit:www.apple.com/support', 144, 296);

    rule(323.27);
    text('Sub-Total', 354.6, 345, {align: 'right'});
    text(money(page.subtotal), 468, 345, {align: 'right'});
    text('Tax', 354.6, 360, {align: 'right'});
    text(money(page.tax), 468, 360, {align: 'right'});
    text('Total', 354.6, 375, {bold: true, align: 'right'});
    text(money(page.total), 468, 375, {bold: true, align: 'right'});
    text('Payment Method', 354.6, 394, {bold: true, align: 'right'});
    text(`Amount Paid Via ${page.emisor.metodoPago}`, 354.6, 414, {align: 'right'});
    text(money(page.total), 468, 414, {align: 'right'});
    text(`•••• ${page.cardLast4}`, 354.6, 425, {align: 'right'});
    text(page.emisor.codigoTerminal, 354.6, 436, {align: 'right'});

    rule(482.78, 2);
    drawBarcode(doc, JsBarcode, page.reference, pageW);
    text(`* ${page.reference.barcode.split('').join(' ')} *`, pageW / 2, 525, {size: 6, align: 'center'});

    rule(560.76, 2);
    text(`Please debit my account •••• ${page.cardLast4} by ${money(page.total)} (Sale)`, 144, 587);
    text(`Card Number: •••• ${page.cardLast4}`, 144, 598);
    text(`Date/Time: ${page.transactionDate}`, 144, 609);
    text(`Application ID: ${page.emisor.applicationId}`, 144, 620);
    text(`Application PAN Sequence Number: ${page.emisor.applicationPanSequence}`, 144, 631);
    text(`Device Id: ${page.emisor.deviceId}`, 144, 643);
    text(`Card Type: ${page.emisor.cardType}`, 144, 654);
    text(`TVR: ${page.emisor.tvr}`, 144, 665);
    text(`TSI: ${page.emisor.tsi}`, 144, 676);
    text('No CVM', 144, 687);

    rule(709.66);
    text(page.emisor.policyUrl, pageW / 2, 731, {align: 'center'});
    text(page.emisor.supportMessage, pageW / 2, 742, {align: 'center'});
    rule(751.66);
  });
  return pages;
}
