export function normalizeSearchTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesNeedle(value, needle) {
  return normalizeSearchTerm(value).includes(needle);
}

function itemNames(items) {
  return Array.isArray(items) ? items.map(item => item?.nombre).filter(Boolean) : [];
}

export function registroMatchesSearch(registro, term, cliente = {}) {
  const needle = normalizeSearchTerm(term);
  if (!needle) return true;

  return [
    registro?.imeiEquipo,
    registro?.imeiRegistrado,
    registro?.imei2Equipo,
    registro?.dniCliente,
    registro?.nRegistro,
    registro?.marcaEquipo,
    registro?.modeloEquipo,
    registro?.nombreComercialEquipo,
    registro?.estado,
    registro?.operador,
    registro?.tipo,
    cliente?.nombre,
    cliente?.celular,
    cliente?.celularRef,
    cliente?.correo,
  ].some(value => includesNeedle(value, needle));
}

export function ventaMatchesSearch(venta, term, cliente = {}, equipo = {}) {
  const needle = normalizeSearchTerm(term);
  if (!needle) return true;

  return [
    venta?.imeiEquipo,
    venta?.imei2Equipo,
    equipo?.imei2,
    venta?.dniCliente,
    venta?.nVenta,
    venta?.marcaEquipo,
    venta?.modeloEquipo,
    venta?.nombreComercial,
    equipo?.nombreComercial,
    venta?.sn,
    equipo?.sn,
    venta?.color,
    venta?.medioPago,
    cliente?.nombre,
    cliente?.celular,
    cliente?.celularRef,
    cliente?.correo,
    ...itemNames(venta?.itemsAdicionales),
  ].some(value => includesNeedle(value, needle));
}
