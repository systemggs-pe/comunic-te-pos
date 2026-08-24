const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const DEFAULT_DNI_DAYS = 90;
const DEFAULT_BATCH_SIZE = 100;

function positiveInt(value, fallback, max = 1000) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

export function getRetentionConfig(input = {}) {
  return {
    dniFotosDays: positiveInt(input.dniFotosDays ?? process.env.RETENTION_DNI_FOTOS_DAYS, DEFAULT_DNI_DAYS, 3650),
    batchSize: positiveInt(input.batchSize ?? process.env.RETENTION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 100),
  };
}

export function retentionCutoffIso(days, nowMs = Date.now()) {
  return new Date(nowMs - Number(days) * 24 * 60 * 60 * 1000).toISOString();
}

async function deleteBatch(db, refs) {
  for (let index = 0; index < refs.length; index += 400) {
    const batch = db.batch();
    refs.slice(index, index + 400).forEach(ref => batch.delete(ref));
    if (refs.length) await batch.commit();
  }
}

export async function purgeRetention(db, input = {}) {
  const config = getRetentionConfig(input);
  const nowMs = Number(input.nowMs || Date.now());
  const dniCutoff = retentionCutoffIso(config.dniFotosDays, nowMs);
  const base = baseRef(db);

  const dniPhotos = await base.collection('dniFotosConsultas')
    .where('createdAtIso', '<', dniCutoff)
    .limit(config.batchSize)
    .get();
  const chunkSnapshots = await Promise.all(dniPhotos.docs.map(doc => {
    const chunksRef = doc.ref.collection('imageChunks');
    return typeof chunksRef.select === 'function' ? chunksRef.select().get() : chunksRef.get();
  }));
  const dniRefs = dniPhotos.docs.flatMap((doc, index) => [
    ...chunkSnapshots[index].docs.map(chunk => chunk.ref),
    doc.ref,
  ]);
  await deleteBatch(db, dniRefs);

  return {
    ok: true,
    retention: {
      dniFotosDays: config.dniFotosDays,
      dniCutoff,
    },
    purgedDniFotos: dniPhotos.size,
    purgedImageChunks: dniRefs.length - dniPhotos.size,
    hasMore: dniPhotos.size >= config.batchSize,
  };
}

export const __test = {getRetentionConfig, retentionCutoffIso};
