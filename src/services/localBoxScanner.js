import {parseBoxOcr} from '../utils/boxOcr.js';

const OCR_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const OCR_JOB_TIMEOUT_MS = 45 * 1000;
const MAX_SCAN_SIDE = 2200;
const BARCODE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'data_matrix',
  'qr_code',
  'itf',
  'ean_13',
];

let workerPromise = null;
let workerIdleTimer = null;
let progressReporter = null;

function assetUrl(path) {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${base}ocr/${path}`;
}

function report(stage, progress, detail = '') {
  progressReporter?.({stage, progress: Math.max(0, Math.min(1, Number(progress) || 0)), detail});
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function scaledCanvas(source, maxSide = MAX_SCAN_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = createCanvas(source.width * scale, source.height * scale);
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = 0;
  let threshold = 128;
  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += index * histogram[index];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = index;
    }
  }
  return threshold;
}

function preprocessCanvas(source) {
  const grayscale = createCanvas(source.width, source.height);
  const grayscaleContext = grayscale.getContext('2d', {willReadFrequently: true});
  grayscaleContext.drawImage(source, 0, 0);
  const imageData = grayscaleContext.getImageData(0, 0, grayscale.width, grayscale.height);
  const pixels = imageData.data;
  const grayValues = new Uint8Array(grayscale.width * grayscale.height);
  const histogram = new Uint32Array(256);
  let brightnessTotal = 0;
  let edgeTotal = 0;

  for (let pixel = 0, valueIndex = 0; pixel < pixels.length; pixel += 4, valueIndex += 1) {
    const gray = Math.round(pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114);
    grayValues[valueIndex] = gray;
    histogram[gray] += 1;
    brightnessTotal += gray;
    if (valueIndex % grayscale.width) edgeTotal += Math.abs(gray - grayValues[valueIndex - 1]);
    if (valueIndex >= grayscale.width) edgeTotal += Math.abs(gray - grayValues[valueIndex - grayscale.width]);
  }

  const total = grayValues.length;
  const averageBrightness = total ? brightnessTotal / total : 0;
  const averageEdge = total ? edgeTotal / (total * 2) : 0;
  const thresholdValue = otsuThreshold(histogram, total);
  const binary = createCanvas(source.width, source.height);
  const binaryContext = binary.getContext('2d', {willReadFrequently: true});
  const binaryData = binaryContext.createImageData(binary.width, binary.height);

  for (let index = 0; index < grayValues.length; index += 1) {
    const contrasted = Math.max(0, Math.min(255, (grayValues[index] - averageBrightness) * 1.65 + 138));
    const pixel = index * 4;
    pixels[pixel] = contrasted;
    pixels[pixel + 1] = contrasted;
    pixels[pixel + 2] = contrasted;
    pixels[pixel + 3] = 255;
    const binaryValue = grayValues[index] > thresholdValue ? 255 : 0;
    binaryData.data[pixel] = binaryValue;
    binaryData.data[pixel + 1] = binaryValue;
    binaryData.data[pixel + 2] = binaryValue;
    binaryData.data[pixel + 3] = 255;
  }
  grayscaleContext.putImageData(imageData, 0, 0);
  binaryContext.putImageData(binaryData, 0, 0);

  const qualityWarnings = [];
  if (averageBrightness < 55) qualityWarnings.push('La foto esta oscura; usa mas luz para mejorar el resultado.');
  if (averageBrightness > 225) qualityWarnings.push('La foto tiene demasiado brillo o reflejo.');
  if (averageEdge < 5) qualityWarnings.push('La foto parece borrosa; acerca la etiqueta y enfoca nuevamente.');

  return {
    grayscale,
    binary,
    quality: {
      averageBrightness: Math.round(averageBrightness),
      averageEdge: Math.round(averageEdge * 10) / 10,
      warnings: qualityWarnings,
    },
  };
}

function uniqueBarcodes(values) {
  const seen = new Set();
  return values.filter(item => {
    const rawValue = String(item?.rawValue || '').trim();
    if (!rawValue || rawValue.length > 300 || seen.has(rawValue)) return false;
    seen.add(rawValue);
    return true;
  });
}

async function detectNativeBarcodes(canvas) {
  const BarcodeDetectorApi = globalThis.BarcodeDetector;
  if (typeof BarcodeDetectorApi !== 'function') return [];
  try {
    const supported = typeof BarcodeDetectorApi.getSupportedFormats === 'function'
      ? await BarcodeDetectorApi.getSupportedFormats()
      : BARCODE_FORMATS;
    const formats = BARCODE_FORMATS.filter(format => supported.includes(format));
    if (!formats.length) return [];
    const detections = await new BarcodeDetectorApi({formats}).detect(canvas);
    return detections.map(item => ({
      rawValue: String(item.rawValue || '').trim(),
      format: String(item.format || ''),
      x: Number(item.boundingBox?.x || 0),
      y: Number(item.boundingBox?.y || 0),
      source: 'native',
    }));
  } catch {
    return [];
  }
}

function cropRegions(canvas) {
  const regions = [
    {x: 0, y: 0, width: canvas.width, height: canvas.height},
    {x: 0, y: 0, width: canvas.width, height: canvas.height * 0.55},
    {x: 0, y: canvas.height * 0.22, width: canvas.width, height: canvas.height * 0.56},
    {x: 0, y: canvas.height * 0.45, width: canvas.width, height: canvas.height * 0.55},
  ];
  return regions.map(region => {
    const cropped = createCanvas(region.width, region.height);
    cropped.getContext('2d').drawImage(
      canvas,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
    return {canvas: cropped, y: region.y};
  });
}

async function detectZxingBarcodes(canvases) {
  try {
    const {BrowserMultiFormatReader} = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const results = [];
    for (const source of canvases) {
      for (const region of cropRegions(source)) {
        try {
          const result = reader.decodeFromCanvas(region.canvas);
          results.push({
            rawValue: result.getText(),
            format: String(result.getBarcodeFormat()),
            x: 0,
            y: region.y,
            source: 'zxing',
          });
        } catch {
          // A region without a readable barcode is an expected outcome.
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function detectBarcodes(original, binary) {
  report('barcodes', 0.18, 'Leyendo codigos de barras');
  const native = await detectNativeBarcodes(original);
  const fallback = native.length >= 2 ? [] : await detectZxingBarcodes([original, binary]);
  return uniqueBarcodes([...native, ...fallback]);
}

async function terminateWorker() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = null;
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // A worker that failed while loading has nothing left to release.
  }
}

function armWorkerIdleTimer() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = setTimeout(() => {
    terminateWorker();
  }, OCR_IDLE_TIMEOUT_MS);
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({createWorker, OEM, PSM}) => {
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl('core'),
        langPath: assetUrl('lang'),
        logger: message => {
          if (message.status === 'recognizing text') {
            report('ocr', 0.35 + Number(message.progress || 0) * 0.55, 'Leyendo texto de la etiqueta');
          } else if (/loading|initializing/i.test(message.status || '')) {
            report('engine', 0.2 + Number(message.progress || 0) * 0.15, 'Preparando OCR local');
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });
      return worker;
    }).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  const worker = await workerPromise;
  armWorkerIdleTimer();
  return worker;
}

async function recognize(worker, canvas) {
  let timeoutId;
  try {
    return await Promise.race([
      worker.recognize(canvas),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('OCR_LOCAL_TIMEOUT')), OCR_JOB_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function populatedFields(result) {
  return Object.values(result.data || {}).filter(Boolean).length;
}

export async function scanBoxImage(sourceCanvas, {onProgress} = {}) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) throw new Error('IMAGEN_LOCAL_INVALIDA');
  progressReporter = onProgress || null;
  report('preprocess', 0.03, 'Mejorando la etiqueta');
  const original = scaledCanvas(sourceCanvas);
  const {grayscale, binary, quality} = preprocessCanvas(original);

  try {
    const barcodes = await detectBarcodes(original, binary);
    const worker = await getWorker();
    const first = await recognize(worker, grayscale);
    let text = first.data?.text || '';
    let ocrConfidence = Number(first.data?.confidence || 0);
    let result = parseBoxOcr({text, barcodes, ocrConfidence});

    if (!result.data.imei1 && populatedFields(result) < 3) {
      report('ocr', 0.62, 'Intentando una segunda mejora de contraste');
      const second = await recognize(worker, binary);
      text = `${text}\n${second.data?.text || ''}`;
      ocrConfidence = Math.max(ocrConfidence, Number(second.data?.confidence || 0));
      result = parseBoxOcr({text, barcodes, ocrConfidence});
    }

    report('validate', 0.96, 'Validando IMEI y campos');
    return {
      ...result,
      warnings: [...quality.warnings, ...result.warnings],
      diagnostics: {...result.diagnostics, quality},
    };
  } catch (error) {
    if (error?.message === 'OCR_LOCAL_TIMEOUT') await terminateWorker();
    throw error;
  } finally {
    report('done', 1, 'Listo');
    progressReporter = null;
  }
}

export const __test = {
  otsuThreshold,
  uniqueBarcodes,
};
