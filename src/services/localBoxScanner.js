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

function croppedCanvas(source, region, maxSide = MAX_SCAN_SIDE, maxUpscale = 3) {
  const sourceWidth = Math.max(1, Math.round(region.width));
  const sourceHeight = Math.max(1, Math.round(region.height));
  const scale = Math.min(maxUpscale, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = createCanvas(sourceWidth * scale, sourceHeight * scale);
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    Math.max(0, Math.round(region.x)),
    Math.max(0, Math.round(region.y)),
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function focusRegionScore(source, region) {
  const sample = croppedCanvas(source, region, 320, 1);
  const context = sample.getContext('2d', {willReadFrequently: true});
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const grayscale = new Uint8Array(sample.width * sample.height);
  let total = 0;
  let squareTotal = 0;
  let lightPixels = 0;
  let darkPixels = 0;
  let edgeTotal = 0;

  for (let pixel = 0, index = 0; pixel < pixels.length; pixel += 4, index += 1) {
    const gray = Math.round(pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114);
    grayscale[index] = gray;
    total += gray;
    squareTotal += gray * gray;
    if (gray >= 155) lightPixels += 1;
    if (gray <= 105) darkPixels += 1;
    if (index % sample.width) edgeTotal += Math.abs(gray - grayscale[index - 1]);
    if (index >= sample.width) edgeTotal += Math.abs(gray - grayscale[index - sample.width]);
  }

  const count = grayscale.length || 1;
  const average = total / count;
  const deviation = Math.sqrt(Math.max(0, squareTotal / count - average * average));
  const lightRatio = lightPixels / count;
  const darkRatio = darkPixels / count;
  const averageEdge = edgeTotal / (count * 2);
  return (
    lightRatio * 55
    + Math.min(darkRatio, 0.35) * 85
    + Math.min(averageEdge, 24) * 1.8
    + Math.min(deviation, 80) * 0.35
  );
}

function selectFocusCanvas(original) {
  const width = original.width;
  const height = original.height;
  const regions = [
    {name: 'top', x: width * 0.025, y: 0, width: width * 0.95, height: height * 0.58},
    {name: 'middle', x: width * 0.025, y: height * 0.21, width: width * 0.95, height: height * 0.58},
    {name: 'bottom', x: width * 0.025, y: height * 0.42, width: width * 0.95, height: height * 0.58},
  ];
  const ranked = regions
    .map(region => ({...region, score: focusRegionScore(original, region)}))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0];
  return {
    canvas: croppedCanvas(original, selected),
    region: {
      name: selected.name,
      x: Math.round(selected.x),
      y: Math.round(selected.y),
      width: Math.round(selected.width),
      height: Math.round(selected.height),
      score: Math.round(selected.score * 10) / 10,
    },
  };
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
  [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.78].forEach(start => {
    regions.push({
      x: 0,
      y: canvas.height * start,
      width: canvas.width,
      height: canvas.height * Math.min(0.24, 1 - start),
    });
  });
  [0.2, 0.3, 0.4, 0.5, 0.6, 0.7].forEach(start => {
    regions.push({
      x: canvas.width * 0.38,
      y: canvas.height * start,
      width: canvas.width * 0.62,
      height: canvas.height * Math.min(0.16, 1 - start),
    });
  });
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
    const [{BrowserMultiFormatReader}, {BarcodeFormat, DecodeHintType}] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
      BarcodeFormat.EAN_13,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
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

async function detectBarcodes(original, focused, binary) {
  report('barcodes', 0.18, 'Leyendo codigos de barras');
  const native = uniqueBarcodes([
    ...await detectNativeBarcodes(focused),
    ...await detectNativeBarcodes(original),
  ]);
  const fallback = native.length >= 3 ? [] : await detectZxingBarcodes([focused, binary]);
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

export async function scanBoxImage(sourceCanvas, {onProgress, verifierModels} = {}) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) throw new Error('IMAGEN_LOCAL_INVALIDA');
  progressReporter = onProgress || null;
  report('preprocess', 0.03, 'Mejorando la etiqueta');
  const original = scaledCanvas(sourceCanvas);
  const focus = selectFocusCanvas(original);
  const {grayscale, binary, quality} = preprocessCanvas(focus.canvas);

  try {
    const barcodes = await detectBarcodes(original, focus.canvas, binary);
    const worker = await getWorker();
    const first = await recognize(worker, grayscale);
    let text = first.data?.text || '';
    let ocrConfidence = Number(first.data?.confidence || 0);
    let result = parseBoxOcr({text, barcodes, ocrConfidence, verifierModels});

    if (!result.data.imei1 || !result.data.imei2 || populatedFields(result) < 6) {
      report('ocr', 0.62, 'Intentando una segunda mejora de contraste');
      const second = await recognize(worker, binary);
      text = `${text}\n${second.data?.text || ''}`;
      ocrConfidence = Math.max(ocrConfidence, Number(second.data?.confidence || 0));
      result = parseBoxOcr({text, barcodes, ocrConfidence, verifierModels});
    }

    if (populatedFields(result) < 7) {
      report('ocr', 0.82, 'Revisando el encuadre completo');
      const fullPage = preprocessCanvas(original);
      const third = await recognize(worker, fullPage.grayscale);
      text += '\n' + (third.data?.text || '');
      ocrConfidence = Math.max(ocrConfidence, Number(third.data?.confidence || 0));
      result = parseBoxOcr({text, barcodes, ocrConfidence, verifierModels});
    }

    report('validate', 0.96, 'Validando IMEI y campos');
    const qualityWarnings = result.data.imei1 && result.data.imei2 && populatedFields(result) >= 7
      ? quality.warnings.filter(warning => !warning.includes('borrosa'))
      : quality.warnings;
    return {
      ...result,
      warnings: [...qualityWarnings, ...result.warnings],
      diagnostics: {...result.diagnostics, quality, focusRegion: focus.region},
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
  focusRegionScore,
  otsuThreshold,
  selectFocusCanvas,
  uniqueBarcodes,
};
