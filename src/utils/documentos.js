export const TIPOS_DOCUMENTO = [
  {value: 'DNI', label: 'DNI'},
  {value: 'CE', label: 'CE'},
  {value: 'PASAPORTE', label: 'Pasaporte'},
  {value: 'RUC', label: 'RUC'},
];

export function limpiarDocumento(value, tipo = 'DNI') {
  const raw = String(value || '').trim().toUpperCase();
  if (tipo === 'DNI' || tipo === 'RUC') return raw.replace(/\D/g, '').slice(0, tipo === 'DNI' ? 8 : 11);
  return raw.replace(/[^A-Z0-9-]/g, '').slice(0, 15);
}

export function validarDocumento(tipo, numero) {
  const value = String(numero || '').trim().toUpperCase();
  if (tipo === 'DNI') return /^\d{8}$/.test(value);
  if (tipo === 'RUC') return /^\d{11}$/.test(value);
  if (tipo === 'CE') return /^[A-Z0-9-]{6,12}$/.test(value);
  if (tipo === 'PASAPORTE') return /^[A-Z0-9-]{6,15}$/.test(value);
  return false;
}

export function etiquetaDocumento(tipo = 'DNI') {
  return TIPOS_DOCUMENTO.find(item => item.value === tipo)?.label || 'Documento';
}

export function placeholderDocumento(tipo = 'DNI') {
  if (tipo === 'DNI') return '8 digitos';
  if (tipo === 'RUC') return '11 digitos';
  if (tipo === 'CE') return 'Carnet de extranjeria';
  return 'Pasaporte';
}
