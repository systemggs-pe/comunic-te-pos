import {luhn} from '../../utils/imei.js';

export const PUBLIC_SOLICITUD_INITIAL = {
  nombres: '',
  celular: '',
  correo: '',
  direccion: '',
  provincia: '',
  imei1: '',
  imei2: '',
  imeiRegistrado: '',
  imeiRegistradoBloqueado: false,
  nombreEquipo: '',
  marca: '',
  modelo: '',
  ram: '',
  memoria: '',
  color: '',
  precioCompra: '',
  fechaCompra: '',
  tieneCaja: 'NO',
};

const TEXT_FIELDS = new Set(['nombres', 'direccion', 'provincia', 'nombreEquipo', 'marca', 'modelo', 'ram', 'memoria', 'color']);
const DIGIT_FIELDS = new Set(['celular', 'imei1', 'imei2', 'imeiRegistrado']);

export function sanitizePublicSolicitudField(name, value) {
  const text = String(value ?? '');
  if (DIGIT_FIELDS.has(name)) return text.replace(/\D/g, '').slice(0, name === 'celular' ? 9 : 15);
  if (TEXT_FIELDS.has(name)) return text.toUpperCase();
  if (name === 'precioCompra') return text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 20);
  return text;
}

export function validatePublicSolicitudForm(form) {
  if (!form.nombres.trim()) return 'Completa tus nombres y apellidos';
  if (!/^9\d{8}$/.test(form.celular)) return 'El celular debe tener 9 digitos y empezar con 9';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) return 'Ingresa un correo valido';
  if (!form.direccion.trim()) return 'Completa tu direccion';
  if (!form.provincia.trim()) return 'Completa tu provincia';
  if (!luhn(form.imei1)) return 'El IMEI 1 no es valido';
  if (form.imei2 && !luhn(form.imei2)) return 'El IMEI 2 no es valido';
  if (form.imei2 && form.imei1 === form.imei2) return 'Los dos IMEI deben ser diferentes';
  if (!form.imeiRegistrado) return 'Elige que IMEI quieres registrar';
  if (![form.imei1, form.imei2].filter(Boolean).includes(form.imeiRegistrado)) return 'El IMEI elegido debe ser el IMEI 1 o el IMEI 2';
  if (form.imeiRegistradoBloqueado) return 'El IMEI elegido ya esta registrado; elige otro IMEI';
  if (!form.nombreEquipo.trim()) return 'Completa el nombre del equipo';
  if (!form.marca.trim()) return 'Completa la marca';
  if (!form.ram.trim()) return 'Completa la memoria RAM';
  if (!form.memoria.trim()) return 'Completa la memoria interna';
  if (!form.color.trim()) return 'Completa el color';
  if (!['SI', 'NO'].includes(form.tieneCaja)) return 'Indica si el equipo tiene caja';
  if (!/^\d+(\.\d{1,2})?$/.test(form.precioCompra) || Number(form.precioCompra) <= 0) return 'Ingresa un precio aproximado de compra valido';
  if (!form.fechaCompra || Number.isNaN(Date.parse(form.fechaCompra))) return 'Ingresa la fecha aproximada de compra';
  return null;
}
