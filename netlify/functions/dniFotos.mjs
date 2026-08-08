import admin from 'firebase-admin';
import {fetchWithTimeout, handlePost, valueOrEmpty} from './_shared.mjs';
import {parseDniPayload} from './_validators.mjs';
import {getAdminDb} from './_firebaseAdmin.mjs';
import {deleteStorageFiles, getPrivateDownloadUrl, uploadImageDataUri} from './_storage.mjs';
import {queueAuditEvent} from './_observability.mjs';

export const DNI_PHOTO_TYPES = {
  azul: {
    label: 'DNI azul',
    url: 'https://api-codart.cgrt.org/api/v1/consultas/fd/dniv',
  },
  electronico: {
    label: 'DNI electronico',
    url: 'https://api-codart.cgrt.org/api/v1/consultas/fd/dnivel',
  },
};
const APP_ID = 'comunicate-pos';
const SCOPE = 'shared';
const HISTORY_LIMIT = 30;
const SUCCESS_COUNTER_ID = 'dniFotosStats';
const IMAGE_DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;

function getCodartToken() {
  const token = process.env.CODART_TOKEN || process.env.RENIEC_TOKEN;
  if (!token) throw Object.assign(new Error('CODART_TOKEN_MISSING'), {status: 500});
  return token;
}

function baseRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(SCOPE);
}

function historyRef(db) {
  return baseRef(db).collection('dniFotosConsultas');
}

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function cleanHistoryId(value) {
  const id = cleanText(value, 180);
  return /^[A-Za-z0-9_-]{8,180}$/.test(id) ? id : '';
}

export function parseDniPhotoPayload(body) {
  const {dni} = parseDniPayload(body);
  const tipo = String(body?.tipo || 'azul').trim().toLowerCase();
  if (!/^\d{8}$/.test(dni)) {
    throw Object.assign(new Error('DNI_INVALIDO'), {status: 400});
  }
  if (!DNI_PHOTO_TYPES[tipo]) {
    throw Object.assign(new Error('DNI_FOTO_TIPO_INVALIDO'), {status: 400});
  }
  return {dni, tipo};
}

function parseDniPhotoAction(body) {
  const action = String(body?.action || 'consult').trim().toLowerCase();
  if (!['consult', 'list', 'get', 'delete'].includes(action)) {
    throw Object.assign(new Error('ACTION_INVALIDA'), {status: 400});
  }
  return action;
}

function parseImageDataUri(dataUri) {
  const match = String(dataUri || '').trim().match(IMAGE_DATA_URI_RE);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase(),
    base64: match[2],
    dataUri: `data:${match[1].toLowerCase()};base64,${match[2]}`,
  };
}

function normalizeImage(image, index) {
  const dataUri = String(image?.data_uri || image?.dataUri || '').trim();
  const parsed = parseImageDataUri(dataUri);
  if (!parsed) return null;
  return {
    side: index === 0 ? 'front' : index === 1 ? 'back' : `image_${index + 1}`,
    mime: parsed.mime,
    dataUri: parsed.dataUri,
  };
}

export function normalizeDniPhotosResponse(data, dni, tipo = 'azul') {
  const result = data?.data || data?.result || data || {};
  const images = (Array.isArray(result.images) ? result.images : [])
    .map(normalizeImage)
    .filter(Boolean)
    .slice(0, 2);

  return {
    success: Boolean((data?.success ?? true) && images.length),
    source: data?.source || 'CODART_X_API_V1',
    data: {
      tipo,
      tipoLabel: DNI_PHOTO_TYPES[tipo]?.label || 'DNI',
      images,
      dni: valueOrEmpty(result.dni || dni),
      nombres: valueOrEmpty(result.nombres),
      apellidos: valueOrEmpty(result.apellidos),
      genero: valueOrEmpty(result.genero),
      edad: valueOrEmpty(result.edad),
    },
  };
}

function toIsoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return '';
}

function publicResult(result = {}, includeImages = false, includeStoragePath = false) {
  const images = Array.isArray(result.images)
    ? result.images.map(image => ({
      side: cleanText(image?.side, 40),
      mime: cleanText(image?.mime, 40),
      ...(includeImages && image?.dataUri ? {dataUri: image.dataUri} : {}),
      ...(includeStoragePath && image?.storagePath ? {storagePath: cleanText(image.storagePath, 300)} : {}),
    })).filter(image => image.side)
    : [];

  return {
    dni: cleanText(result.dni, 8),
    nombres: cleanText(result.nombres, 160),
    apellidos: cleanText(result.apellidos, 160),
    genero: cleanText(result.genero, 40),
    edad: cleanText(result.edad, 12),
    tipo: DNI_PHOTO_TYPES[result.tipo] ? result.tipo : 'azul',
    tipoLabel: cleanText(result.tipoLabel, 40) || DNI_PHOTO_TYPES[result.tipo]?.label || 'DNI azul',
    images,
  };
}

function publicEntry(id, data = {}, includeImages = false, includeStoragePath = false) {
  return {
    id,
    createdAt: toIsoDate(data.createdAt) || cleanText(data.createdAtIso, 40),
    status: data.status === 'success' ? 'success' : 'failed',
    dni: cleanText(data.dni, 8),
    tipo: DNI_PHOTO_TYPES[data.tipo] ? data.tipo : 'azul',
    tipoLabel: cleanText(data.tipoLabel, 40) || DNI_PHOTO_TYPES[data.tipo]?.label || 'DNI azul',
    message: cleanText(data.message, 300),
    hasImages: Boolean(data.hasImages),
    imageCount: Number(data.imageCount || 0),
    result: data.result ? publicResult(data.result, includeImages, includeStoragePath) : null,
  };
}

function buildStoredResult(normalized) {
  const data = normalized?.data || {};
  return publicResult({
    ...data,
    images: (Array.isArray(data.images) ? data.images : []).map(image => ({
      side: image.side,
      mime: image.mime,
      dataUri: image.dataUri,
    })),
  }, true);
}

async function hydrateEntryImages(docRef, entry) {
  if (!entry?.result?.images?.length) return entry;

  const storageImages = await Promise.all(entry.result.images.map(async image => {
    if (!image.storagePath) return image;
    const dataUri = await getPrivateDownloadUrl(image.storagePath);
    return dataUri ? {...image, dataUri} : image;
  }));
  const needsLegacyChunks = storageImages.some(image => !image.dataUri && !image.storagePath);
  if (!needsLegacyChunks) {
    return {...entry, result: {...entry.result, images: storageImages}};
  }

  const snap = await docRef.collection('imageChunks').get();
  const chunksBySide = {};
  snap.docs.forEach(doc => {
    const data = doc.data() || {};
    const side = cleanText(data.side, 40);
    if (!side) return;
    chunksBySide[side] ||= [];
    chunksBySide[side].push({
      index: Number(data.index || 0),
      mime: cleanText(data.mime, 40),
      chunk: String(data.chunk || ''),
    });
  });

  return {
    ...entry,
    result: {
      ...entry.result,
      images: storageImages.map(image => {
        const chunks = (chunksBySide[image.side] || []).sort((a, b) => a.index - b.index);
        if (!chunks.length) return image;
        const mime = chunks[0]?.mime || image.mime || 'image/jpeg';
        return {
          ...image,
          mime,
          dataUri: `data:${mime};base64,${chunks.map(item => item.chunk).join('')}`,
        };
      }),
    },
  };
}

async function countSuccessEntries(db) {
  const counterRef = baseRef(db).collection('configuracion').doc(SUCCESS_COUNTER_ID);
  const counterSnapshot = await counterRef.get();
  if (counterSnapshot.exists) return Math.max(0, Number(counterSnapshot.data()?.successCount || 0));

  // One-time migration for historical records. Future requests use only this counter document.
  const legacySnapshot = await historyRef(db).where('status', '==', 'success').get();
  const successCount = legacySnapshot.size;
  try {
    await counterRef.create({
      successCount,
      migratedAt: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (error?.code !== 6 && error?.code !== 'already-exists') throw error;
  }
  const finalSnapshot = await counterRef.get();
  return Math.max(0, Number(finalSnapshot.data()?.successCount ?? successCount));
}

async function uploadDniImages(images, historyId) {
  const uploadedPaths = [];
  const storedImages = [];
  try {
    for (const [index, image] of (images || []).slice(0, 2).entries()) {
      const uploaded = await uploadImageDataUri({
        dataUri: image.dataUri,
        folder: 'dni-fotos',
        id: historyId,
        key: image.side || `image_${index + 1}`,
        metadata: {historyId, side: image.side || `image_${index + 1}`},
      });
      uploadedPaths.push(uploaded.storagePath);
      storedImages.push({
        side: cleanText(image.side, 40) || `image_${index + 1}`,
        mime: uploaded.mimeType,
        storagePath: uploaded.storagePath,
        order: index,
      });
    }
    return {storedImages, uploadedPaths};
  } catch (error) {
    await deleteStorageFiles(uploadedPaths);
    throw error;
  }
}

async function saveHistoryEntry(db, payload, user, context) {
  const docRef = historyRef(db).doc();
  const batch = db.batch();
  const createdAtIso = new Date().toISOString();
  const status = payload.status === 'success' ? 'success' : 'failed';
  const tipo = DNI_PHOTO_TYPES[payload.tipo] ? payload.tipo : 'azul';
  const result = payload.result ? publicResult(payload.result, true) : null;
  const {storedImages: imageMetas, uploadedPaths} = status === 'success' && result?.images?.length
    ? await uploadDniImages(result.images, docRef.id)
    : {storedImages: [], uploadedPaths: []};
  const storedResult = result ? publicResult({...result, images: imageMetas}, false, true) : null;
  const data = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso,
    status,
    dni: cleanText(payload.dni, 8),
    tipo,
    tipoLabel: DNI_PHOTO_TYPES[tipo].label,
    message: cleanText(payload.message, 300),
    hasImages: imageMetas.length > 0,
    imageCount: imageMetas.length,
    result: storedResult,
    actorUid: cleanText(user?.uid, 160),
    actorEmail: cleanText(user?.email, 200),
  };

  try {
    await countSuccessEntries(db);
    batch.set(docRef, data);
    if (status === 'success') {
      batch.set(baseRef(db).collection('configuracion').doc(SUCCESS_COUNTER_ID), {
        successCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    queueAuditEvent(batch, baseRef(db), context, {
      entityType: 'dniFotoConsulta',
      entityId: docRef.id,
      action: status,
      metadata: {
        dni: data.dni,
        tipo,
        imageCount: data.imageCount,
      },
    });
    await batch.commit();
  } catch (error) {
    await deleteStorageFiles(uploadedPaths);
    throw error;
  }

  const entry = publicEntry(docRef.id, {...data, createdAt: createdAtIso}, false, true);
  return {
    ...entry,
    result: (await hydrateEntryImages(docRef, entry)).result,
  };
}

async function fetchDniFotos(dni, tipo) {
  const config = DNI_PHOTO_TYPES[tipo];

  const response = await fetchWithTimeout(`${config.url}/${dni}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getCodartToken()}`,
    },
  }, Number(process.env.CODART_TIMEOUT_MS || 10 * 1000));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || data.message || 'DNI_FOTOS_UPSTREAM_ERROR'), {
      status: response.status,
    });
  }

  return normalizeDniPhotosResponse(data, dni, tipo);
}

async function consultarDniFotos(body, user, context, db) {
  const {dni, tipo} = parseDniPhotoPayload(body);

  let normalized;
  try {
    normalized = await fetchDniFotos(dni, tipo);
  } catch (error) {
    await saveHistoryEntry(db, {
      status: 'failed',
      dni,
      tipo,
      message: error.message || 'DNI_FOTOS_UPSTREAM_ERROR',
      result: null,
    }, user, context).catch(saveError => {
      console.error('dniFotos history failure save error:', saveError);
    });
    throw error;
  }

  const result = buildStoredResult(normalized);
  const status = normalized.success && result.images.length ? 'success' : 'failed';
  const message = status === 'success' ? '' : `No se encontraron imagenes de ${DNI_PHOTO_TYPES[tipo].label}`;
  const historyEntry = await saveHistoryEntry(db, {
    status,
    dni,
    tipo,
    message,
    result,
  }, user, context);

  return {
    ...normalized,
    historyEntry,
    successCount: await countSuccessEntries(db),
  };
}

async function listHistory(db) {
  const snap = await historyRef(db)
    .orderBy('createdAt', 'desc')
    .limit(HISTORY_LIMIT)
    .get();

  return {
    entries: snap.docs.map(doc => publicEntry(doc.id, doc.data() || {}, false)),
    successCount: await countSuccessEntries(db),
  };
}

async function getHistoryEntry(db, body) {
  const id = cleanHistoryId(body?.id);
  if (!id) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});

  const docRef = historyRef(db).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw Object.assign(new Error('DNI_FOTO_HISTORIAL_NO_ENCONTRADO'), {status: 404});

  const entry = publicEntry(snap.id, snap.data() || {}, false, true);
  return {entry: await hydrateEntryImages(docRef, entry)};
}

async function deleteHistoryEntry(db, body) {
  const id = cleanHistoryId(body?.id);
  if (!id) throw Object.assign(new Error('ID_INVALIDO'), {status: 400});

  const docRef = historyRef(db).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return {deleted: true, id, successCount: await countSuccessEntries(db)};

  const data = snap.data() || {};
  if (data.status === 'success') {
    throw Object.assign(new Error('DNI_FOTO_SUCCESS_PROTEGIDA'), {status: 409});
  }

  await docRef.delete();
  return {deleted: true, id, successCount: await countSuccessEntries(db)};
}

async function dispatchDniFotos(body, user, context) {
  const db = getAdminDb();
  const action = parseDniPhotoAction(body);
  if (action === 'consult') return consultarDniFotos(body, user, context, db);
  if (action === 'list') return listHistory(db);
  if (action === 'get') return getHistoryEntry(db, body);
  return deleteHistoryEntry(db, body);
}

export const handler = event => handlePost(event, dispatchDniFotos, {
  rateLimit: {name: 'dniFotos', max: 20, windowMs: 60 * 1000, distributed: true},
});
