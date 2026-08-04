import {handlePost, valueOrEmpty} from './_shared.mjs';
import {parseDniPayload} from './_validators.mjs';

const RENIEC_URL = 'https://api-codart.cgrt.org/api/v1/consultas/reniec/dni';

function normalizeReniecResponse(data, dni) {
  const result = data?.result || data?.data || data?.persona || data || {};
  const nombres = valueOrEmpty(result.nombres || result.first_name);
  const apellidoPaterno = valueOrEmpty(result.apellidoPaterno || result.apellido_paterno || result.first_last_name);
  const apellidoMaterno = valueOrEmpty(result.apellidoMaterno || result.apellido_materno || result.second_last_name);
  const fullName = valueOrEmpty(
    result.full_name ||
    result.nombreCompleto ||
    result.nombre_completo ||
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(' '),
  );

  return {
    success: Boolean(fullName),
    source: data?.source || 'RENIEC_NETLIFY',
    result: {
      document_number: valueOrEmpty(result.document_number || result.dni || dni),
      full_name: fullName,
    },
  };
}

export async function consultarReniecDniSeguro(dni) {
  if (!process.env.RENIEC_TOKEN) throw Object.assign(new Error('RENIEC_TOKEN_MISSING'), {status: 500});

  const response = await fetch(`${RENIEC_URL}/${dni}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RENIEC_TOKEN}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || data.message || 'RENIEC_UPSTREAM_ERROR'), {status: response.status});
  }
  const normalized = normalizeReniecResponse(data, dni);
  if (!normalized.success || !normalized.result.full_name) {
    throw Object.assign(new Error('RENIEC_PERSONA_NO_ENCONTRADA'), {status: 404});
  }
  return normalized;
}

async function consultarReniec(body) {
  const {dni} = parseDniPayload(body);
  return consultarReniecDniSeguro(dni);
}

export const __test = {normalizeReniecResponse};

export const handler = event => handlePost(event, consultarReniec, {
  rateLimit: {name: 'reniec', max: 60, windowMs: 60 * 1000},
});
