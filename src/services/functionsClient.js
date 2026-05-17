import { auth } from '../lib/firebase.js';

const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

export async function llamarFuncionSegura(nombre, payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const resp = await fetch(`${BACKEND_BASE_URL}/api/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (resp.status === 404) {
    throw new Error('BACKEND_NOT_DEPLOYED');
  }

  if (looksLikeHtml(text)) {
    throw new Error('BACKEND_NOT_DEPLOYED');
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('BACKEND_INVALID_RESPONSE');
  }
  if (!resp.ok) {
    const error = new Error(data.error || 'BACKEND_ERROR');
    error.status = resp.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function consultarReniecDni(dni) {
  return llamarFuncionSegura('reniec', {dni: String(dni)});
}
