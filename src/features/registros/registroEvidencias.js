export const REGISTRO_EVIDENCIA_FIELDS = [
  {key: 'dniFrente', label: 'DNI frontal', hint: 'Foto del lado frontal del documento'},
  {key: 'dniReverso', label: 'DNI reverso', hint: 'Foto del lado posterior del documento'},
  {key: 'cajaEquipo', label: 'Caja del equipo', hint: 'Foto visible de la caja del equipo', required: false},
  {key: 'boletaVenta', label: 'Boleta de venta', hint: 'Foto completa de la boleta'},
  {key: 'imeiLogico', label: 'IMEI logico', hint: 'Foto de pantalla donde se vea el IMEI'},
];

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIDE = 1400;
const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.72;

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), OUTPUT_TYPE, OUTPUT_QUALITY);
  });
}

async function crearRegistroEvidenciaDesdeDataUrl(dataUrl, name = 'evidencia.jpg', originalSize = 0) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  const compressedDataUrl = canvas.toDataURL(OUTPUT_TYPE, OUTPUT_QUALITY);
  return {
    dataUrl: compressedDataUrl,
    type: OUTPUT_TYPE,
    name,
    originalSize,
    size: blob?.size || Math.round(compressedDataUrl.length * 0.75),
    width,
    height,
  };
}

export function emptyRegistroEvidencias() {
  return REGISTRO_EVIDENCIA_FIELDS.reduce((acc, field) => {
    acc[field.key] = null;
    return acc;
  }, {});
}

export function missingRegistroEvidencias(evidencias) {
  return REGISTRO_EVIDENCIA_FIELDS.filter(field => field.required !== false && !evidencias?.[field.key]);
}

export async function comprimirRegistroEvidencia(file) {
  if (!file || !ACCEPTED_TYPES.has(file.type)) {
    throw new Error('FORMATO_IMAGEN_INVALIDO');
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  return crearRegistroEvidenciaDesdeDataUrl(originalDataUrl, file.name || 'evidencia.jpg', file.size || 0);
}

export async function leerRegistroEvidenciaFile(file) {
  if (!file || !ACCEPTED_TYPES.has(file.type)) {
    throw new Error('FORMATO_IMAGEN_INVALIDO');
  }
  return {
    dataUrl: await readFileAsDataUrl(file),
    name: file.name || 'evidencia.jpg',
    originalSize: file.size || 0,
  };
}

export async function comprimirRegistroEvidenciaDataUrl(dataUrl, name = 'evidencia.jpg', originalSize = 0) {
  if (!String(dataUrl || '').startsWith('data:image/')) {
    throw new Error('FORMATO_IMAGEN_INVALIDO');
  }
  return crearRegistroEvidenciaDesdeDataUrl(dataUrl, name, originalSize);
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}