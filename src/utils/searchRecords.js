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

export function registroMatchesStatus(registro, status = 'TODOS') {
  if (status === 'BLOQUEADOS') return registro?.estado === 'BLOQUEADO';
  if (registro?.estado !== 'NO BLOQUEADO') return status === 'TODOS';

  const estadoSolicitud = registro?.estadoSolicitud || 'PENDIENTE';
  if (status === 'REGISTRADOS') return estadoSolicitud === 'REALIZADO';
  if (status === 'PENDIENTES') return estadoSolicitud === 'PENDIENTE';
  return true;
}

export function registroMatchesSearch(registro, term, cliente = {}) {
  const needle = normalizeSearchTerm(term);
  if (!needle) return true;

  return [
    registro?.imeiEquipo,
    registro?.imeiRegistrado,
    registro?.imei2Equipo,
    registro?.dniCliente,
    registro?.celularCliente,
    registro?.celularRef,
    registro?.nRegistro,
    registro?.marcaEquipo,
    registro?.modeloEquipo,
    registro?.nombreComercialEquipo,
    registro?.estado,
    registro?.estado === 'NO BLOQUEADO' ? (registro?.estadoSolicitud || 'PENDIENTE') : '',
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
    venta?.celularCliente,
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
