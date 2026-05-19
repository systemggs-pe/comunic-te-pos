/* eslint-disable no-unused-vars, no-empty */
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
  // mmW comes from parameter (58 or 80)
  const M   = 2;    // margen lateral mínimo
  const F   = 'courier';

  // Código de barras = número de serie (SN)
  const cbVal = data.sn || data.imeiEquipo || '';
  let barcodeImg = null, barcodeH = 0;
  if (cbVal) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, cbVal, {
        format: 'CODE128', width: 2.2, height: 60,
        displayValue: true, fontSize: 16, margin: 5
      });
      barcodeImg = c.toDataURL('image/png');
      barcodeH   = (mmW - M*2) * (c.height / c.width);
    } catch(_) {}
  }

  const render = (doc, draw) => {
    const cx  = mmW / 2;
    const pad = n => String(n).padStart(2,'0');
    const dt  = new Date(data.fecha);
    const fechaStr = `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}`;
    const horaStr  = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const itemsAdicionales = normalizarItems(data);
    const totalItems = itemsAdicionales.reduce((total, item) => total + (item.cantidad * item.precio), 0);
    const totalVenta = Number(data.precio || 0);
    const precioEquipo = Number(data.precioEquipo || (totalItems ? Math.max(totalVenta - totalItems, 0) : totalVenta));
    const totalTicket = Number(data.precio || (precioEquipo + totalItems));

    let y = 5;

    // Tamaños optimizados para impresora térmica 58mm — legibles
    const SZ = { xs:7.5, sm:8.5, md:9.5, lg:11.5, xl:14 };
    const LH = { xs:4.0, sm:4.6, md:5.2, lg:6.0, xl:7.2 };

    // Medir cuántos chars entran en el ancho útil
    doc.setFont(F, 'normal');
    doc.setFontSize(SZ.xs);
    const charW = doc.getTextWidth('A');
    const totalCols = Math.floor((mmW - M*2) / charW);

    const line = (text, sz, bold=false) => {
      if (draw) {
        doc.setFont(F, bold ? 'bold' : 'normal');
        doc.setFontSize(sz);
        doc.text(String(text??''), cx, y, { align:'center' });
      }
      y += LH[Object.keys(SZ).find(k => SZ[k]===sz)] ?? 5;
    };

    // Separador — solo guiones, tamaño md para que se vean más grandes y menos densos
    const rule = () => {
      doc.setFont(F, 'normal');
      doc.setFontSize(SZ.md);
      const cw = doc.getTextWidth('-');
      const n  = Math.floor((mmW - M*2) / cw);
      if (draw) doc.text('-'.repeat(n), M, y);
      y += LH.md;
    };

    const row = (left, right, sz=SZ.sm, bold=false) => {
      if (draw) {
        doc.setFont(F, bold ? 'bold' : 'normal');
        doc.setFontSize(sz);
        doc.text(String(left??''), M, y);
        doc.text(String(right??''), mmW-M, y, { align:'right' });
      }
      y += LH[Object.keys(SZ).find(k=>SZ[k]===sz)] ?? 5;
    };

    const wrap = (label, value, sz=SZ.sm) => {
      if (!value) return;
      doc.setFont(F, 'normal');
      doc.setFontSize(sz);
      const lw    = doc.getTextWidth(label);
      const lines = doc.splitTextToSize(String(value), mmW - M - lw - 1);
      if (draw) {
        doc.setFont(F, 'bold');   doc.text(label, M, y);
        doc.setFont(F, 'normal'); doc.text(lines, M + lw, y);
      }
      y += (LH[Object.keys(SZ).find(k=>SZ[k]===sz)] ?? 5) * lines.length;
    };

    // ── LOGO (si está configurado) ──
    if (logoVentas) {
      const logoMaxW = mmW - M * 2;
      const logoH = 18; // alto fijo en mm
      const logoX = M;
      if (draw) doc.addImage(logoVentas, 'PNG', logoX, y, logoMaxW, logoH, undefined, 'FAST');
      y += logoH + 3;
      rule();
    }

    // ── ENCABEZADO ──
    line('COMUNIC@TE', SZ.xl + 3);
    line('RECIBO DE VENTA', SZ.md);
    line(data.nVenta || '', SZ.sm);
    rule();
    line('VENTA DE CELULARES Y ACCESORIOS', SZ.xs);
    line('Av. Patricio Melendez 234', SZ.xs);
    line('Galerias Gamarra Int. 1B - Tacna', SZ.xs);
    line('Tel. 052 607 065', SZ.xs);
    rule();

    // ── CLIENTE ──
    wrap('Nombre: ', data.nombreCliente || '');
    wrap(`${data.tipoDocumentoCliente || 'DNI'}:    `, data.dniCliente || '');
    rule();

    // ── EQUIPO ──
    wrap('Marca:   ', data.marcaEquipo || '');
    wrap('Modelo:  ', data.nombreComercial || data.modeloEquipo || '');
    if (data.color)   wrap('Color:   ', data.color);
    if (data.ram)     wrap('RAM:     ', data.ram + ' GB');
    if (data.memoria) wrap('Memoria: ', data.memoria + ' GB');
    rule();
    wrap('IMEI 1:  ', data.imeiEquipo || '');
    if (data.imei2Equipo) wrap('IMEI 2:  ', data.imei2Equipo);
    if (data.sn)          wrap('S/N:     ', data.sn);
    rule();

    // ── PAGO ──
    wrap('Pago:    ', String(data.medioPago || 'EFECTIVO').replace('_', ' '));
    rule();
    row('Equipo:', `S/. ${precioEquipo.toFixed(2)}`, SZ.sm);
    itemsAdicionales.forEach(item => {
      const subtotal = item.cantidad * item.precio;
      const maxLabel = mmW <= 58 ? 17 : 28;
      row(recortar(`${item.cantidad}x ${item.nombre}`, maxLabel), `S/. ${subtotal.toFixed(2)}`, SZ.xs);
    });
    rule();
    row('TOTAL:   ', `S/. ${totalTicket.toFixed(2)}`, SZ.lg);
    rule();
    y += 2;

    // ── CÓDIGO DE BARRAS (S/N) ──
    if (barcodeImg) {
      if (draw) doc.addImage(barcodeImg, 'PNG', M, y, mmW - M*2, barcodeH);
      y += barcodeH + 2;
    }
    rule();
    row('Fecha:', fechaStr);
    row('Hora: ', horaStr);
    rule();

    // ── PIE ──
    line('No se aceptan cambios', SZ.xs);
    line('ni devoluciones.', SZ.xs);
    line('El cliente estuvo conforme', SZ.xs);
    line('con el producto adquirido.', SZ.xs);
    rule();
    line('Consultas solo con caja', SZ.xs);
    line('y recibo otorgado.', SZ.xs);
    y += 5;

    return y;
  };

  const docM = new jsPDF({ unit:'mm', format:[mmW,300], orientation:'portrait' });
  const alto = render(docM, false);
  const docF = new jsPDF({ unit:'mm', format:[mmW, alto], orientation:'portrait' });
  render(docF, true);

  const nombre = `VENTA-${data.nVenta||'ticket'}.pdf`;
  const blob = docF.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

