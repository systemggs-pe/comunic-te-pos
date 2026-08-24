import {luhn} from '../../utils/imei.js';
import {validarDocumento} from '../../utils/documentos.js';

export const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export const PHONE_RE = /^9\d{8}$/;
export const SCAN_LOADING_INPUT_CLASS = 'bg-blue-50/70 placeholder:text-blue-700 placeholder:font-semibold';
export const REGISTRO_MARCAS = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI', 'OPPO', 'VIVO', 'TECNO', 'INFINIX', 'ZTE', 'MOTOROLA', 'PIXEL', 'HTC'];
export const APPLE_EVIDENCIA_ORDER = ['dniFrente', 'dniReverso', 'imeiLogico', 'cajaEquipo'];

export const clean = value => String(value || '').trim();

export function normalizarMarcaRegistro(value) {
  const marca = clean(value).toUpperCase();
  return REGISTRO_MARCAS.includes(marca) ? marca : '';
}

export function normalizarTieneCaja(value) {
  if (value === true || value === 'SI') return 'SI';
  if (value === false || value === 'NO') return 'NO';
  return '';
}

export function emptyComprobanteApple() {
  return {imei: '', status: 'idle', boleta: null};
}

export function uniqueClean(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

export function correosValidos(values) {
  return uniqueClean(values)
    .map(correo => correo.toLowerCase())
    .filter(correo => EMAIL_RE.test(correo));
}

export function opcionesContacto(cliente, campoPrincipal, campoLista) {
  return correosValidos([
    cliente?.[campoPrincipal],
    ...(Array.isArray(cliente?.[campoLista]) ? cliente[campoLista] : []),
  ]);
}

export function opcionesCelulares(cliente) {
  return uniqueClean([
    cliente?.celular,
    cliente?.celularRef,
    ...(Array.isArray(cliente?.celulares) ? cliente.celulares : []),
  ]);
}

export const debeSincronizarCelularRef = form => !form.celularRef || form.celularRef === form.celular;

export function toLocalDatetimeValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function createInitialRegistroForm() {
  return {
    tipoDocumento: 'DNI', dni: '', nombre: '', celular: '', celularRef: '', correo: '', direccion: '', departamento: '',
    imei1: '', imei: '', imei2: '', sn: '', marca: '', modelo: '', nombreComercial: '', color: '', memoria: '', ram: '',
    estado: 'NO BLOQUEADO', estadoSolicitud: 'PENDIENTE', operador: 'BITEL', tipo: 'TIENDA', tieneCaja: 'NO', precio: '0',
    fecha: toLocalDatetimeValue(new Date().toISOString()),
  };
}

export function validateCustomerStep(form, direccionFinalCliente) {
  if (!validarDocumento(form.tipoDocumento, clean(form.dni))) return 'DNI no valido';
  if (!clean(form.nombre)) return 'Completa el nombre del cliente';
  if (!PHONE_RE.test(clean(form.celular))) return 'El celular debe tener 9 digitos y empezar con 9';
  if (clean(form.celularRef) && !PHONE_RE.test(clean(form.celularRef))) return 'El celular de referencia debe tener 9 digitos y empezar con 9';
  if (!clean(form.direccion)) return 'La direccion es obligatoria';
  if (!clean(form.departamento)) return 'Selecciona el departamento';
  if (direccionFinalCliente.length > 300) return 'La direccion final no debe superar 300 caracteres';
  if (!EMAIL_RE.test(clean(form.correo))) return 'Ingresa un correo electronico valido';
  return null;
}

export function validateEquipmentStep(form, {esRegistroSimple, imeiYaRegistrado} = {}) {
  if (!luhn(clean(form.imei1))) return 'El IMEI 1 no es valido; verifica los digitos';
  if (esRegistroSimple && !clean(form.imei2)) return 'El IMEI 2 es obligatorio';
  if (clean(form.imei2) && !luhn(clean(form.imei2))) return 'El IMEI 2 no es valido; verifica los digitos';
  if (clean(form.imei1) && clean(form.imei1) === clean(form.imei2)) return 'El IMEI 1 y el IMEI 2 deben ser diferentes';
  if (![clean(form.imei1), clean(form.imei2)].includes(clean(form.imei))) return 'Selecciona el IMEI que se va a registrar';
  if (form.marca && !REGISTRO_MARCAS.includes(form.marca)) return 'Selecciona una marca de la lista';
  if (!clean(form.nombreComercial)) return 'El nombre comercial es obligatorio';
  if (imeiYaRegistrado?.(form.imei)) return `El IMEI ${form.imei} ya tiene un registro activo`;
  return null;
}

export function validateRegistroDraft(form, {
  direccionFinalCliente,
  esRegistroSimple,
  isEditing,
  imeiYaRegistrado,
  esApple,
  comprobanteAppleValido,
  permitePrecioCero,
} = {}) {
  const customerError = validateCustomerStep(form, direccionFinalCliente);
  if (customerError) return customerError;
  const equipmentError = validateEquipmentStep(form, {esRegistroSimple, imeiYaRegistrado: isEditing ? null : imeiYaRegistrado});
  if (equipmentError) return equipmentError;
  if (![clean(form.imei1), clean(form.imei2)].includes(clean(form.imei))) return 'Selecciona el IMEI que se va a registrar';
  if (esApple && !comprobanteAppleValido) return 'Primero verifica que el IMEI tenga una boleta extranjera';
  if (!normalizarTieneCaja(form.tieneCaja)) return 'Indica si el cliente tiene la caja del equipo';
  const precio = clean(form.precio);
  if (!MONEY_RE.test(precio) || Number(precio) < 0 || (!permitePrecioCero && Number(precio) === 0)) {
    return permitePrecioCero
      ? 'El precio debe ser 0 o mayor y tener maximo 2 decimales'
      : 'El precio debe ser mayor a 0 y tener maximo 2 decimales';
  }
  if (form.estado === 'BLOQUEADO' && Number(precio) < 50) return 'El precio minimo para un equipo BLOQUEADO es S/. 50.00';
  if (!form.fecha || Number.isNaN(new Date(form.fecha).getTime())) return 'La fecha no es valida';
  return null;
}
