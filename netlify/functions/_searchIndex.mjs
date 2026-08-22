const MIN_PREFIX_LENGTH = 3;
const MAX_PREFIX_LENGTH = 60;
const MAX_SEARCH_TERMS = 400;

export function normalizeIndexedTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function addPrefixes(target, value) {
  const normalized = normalizeIndexedTerm(value);
  if (!normalized) return;

  const candidates = new Set([normalized]);
  const words = normalized.split(/\s+/).filter(Boolean);
  words.forEach((word, index) => {
    candidates.add(words.slice(index).join(' '));
    word.split(/[^a-z0-9@._+-]+/).filter(Boolean).forEach(token => candidates.add(token));
  });

  for (const candidate of candidates) {
    const upperBound = Math.min(candidate.length, MAX_PREFIX_LENGTH);
    if (candidate.length < MIN_PREFIX_LENGTH) {
      target.add(candidate);
      continue;
    }
    for (let length = MIN_PREFIX_LENGTH; length <= upperBound; length += 1) {
      target.add(candidate.slice(0, length));
      if (target.size >= MAX_SEARCH_TERMS) return;
    }
  }
}

export function buildSearchTerms(values = []) {
  const terms = new Set();
  for (const value of values.flat(Infinity)) {
    addPrefixes(terms, value);
    if (terms.size >= MAX_SEARCH_TERMS) break;
  }
  return Array.from(terms).slice(0, MAX_SEARCH_TERMS);
}

export function buildClienteSearchTerms(cliente = {}) {
  return buildSearchTerms([
    cliente.dni,
    cliente.nombre,
    cliente.celular,
    cliente.celularRef,
    cliente.correo,
    cliente.celulares,
    cliente.correos,
  ]);
}

export function buildEquipoSearchTerms(equipo = {}, nombreCliente = '') {
  return buildSearchTerms([
    equipo.idEquipo,
    equipo.idDuenio,
    nombreCliente,
    equipo.imei2,
    equipo.sn,
    equipo.marca,
    equipo.modelo,
    equipo.nombreComercial,
  ]);
}

export function buildMovimientoSearchTerms(movimiento = {}, nombreCliente = '') {
  const items = Array.isArray(movimiento.itemsAdicionales)
    ? movimiento.itemsAdicionales.map(item => item?.nombre)
    : [];
  return buildSearchTerms([
    movimiento.dniCliente,
    nombreCliente || movimiento.nombreCliente,
    movimiento.celularCliente,
    movimiento.celularRef,
    movimiento.nVenta,
    movimiento.nRegistro,
    movimiento.imeiEquipo,
    movimiento.imeiRegistrado,
    movimiento.imei2Equipo,
    movimiento.sn,
    movimiento.marcaEquipo,
    movimiento.modeloEquipo,
    movimiento.nombreComercial,
    movimiento.nombreComercialEquipo,
    movimiento.estado,
    movimiento.estadoSolicitud,
    movimiento.operador,
    movimiento.tipo,
    items,
  ]);
}
