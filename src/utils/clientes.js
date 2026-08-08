export function normalizeDni(value) {
  return String(value ?? '').trim();
}

export function normalizeCliente(cliente = {}, fallbackId = '') {
  return {
    ...cliente,
    dni: normalizeDni(cliente.dni || fallbackId),
  };
}

export function mapClienteDocument(documento) {
  return normalizeCliente({id: documento.id, ...documento.data()}, documento.id);
}

export function indexClientesByDni(clientes = []) {
  const index = new Map();
  clientes.forEach(cliente => {
    const normalized = normalizeCliente(cliente, cliente?.id);
    if (normalized.dni) index.set(normalized.dni, normalized);
  });
  return index;
}
