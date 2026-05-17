import {handlePost, valueOrEmpty} from './_shared.mjs';

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
    success: Boolean(data?.success ?? fullName),
    source: data?.source || 'RENIEC_NETLIFY',
    result: {
      ...result,
      document_number: valueOrEmpty(result.document_number || result.dni || dni),
      first_name: nombres,
      first_last_name: apellidoPaterno,
      second_last_name: apellidoMaterno,
      full_name: fullName,
      address: valueOrEmpty(result.address || result.direccion),
      phone: valueOrEmpty(result.phone || result.telefono),
      email: valueOrEmpty(result.email || result.correo),
    },
  };
}

async function consultarReniec(body) {
  const dni = String(body?.dni || '').replace(/\D/g, '').slice(0, 8);
  if (dni.length !== 8) throw Object.assign(new Error('DNI invalido'), {status: 400});
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
  return normalizeReniecResponse(data, dni);
}

export const handler = event => handlePost(event, consultarReniec);
