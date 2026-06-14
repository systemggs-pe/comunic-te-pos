/* eslint-disable no-empty */
import {getPdfTools} from '../../utils/pdfLibraries.js';

function normalizarItems(data) {
  const items = Array.isArray(data.itemsAdicionales) ? data.itemsAdicionales : [];
  return items
    .map(item => ({
      nombre: String(item.nombre || '').trim(),
      cantidad: Number(item.cantidad || 1),
      precio: Number(item.precio || 0),
    }))
    .filter(item => item.nombre && item.cantidad > 0 && item.precio > 0);
}

function recortar(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, Math.max(max - 3, 1))}...` : value;
}

export async function generarTicketVentaPDF(data, mmW = 58, logoVentas = null) {
  const {jsPDF, JsBarcode} = getPdfTools();
  const M = mmW <= 58 ? 3 : 5;
  const FONT = 'courier';
  const cbVal = data.sn || data.imeiEquipo || '';
  let barcodeImg = null;
  let barcodeH = 0;

  if (cbVal) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, cbVal, {
        format: 'CODE128',
        width: mmW <= 58 ? 2 : 2.4,
        height: mmW <= 58 ? 66 : 72,
        displayValue: true,
        fontSize: mmW <= 58 ? 18 : 20,
        margin: 5,
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH = (mmW - M * 2) * (c.height / c.width);
    } catch {}
  }

  const render = (doc, draw) => {
    const cx = mmW / 2;
    const pad = n => String(n).padStart(2, '0');
    const dt = new Date(data.fecha);
    const fechaStr = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
    const horaStr = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const itemsAdicionales = normalizarItems(data);
    const totalItems = itemsAdicionales.reduce((total, item) => total + (item.cantidad * item.precio), 0);
    const totalVenta = Number(data.precio || 0);
    const precioEquipo = Number(data.precioEquipo || (totalItems ? Math.max(totalVenta - totalItems, 0) : totalVenta));
    const totalTicket = Number(data.precio || (precioEquipo + totalItems));
    const SZ = mmW <= 58
      ? {xs: 7.2, sm: 8.0, md: 9.0, lg: 10.2, xl: 13.8}
      : {xs: 8.0, sm: 8.8, md: 9.8, lg: 11.2, xl: 15.0};
    const ink = 18;
    const muted = 88;
    const ruleColor = 176;
    const sectionFill = 244;
    const lh = size => size * 0.38 + 1.25;
    let y = 5;

    const text = (value, x, yy, size, opts = {}) => {
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opts.muted ? muted : ink);
      if (!draw) return;
      if (opts.align) doc.text(String(value ?? ''), x, yy, {align: opts.align});
      else doc.text(String(value ?? ''), x, yy);
    };

    const center = (value, size, opts = {}) => {
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(opts.muted ? muted : ink);
      const lines = doc.splitTextToSize(String(value ?? ''), mmW - M * 2);
      if (draw) lines.forEach((line, i) => doc.text(line, cx, y + i * lh(size), {align: 'center'}));
      y += lh(size) * Math.max(lines.length, 1);
    };

    const rule = (gap = 2.8) => {
      if (draw) {
        doc.setDrawColor(ruleColor);
        doc.setLineWidth(0.18);
        doc.line(M, y, mmW - M, y);
      }
      y += gap;
    };

    const section = title => {
      rule(2.2);
      if (draw) {
        doc.setFillColor(sectionFill);
        doc.rect(M, y - 1.2, mmW - M * 2, 5.6, 'F');
      }
      text(title, M + 1.4, y + 2.6, SZ.xs, {bold: true, muted: true});
      y += 6.9;
    };

    const row = (left, right, size = SZ.sm, opts = {}) => {
      text(left, M, y, size, {bold: opts.bold, muted: opts.muted});
      text(right, mmW - M, y, size, {align: 'right', bold: opts.bold});
      y += lh(size);
    };

    const wrap = (label, value, size = SZ.sm) => {
      if (!value) return;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(size);
      const labelWidth = doc.getTextWidth(label);
      const lines = doc.splitTextToSize(String(value), mmW - M * 2 - labelWidth - 1);
      if (draw) {
        doc.setTextColor(muted);
        doc.setFont(FONT, 'bold');
        doc.text(label, M, y);
        doc.setTextColor(ink);
        doc.setFont(FONT, 'normal');
        doc.text(lines, M + labelWidth, y);
      }
      y += lh(size) * Math.max(lines.length, 1);
    };

    const totalBand = (label, value) => {
      if (draw) {
        doc.setFillColor(235);
        doc.rect(M, y - 4.7, mmW - M * 2, 8.4, 'F');
      }
      text(label, M + 2, y, SZ.lg, {bold: true});
      text(value, mmW - M - 2, y, SZ.lg + 0.4, {align: 'right', bold: true});
      y += 9.2;
    };

    if (logoVentas) {
      const logoMaxW = mmW - M * 2;
      const logoH = mmW <= 58 ? 15 : 18;
      if (draw) doc.addImage(logoVentas, 'PNG', M, y, logoMaxW, logoH, undefined, 'FAST');
      y += logoH + 4;
    }

    center('COMUNIC@TE', SZ.xl, {bold: true});
    center('RECIBO DE VENTA', SZ.md, {bold: true});
    if (data.nVenta) center(data.nVenta, SZ.sm, {muted: true});
    y += 1;
    center('VENTA DE CELULARES Y ACCESORIOS', SZ.xs, {muted: true});
    center('Av. Patricio Melendez 234', SZ.xs, {muted: true});
    center('Galerias Gamarra Int. 1B, Tacna', SZ.xs, {muted: true});
    center('Tel. 052 607 065', SZ.xs, {muted: true});

    section('CLIENTE');
    wrap('Nombre: ', data.nombreCliente || '');
    wrap(`${data.tipoDocumentoCliente || 'DNI'}:    `, data.dniCliente || '');

    section('EQUIPO');
    wrap('Marca:   ', data.marcaEquipo || '');
    wrap('Modelo:  ', data.nombreComercial || data.modeloEquipo || '');
    if (data.color) wrap('Color:   ', data.color);
    if (data.ram) wrap('RAM:     ', data.ram + ' GB');
    if (data.memoria) wrap('Memoria: ', data.memoria + ' GB');
    wrap('IMEI 1:  ', data.imeiEquipo || '');
    if (data.imei2Equipo) wrap('IMEI 2:  ', data.imei2Equipo);
    if (data.sn) wrap('S/N:     ', data.sn);

    section('PAGO');
    wrap('Pago:    ', String(data.medioPago || 'EFECTIVO').replace('_', ' '));
    y += 1;
    row('Equipo', `S/. ${precioEquipo.toFixed(2)}`, SZ.sm);
    itemsAdicionales.forEach(item => {
      const subtotal = item.cantidad * item.precio;
      const maxLabel = mmW <= 58 ? 18 : 28;
      row(recortar(`${item.cantidad}x ${item.nombre}`, maxLabel), `S/. ${subtotal.toFixed(2)}`, SZ.xs, {muted: true});
    });
    rule();
    totalBand('TOTAL', `S/. ${totalTicket.toFixed(2)}`);
    y += 2;

    if (barcodeImg) {
      if (draw) doc.addImage(barcodeImg, 'PNG', M, y, mmW - M * 2, barcodeH);
      y += barcodeH + 2.5;
    }
    rule(3.4);
    row('Fecha', fechaStr, SZ.xs, {muted: true});
    row('Hora', horaStr, SZ.xs, {muted: true});

    rule(3.2);
    center('No se aceptan cambios ni devoluciones.', SZ.xs, {muted: true});
    center('El cliente estuvo conforme con el producto adquirido.', SZ.xs, {muted: true});
    center('Consultas solo con caja y recibo otorgado.', SZ.xs, {muted: true});
    y += 5;

    return y;
  };

  const docM = new jsPDF({unit: 'mm', format: [mmW, 300], orientation: 'portrait'});
  const alto = render(docM, false);
  const docF = new jsPDF({unit: 'mm', format: [mmW, alto], orientation: 'portrait'});
  render(docF, true);

  const nombre = `VENTA-${data.nVenta || 'ticket'}.pdf`;
  const blob = docF.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
