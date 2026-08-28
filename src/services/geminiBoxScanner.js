const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 40000;

export function prepareGeminiBoxImage(source, createCanvas = () => document.createElement('canvas')) {
  if (!source?.width || !source?.height) throw new Error('IMAGEN_LOCAL_INVALIDA');
  const canvas = createCanvas();
  const scale = Math.min(1, 2400 / Math.max(source.width, source.height));
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('IMAGEN_LOCAL_INVALIDA');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.65]) {
      const uri = canvas.toDataURL('image/jpeg', quality);
      if (!uri.startsWith('data:image/jpeg;base64,')) throw new Error('IMAGEN_LOCAL_INVALIDA');
      const imageBase64 = uri.slice(uri.indexOf(',') + 1);
      const bytes = imageBase64.length * 3 / 4 - (imageBase64.match(/=+$/)?.[0].length || 0);
      if (bytes > 0 && bytes <= MAX_IMAGE_BYTES) return {imageBase64, mimeType: 'image/jpeg'};
    }
    canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
    canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
  }
  throw new Error('IMAGEN_MUY_GRANDE');
}

async function requestGemini(payload, options) {
  const {llamarFuncionSegura} = await import('./functionsClient.js');
  return llamarFuncionSegura('analizarCajaGemini', payload, options);
}

export async function scanBoxWithGemini(canvas, {onProgress, signal, request = requestGemini, timeoutMs = REQUEST_TIMEOUT_MS, createCanvas} = {}) {
  if (signal?.aborted) throw new DOMException('Escaneo cancelado', 'AbortError');
  onProgress?.({detail: 'Preparando la foto para Gemini'});
  const payload = prepareGeminiBoxImage(canvas, createCanvas);
  const controller = new AbortController();
  let cancelRequest;
  const cancelled = new Promise((_, reject) => { cancelRequest = reject; });
  const abort = () => {
    controller.abort();
    cancelRequest(new DOMException('Escaneo cancelado', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, {once: true});
  const timeout = setTimeout(() => {
    controller.abort();
    cancelRequest(new Error('UPSTREAM_TIMEOUT'));
  }, timeoutMs);
  try {
    onProgress?.({detail: 'Gemini esta leyendo la etiqueta'});
    const result = await Promise.race([request(payload, {signal: controller.signal}), cancelled]);
    if (result?.source !== 'gemini' || !result.data || !result.fields || !Array.isArray(result.warnings)) {
      throw new Error('GEMINI_INVALID_RESPONSE');
    }
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
