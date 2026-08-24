import {fetchWithTimeout, handlePost, valueOrEmpty} from './_shared.mjs';
import {parseDniPayload} from './_validators.mjs';

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

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const IMAGE_DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;

function getCodartToken() {
  const token = process.env.CODART_TOKEN || process.env.RENIEC_TOKEN;
  if (!token) throw Object.assign(new Error('CODART_TOKEN_MISSING'), {status: 500});
  return token;
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

function parseImageDataUri(dataUri) {
  const match = String(dataUri || '').trim().match(IMAGE_DATA_URI_RE);
  if (!match) return null;
  const size = Buffer.from(match[2], 'base64').length;
  if (!size || size > MAX_IMAGE_BYTES) return null;
  return {
    mime: match[1].toLowerCase(),
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
    source: String(data?.source || 'CODART_X_API_V1').slice(0, 80),
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
    const errorCode = response.status === 402
      ? 'CODART_CREDITOS_INSUFICIENTES'
      : [401, 403].includes(response.status)
        ? 'CODART_TOKEN_INVALID'
        : response.status === 429
          ? 'CODART_RATE_LIMIT'
          : 'DNI_FOTOS_UPSTREAM_ERROR';
    throw Object.assign(new Error(errorCode), {
      status: response.status === 429 ? 429 : 502,
      payload: {upstreamStatus: response.status},
    });
  }

  return normalizeDniPhotosResponse(data, dni, tipo);
}

async function dispatchDniFotos(body) {
  const {dni, tipo} = parseDniPhotoPayload(body);
  return fetchDniFotos(dni, tipo);
}

export const handler = async event => {
  const response = await handlePost(event, dispatchDniFotos, {
    rateLimit: {name: 'dniFotos', max: 5, windowMs: 60 * 1000, distributed: true},
  });
  return {
    ...response,
    headers: {...response.headers, 'Cache-Control': 'no-store'},
  };
};

export const __test = {
  dispatchDniFotos,
  fetchDniFotos,
};
