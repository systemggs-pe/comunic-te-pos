const unique = values => Array.from(new Set(
  values
    .map(value => String(value || '').trim())
    .filter(Boolean),
));

export function withContactHistory(existing = {}, incoming = {}, options = {}) {
  const preservePrimary = options.preservePrimary !== false;
  const celulares = unique([
    ...(Array.isArray(existing.celulares) ? existing.celulares : []),
    existing.celular,
    existing.celularRef,
    ...(Array.isArray(incoming.celulares) ? incoming.celulares : []),
    incoming.celular,
    incoming.celularRef,
  ]);
  const correos = unique([
    ...(Array.isArray(existing.correos) ? existing.correos : []),
    existing.correo,
    ...(Array.isArray(incoming.correos) ? incoming.correos : []),
    incoming.correo,
  ]).map(correo => correo.toLowerCase());

  return {
    ...existing,
    ...incoming,
    celular: preservePrimary ? (existing.celular || incoming.celular || celulares[0] || '') : (incoming.celular || celulares[0] || ''),
    celularRef: preservePrimary ? (existing.celularRef || incoming.celularRef || incoming.celular || celulares[0] || '') : (incoming.celularRef || incoming.celular || celulares[0] || ''),
    correo: preservePrimary ? (existing.correo || incoming.correo || correos[0] || '') : (incoming.correo || correos[0] || ''),
    celulares,
    correos,
  };
}

export async function setClienteWithHistory(transaction, clienteRef, cliente) {
  const snap = await transaction.get(clienteRef);
  const current = snap.exists ? snap.data() || {} : {};
  transaction.set(clienteRef, withContactHistory(current, cliente), {merge: true});
}
