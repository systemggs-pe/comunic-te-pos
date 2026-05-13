import { auth, firebaseConfig } from '../lib/firebase.js';

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL || `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

export async function llamarFuncionSegura(nombre, payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const resp = await fetch(`${FUNCTIONS_BASE_URL}/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error(resp.status === 404 ? 'RENIEC_FUNCTION_NOT_DEPLOYED' : data.error || 'FUNCTION_ERROR');
    error.status = resp.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function consultarReniecDni(dni) {
  if (import.meta.env.DEV) {
    return consultarReniecLocal(dni);
  }
  return llamarFuncionSegura('consultarReniec', { dni: String(dni) });
}

async function consultarReniecLocal(dni) {
  const resp = await fetch('/api/reniec', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ dni: String(dni) }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error(data.error || 'RENIEC_LOCAL_ERROR');
    error.status = resp.status;
    error.payload = data;
    throw error;
  }
  return data;
}

