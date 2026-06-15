import {handlePost, valueOrEmpty} from './_shared.mjs';
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
const IMAGE_DATA_URI_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;

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

function normalizeImage(image, index) {
  const dataUri = String(image?.data_uri || image?.dataUri || '').trim();
  if (!IMAGE_DATA_URI_RE.test(dataUri)) return null;
  return {
    side: index === 0 ? 'front' : index === 1 ? 'back' : `image_${index + 1}`,
    dataUri,
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

async function consultarDniFotos(body) {
  const {dni, tipo} = parseDniPhotoPayload(body);
  const config = DNI_PHOTO_TYPES[tipo];

  const response = await fetch(`${config.url}/${dni}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getCodartToken()}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || data.message || 'DNI_FOTOS_UPSTREAM_ERROR'), {
      status: response.status,
    });
  }

  return normalizeDniPhotosResponse(data, dni, tipo);
}

export const handler = event => handlePost(event, consultarDniFotos, {
  rateLimit: {name: 'dniFotos', max: 20, windowMs: 60 * 1000},
});
