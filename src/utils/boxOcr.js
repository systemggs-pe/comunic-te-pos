import {luhn} from './imei.js';
import {canonicalBrandFromText, DEVICE_COLOR_NAMES} from './deviceCatalog.js';
import {verifyBoxData} from './boxDataVerifier.js';

const RAM_VALUES = new Set(['1', '2', '3', '4', '6', '8', '12', '16', '18', '24', '32']);
const STORAGE_VALUES = new Set(['8', '16', '32', '64', '128', '256', '512', '1024', '2048']);
const DIGIT_CONFUSIONS = {O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', G: '6', T: '7', B: '8'};
const STOP_LABELS_RE = /\b(?:IMEI|S\/?N|SERIAL|MODEL|MODELO|PRODUCT|MARKETING|RAM|ROM|STORAGE|MEMORY|CAPACITY|COLOR|COLOUR)\b/i;

function cleanLine(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeOcrText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .join('\n')
    .slice(0, 20_000);
}

function digitSequence(value, correctConfusions) {
  const normalized = String(value || '').toUpperCase().split('').map(character => {
    if (/\d/.test(character)) return character;
    if (correctConfusions && DIGIT_CONFUSIONS[character]) return DIGIT_CONFUSIONS[character];
    return '';
  }).join('');
  return normalized.slice(0, 80);
}

function validImeisFrom(value, correctConfusions = false) {
  const digits = digitSequence(value, correctConfusions);
  const matches = [];
  for (let index = 0; index <= digits.length - 15; index += 1) {
    const candidate = digits.slice(index, index + 15);
    if (luhn(candidate) && !matches.includes(candidate)) matches.push(candidate);
  }
  return matches;
}

function confidenceName(score) {
  if (score >= 90) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

function fieldResult(value = '', source = '', score = 0, reason = '') {
  return {
    value: String(value || ''),
    source,
    score: value ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    confidence: value ? confidenceName(score) : 'none',
    ...(reason ? {reason} : {}),
  };
}

function addImeiCandidate(store, value, details) {
  if (!luhn(value)) return;
  const existing = store.get(value);
  if (!existing || details.score > existing.score) store.set(value, {value, ...details});
}

function collectImeiCandidates(text, barcodes = []) {
  const candidates = new Map();
  barcodes.forEach((barcode, index) => {
    const rawValue = typeof barcode === 'string' ? barcode : barcode?.rawValue;
    validImeisFrom(rawValue, false).forEach(value => addImeiCandidate(candidates, value, {
      label: '',
      source: 'barcode',
      score: 100,
      order: Number(barcode?.y ?? barcode?.boundingBox?.y ?? index),
    }));
  });

  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    const labelledPattern = /IMEI\s*([12])?\s*[:#-]?\s*([0-9OQDGILSTBZ|][0-9OQDGILSTBZ| .:/-]{13,34})/gi;
    for (const match of line.matchAll(labelledPattern)) {
      validImeisFrom(match[2], true).forEach(value => addImeiCandidate(candidates, value, {
        label: match[1] || '',
        source: 'ocr-labelled',
        score: match[1] ? 95 : 90,
        order: lineIndex,
      }));
    }
    validImeisFrom(line, true).forEach(value => addImeiCandidate(candidates, value, {
      label: '',
      source: /IMEI/i.test(line) ? 'ocr-labelled' : 'ocr',
      score: /IMEI/i.test(line) ? 88 : 72,
      order: lineIndex,
    }));
  });

  return [...candidates.values()].sort((left, right) => (
    right.score - left.score || left.order - right.order
  ));
}

function chooseImeis(candidates) {
  const labelledOne = candidates.find(candidate => candidate.label === '1');
  const labelledTwo = candidates.find(candidate => candidate.label === '2' && candidate.value !== labelledOne?.value);
  const imei1 = labelledOne || candidates[0] || null;
  const sameTac = imei1 && candidates.find(candidate => (
    candidate.value !== imei1.value
    && candidate.value.slice(0, 8) === imei1.value.slice(0, 8)
  ));
  const reliableAlternative = candidates.find(candidate => (
    candidate.value !== imei1?.value
    && ['barcode', 'ocr-labelled'].includes(candidate.source)
    && candidate.score >= 88
  ));
  const imei2 = labelledTwo || sameTac || reliableAlternative || null;
  return {imei1, imei2};
}

function remainderAfterLabel(lines, labels) {
  const labelPattern = new RegExp(`\\b(?:${labels.join('|')})\\b`, 'i');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;
    const after = lines[index]
      .slice((match.index || 0) + match[0].length)
      .replace(/^[\s:#=./-]+/, '')
      .split(STOP_LABELS_RE)[0]
      .trim();
    if (after) return after;
    const next = lines[index + 1] || '';
    if (next && !STOP_LABELS_RE.test(next)) return next;
  }
  return '';
}

function sanitizeTextField(value, max = 50) {
  return cleanLine(value)
    .replace(/[^A-Z0-9+./() _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function serialFromBarcode(barcodes = []) {
  return barcodes.map(barcode => {
    const rawValue = typeof barcode === 'string' ? barcode : barcode?.rawValue;
    return sanitizeTextField(rawValue, 40).replace(/\s+/g, '');
  }).find(value => (
    value.length >= 7
    && value.length <= 40
    && /^[A-Z0-9._/-]+$/.test(value)
    && /[A-Z/_-]/.test(value)
    && !/^\d{15}$/.test(value)
    && !/^(?:HTTPS?|WWW)[/:.]/.test(value)
    && !/(?:\.COM|REGULATORY|SUBT)/.test(value)
  )) || '';
}

function extractSerial(lines, barcodes) {
  const value = remainderAfterLabel(lines, ['S\\s*\\/\\s*N', 'SERIAL(?:\\s+(?:NO|NUMBER|NUMERO))?', 'SN']);
  const match = sanitizeTextField(value, 40).match(/[A-Z0-9][A-Z0-9._/-]{4,39}/);
  const ocrValue = match && !/^\d{15}$/.test(match[0]) ? match[0] : '';
  const barcodeValue = serialFromBarcode(barcodes);
  return {
    value: barcodeValue || ocrValue,
    source: barcodeValue ? 'barcode' : ocrValue ? 'ocr-labelled' : '',
    score: barcodeValue ? 98 : 0,
  };
}

function extractBrand(text) {
  return canonicalBrandFromText(text);
}

function extractModel(lines, text) {
  const labelled = sanitizeTextField(remainderAfterLabel(lines, [
    'MODEL(?:\\s+(?:NO|NUMBER|NUMERO|NAME))?',
    'MODELO',
    'SKU',
  ]), 40);
  const labelledMatch = labelled.match(/[A-Z0-9][A-Z0-9._/-]{2,39}/);
  if (labelledMatch) return labelledMatch[0];

  const patterns = [
    /\bSM-[A-Z0-9-]{4,20}\b/,
    /\bXT\d{4}-\d{1,3}\b/,
    /\bA\d{4}\b/,
    /\b\d{5,6}[A-Z]{1,4}\d{1,3}[A-Z]{0,3}\b/,
  ];
  return patterns.map(pattern => text.match(pattern)?.[0]).find(Boolean) || '';
}

function extractCommercialName(lines) {
  const branded = lines.map(line => {
    const match = line.match(/\b((?:SAMSUNG\s+)?GALAXY\s+[A-Z0-9+ -]{1,50}|(?:XIAOMI\s+)?(?:REDMI|POCO)\s+[A-Z0-9+ -]{1,50}|IPHONE\s+[A-Z0-9+ -]{1,40}|MOTO\s+[A-Z0-9+ -]{1,40}|PIXEL\s+[A-Z0-9+ -]{1,40})\b/i);
    return sanitizeTextField(match?.[1], 60);
  }).find(Boolean);
  if (branded) return branded;

  const labelled = sanitizeTextField(remainderAfterLabel(lines, [
    'PRODUCT\\s+NAME',
    'MARKETING(?:\\s+NAME)?',
    'DEVICE(?:\\s+NAME)?',
    'NOMBRE(?:\\s+COMERCIAL)?',
  ]), 60);
  if (labelled.length >= 3) return labelled;
  return '';
}

function firstAllowedCapacity(value, allowed) {
  const matches = String(value || '').match(/\d{1,4}/g) || [];
  return matches.find(item => allowed.has(String(Number(item)))) || '';
}

function extractCapacities(lines, text) {
  let ram = firstAllowedCapacity(remainderAfterLabel(lines, ['RAM']), RAM_VALUES);
  let memoria = firstAllowedCapacity(remainderAfterLabel(lines, ['ROM', 'STORAGE', 'MEMORY', 'CAPACITY']), STORAGE_VALUES);

  const ramBeforeLabel = text.match(/\b(\d{1,2})\s*GB\s*RAM\b/i);
  const storageBeforeLabel = text.match(/\b(\d{2,4})\s*GB\s*(?:ROM|STORAGE|MEMORY|CAPACITY)\b/i);
  if (ramBeforeLabel && RAM_VALUES.has(String(Number(ramBeforeLabel[1])))) ram = String(Number(ramBeforeLabel[1]));
  if (storageBeforeLabel && STORAGE_VALUES.has(String(Number(storageBeforeLabel[1])))) memoria = String(Number(storageBeforeLabel[1]));

  const combined = text.match(/\b(\d{1,2})\s*(?:GB)?\s*(?:\+|\/|\|)\s*(\d{2,4})\s*GB\b/i);
  if (combined) {
    if (RAM_VALUES.has(String(Number(combined[1])))) ram = String(Number(combined[1]));
    if (STORAGE_VALUES.has(String(Number(combined[2])))) memoria = String(Number(combined[2]));
  }
  return {ram, memoria};
}

function extractColor(lines) {
  const raw = remainderAfterLabel(lines, ['COLOR', 'COLOUR']);
  return sanitizeTextField(raw, 35).replace(/\b(?:RAM|ROM|GB)\b.*$/, '').trim();
}

function splitCommercialColor(value) {
  const commercialName = sanitizeTextField(value, 60);
  const suffix = DEVICE_COLOR_NAMES.find(color => commercialName.endsWith(' ' + color));
  if (!suffix) return {commercialName, color: ''};
  return {
    commercialName: commercialName.slice(0, -(suffix.length + 1)).trim(),
    color: suffix,
  };
}

export function parseBoxOcr({text = '', barcodes = [], ocrConfidence = 0} = {}) {
  const normalizedText = normalizeOcrText(text);
  const lines = normalizedText.split('\n').filter(Boolean);
  const imeiCandidates = collectImeiCandidates(normalizedText, barcodes);
  const {imei1, imei2} = chooseImeis(imeiCandidates);
  const score = Math.max(55, Math.min(88, Number(ocrConfidence) || 65));
  const serial = extractSerial(lines, barcodes);
  const commercial = splitCommercialColor(extractCommercialName(lines));
  const explicitColor = extractColor(lines);
  const rawData = {
    imei1: imei1?.value || '',
    imei2: imei2?.value || '',
    sn: serial.value,
    marca: extractBrand(normalizedText),
    modelo: extractModel(lines, normalizedText),
    nombreComercial: commercial.commercialName,
    ...extractCapacities(lines, normalizedText),
    color: explicitColor || commercial.color,
  };
  const verified = verifyBoxData(rawData, {colorCandidates: [commercial.color]});
  const data = verified.data;
  const verificationChanges = new Map(verified.changes.map(change => [change.field, change]));
  const resultFor = (field, value, source, fieldScore) => {
    const change = verificationChanges.get(field);
    return fieldResult(
      value,
      change?.source || source,
      change ? Number(change.confidence || 0) * 100 : fieldScore,
      change?.reason || '',
    );
  };
  const fields = {
    imei1: resultFor('imei1', data.imei1, imei1?.source, imei1?.score),
    imei2: resultFor('imei2', data.imei2, imei2?.source, imei2?.score),
    sn: resultFor('sn', data.sn, serial.source, serial.score || score),
    marca: resultFor('marca', data.marca, data.marca ? 'ocr-dictionary' : '', data.marca ? Math.max(score, 80) : 0),
    modelo: resultFor('modelo', data.modelo, data.modelo ? 'ocr' : '', score),
    nombreComercial: resultFor('nombreComercial', data.nombreComercial, data.nombreComercial ? 'ocr' : '', score),
    ram: resultFor('ram', data.ram, data.ram ? 'ocr' : '', score),
    memoria: resultFor('memoria', data.memoria, data.memoria ? 'ocr' : '', score),
    color: resultFor('color', data.color, data.color ? explicitColor ? 'ocr' : 'ocr-suffix' : '', score),
  };
  const warnings = [...verified.warnings];
  if (!data.imei1) warnings.push('No se encontro un IMEI valido. Revisa la foto o ingresalo manualmente.');
  else if (!data.imei2) warnings.push('Solo se encontro un IMEI valido.');
  if (normalizedText && Number(ocrConfidence) < 55) warnings.push('El texto tiene baja confianza; revisa los campos antes de aplicarlos.');

  return {
    data,
    fields,
    warnings,
    diagnostics: {
      barcodeCount: barcodes.length,
      validImeiCandidates: imeiCandidates.length,
      ocrConfidence: Math.max(0, Math.min(100, Math.round(Number(ocrConfidence) || 0))),
      textLength: normalizedText.length,
      verifierChanges: verified.changes.length,
      modelVersion: verified.modelVersion,
    },
  };
}

export const __test = {
  collectImeiCandidates,
  normalizeOcrText,
  validImeisFrom,
};
