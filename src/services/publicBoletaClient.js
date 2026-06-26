const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

export async function consultarBoletaPublica(payload) {
  const resp = await fetch(`${BACKEND_BASE_URL}/api/publicBoleta`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  const requestId = resp.headers.get('x-request-id') || '';

  if (looksLikeHtml(text)) {
    const error = new Error('BACKEND_NOT_DEPLOYED');
    error.requestId = requestId;
    throw error;
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error('BACKEND_INVALID_RESPONSE');
    error.requestId = requestId;
    throw error;
  }

  if (!resp.ok) {
    const error = new Error(data.error || 'BACKEND_ERROR');
    error.status = resp.status;
    error.requestId = requestId || data.requestId || '';
    error.payload = data;
    throw error;
  }

  return data;
}
