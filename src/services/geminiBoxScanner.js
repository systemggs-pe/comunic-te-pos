const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 40000;

function checkAborted(signal) {
  if (signal?.aborted) throw new DOMException('Escaneo cancelado', 'AbortError');
}

async function jpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/jpeg') reject(new Error('IMAGEN_LOCAL_INVALIDA'));
      else resolve(blob);
    }, 'image/jpeg', quality);
  });
}

export async function prepareGeminiBoxImage(source, createCanvas = () => document.createElement('canvas'), signal) {
  checkAborted(signal);
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
      checkAborted(signal);
      // La codificacion asincrona permite volver al formulario sin esperar a toDataURL.
      const blob = await jpegBlob(canvas, quality);
      checkAborted(signal);
      if (blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        checkAborted(signal);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        }
        return {imageBase64: btoa(binary), mimeType: 'image/jpeg'};
      }
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
  checkAborted(signal);
  onProgress?.({detail: 'Preparando la foto para Gemini'});
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
    const extract = async () => {
      const payload = await prepareGeminiBoxImage(canvas, createCanvas, controller.signal);
      checkAborted(controller.signal);
      onProgress?.({detail: 'Gemini esta leyendo la etiqueta'});
      return request(payload, {signal: controller.signal});
    };
    const result = await Promise.race([extract(), cancelled]);
    if (result?.source !== 'gemini' || !result.data || !result.fields || !Array.isArray(result.warnings)) {
      throw new Error('GEMINI_INVALID_RESPONSE');
    }
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
