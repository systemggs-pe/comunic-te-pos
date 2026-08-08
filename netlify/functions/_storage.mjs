import {randomUUID} from 'node:crypto';
import {getAdminStorageBucket} from './_firebaseAdmin.mjs';

const DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;
const DEFAULT_SIGNED_URL_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function cleanSegment(value, fallback = 'file') {
  const clean = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
  return clean || fallback;
}

export function parseImageDataUri(dataUri, maxBytes = MAX_IMAGE_BYTES) {
  const match = String(dataUri || '').trim().match(DATA_URI_RE);
  if (!match) throw Object.assign(new Error('EVIDENCIA_FORMATO_INVALIDO'), {status: 400});
  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw Object.assign(new Error('EVIDENCIA_VACIA'), {status: 400});
  if (buffer.length > maxBytes) throw Object.assign(new Error('EVIDENCIA_MUY_GRANDE'), {status: 413});
  return {mimeType, buffer, size: buffer.length};
}

export async function uploadImageDataUri({dataUri, folder, id, key, metadata = {}}) {
  const parsed = parseImageDataUri(dataUri);
  const extension = parsed.mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${cleanSegment(folder, 'evidencias')}/${cleanSegment(id)}/${cleanSegment(key)}-${randomUUID()}.${extension}`;
  const file = getAdminStorageBucket().file(storagePath);
  await file.save(parsed.buffer, {
    resumable: false,
    validation: 'md5',
    metadata: {
      contentType: parsed.mimeType,
      cacheControl: 'private, max-age=0, no-store',
      metadata: Object.fromEntries(Object.entries(metadata).map(([name, value]) => [name, String(value).slice(0, 200)])),
    },
  });
  return {storagePath, mimeType: parsed.mimeType, size: parsed.size};
}

export async function getPrivateDownloadUrl(storagePath, ttlMs = DEFAULT_SIGNED_URL_TTL_MS) {
  const path = String(storagePath || '').trim();
  if (!path || path.includes('..') || path.startsWith('/')) return '';
  const [url] = await getAdminStorageBucket().file(path).getSignedUrl({
    action: 'read',
    version: 'v4',
    expires: Date.now() + Math.max(60_000, Number(ttlMs) || DEFAULT_SIGNED_URL_TTL_MS),
  });
  return url;
}

export async function deleteStorageFile(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path || path.includes('..') || path.startsWith('/')) return;
  await getAdminStorageBucket().file(path).delete({ignoreNotFound: true});
}

export async function deleteStorageFiles(paths = []) {
  await Promise.all(paths.filter(Boolean).map(path => deleteStorageFile(path).catch(() => undefined)));
}
