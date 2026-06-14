const LOCK_CONFIG = {
  registro: {
    ownerField: 'registroId',
    stateField: 'registrado',
    duplicateMessage: 'IMEI_YA_REGISTRADO',
  },
  venta: {
    ownerField: 'ventaId',
    stateField: 'vendido',
    duplicateMessage: 'IMEI_YA_VENDIDO',
  },
};

function getLockConfig(kind) {
  const config = LOCK_CONFIG[kind];
  if (!config) throw Object.assign(new Error('IMEI_LOCK_KIND_INVALIDO'), {status: 500});
  return config;
}

export function normalizeImeiList(values) {
  return [...new Set((values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

function duplicateError(kind, imei) {
  const config = getLockConfig(kind);
  return Object.assign(new Error(config.duplicateMessage), {
    status: 409,
    payload: {imei},
  });
}

export async function assertAndSetImeiLocks({transaction, locksRef, imeis, kind, ownerId, now = new Date().toISOString()}) {
  const result = await syncImeiLocks({
    transaction,
    locksRef,
    kind,
    ownerId,
    setImeis: imeis,
    now,
  });

  return result.setImeis;
}

export async function releaseImeiLocks({transaction, locksRef, imeis, kind, ownerId, keepImeis = [], now = new Date().toISOString()}) {
  const result = await syncImeiLocks({
    transaction,
    locksRef,
    kind,
    ownerId,
    releaseImeis: imeis,
    keepImeis,
    now,
  });

  return result.releasedImeis;
}

export async function syncImeiLocks({
  transaction,
  locksRef,
  kind,
  ownerId,
  setImeis = [],
  releaseImeis = [],
  keepImeis = [],
  now = new Date().toISOString(),
}) {
  const config = getLockConfig(kind);
  const cleanSetImeis = normalizeImeiList(setImeis);
  const keep = new Set([...cleanSetImeis, ...normalizeImeiList(keepImeis)]);
  const cleanReleaseImeis = normalizeImeiList(releaseImeis).filter(imei => !keep.has(imei));
  const owner = String(ownerId || '').trim();
  if (!owner) throw Object.assign(new Error('IMEI_LOCK_OWNER_INVALIDO'), {status: 500});

  const imeisToRead = normalizeImeiList([...cleanSetImeis, ...cleanReleaseImeis]);
  const refsByImei = new Map(imeisToRead.map(imei => [imei, locksRef.doc(imei)]));
  const snapEntries = await Promise.all(imeisToRead.map(async imei => [imei, await transaction.get(refsByImei.get(imei))]));
  const snapsByImei = new Map(snapEntries);

  cleanSetImeis.forEach(imei => {
    const snap = snapsByImei.get(imei);
    const currentOwner = String(snap.data()?.[config.ownerField] || '').trim();
    if (currentOwner && currentOwner !== owner) {
      throw duplicateError(kind, imei);
    }
  });

  cleanSetImeis.forEach(imei => {
    const ref = refsByImei.get(imei);
    transaction.set(ref, {
      imei,
      [config.ownerField]: owner,
      [config.stateField]: true,
      updatedAt: now,
    }, {merge: true});
  });

  cleanReleaseImeis.forEach(imei => {
    const snap = snapsByImei.get(imei);
    const currentOwner = String(snap.data()?.[config.ownerField] || '').trim();
    if (currentOwner !== owner) return;

    transaction.set(refsByImei.get(imei), {
      [config.ownerField]: '',
      [config.stateField]: false,
      updatedAt: now,
    }, {merge: true});
  });

  return {
    setImeis: cleanSetImeis,
    releasedImeis: cleanReleaseImeis,
  };
}
