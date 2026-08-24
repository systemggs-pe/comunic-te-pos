import verifierModel from '../../packages/local-field-verifier/models/model.generated.js';
import {verifyFields} from '../../packages/local-field-verifier/src/index.js';
import {luhn} from './imei.js';
import {normalizarEscaneo} from './scanner.js';
import {
  canonicalBrandFromText,
  colorSuffixFromName,
  compatibleColors,
  DEVICE_COLOR_NAMES,
  isKnownBrand,
  strongBrandFromCommercialName,
} from './deviceCatalog.js';

const RAM_VALUES = new Set(['1', '2', '3', '4', '6', '8', '12', '16', '18', '24', '32']);
const STORAGE_VALUES = new Set(['8', '16', '32', '64', '128', '256', '512', '1024', '2048']);
const MODEL_PROTECTED_FIELDS = ['imei1', 'imei2', 'sn'];

function changeKey(field, after) {
  return `${field}\u0000${after}`;
}

function mergeChange(changes, seen, change) {
  const key = changeKey(change.field, change.after);
  if (seen.has(key) || change.before === change.after) return;
  seen.add(key);
  changes.push(change);
}

function removeColorSuffix(name, suffix) {
  const normalized = String(name || '').trim().toUpperCase();
  if (!suffix || !normalized.endsWith(` ${suffix}`)) return normalized;
  return normalized.slice(0, -(suffix.length + 1)).trim();
}

function preferredColor(name, currentColor, candidates) {
  const suffix = colorSuffixFromName(name);
  const recognized = [suffix, ...(candidates || [])]
    .map(value => String(value || '').trim().toUpperCase())
    .filter(value => DEVICE_COLOR_NAMES.includes(value))
    .sort((left, right) => right.length - left.length);
  const options = recognized
    .filter(value => compatibleColors(value, currentColor))
    .sort((left, right) => right.length - left.length);
  return {
    suffix,
    value: options[0] || '',
    conflictingValue: currentColor && !options.length ? recognized[0] || '' : '',
  };
}

export function verifyBoxData(extracted = {}, {
  colorCandidates = [],
  model = verifierModel,
  modelThreshold = 0.92,
} = {}) {
  const normalized = normalizarEscaneo(extracted);
  const learned = verifyFields({
    extracted: normalized,
    model,
    threshold: modelThreshold,
    protectedFields: MODEL_PROTECTED_FIELDS,
    validators: {
      marca: value => !value || isKnownBrand(value),
      ram: value => !value || RAM_VALUES.has(value),
      memoria: value => !value || STORAGE_VALUES.has(value),
    },
  });
  const data = normalizarEscaneo(learned.data);
  const changes = [];
  const seen = new Set();
  const warnings = [];
  learned.changes.forEach(change => mergeChange(changes, seen, change));

  const applyRule = (field, value, reason, confidence = 0.99) => {
    const after = String(value || '').trim().toUpperCase();
    const before = data[field];
    if (before === after) return;
    data[field] = after;
    mergeChange(changes, seen, {field, before, after, source: 'domain-rule', confidence, reason});
  };

  const currentCanonicalBrand = canonicalBrandFromText(data.marca);
  const commercialBrand = strongBrandFromCommercialName(data.nombreComercial);
  if (commercialBrand && commercialBrand !== currentCanonicalBrand) {
    applyRule('marca', commercialBrand, 'Marca confirmada por el nombre comercial');
  } else if (currentCanonicalBrand && data.marca !== currentCanonicalBrand) {
    applyRule('marca', currentCanonicalBrand, 'Marca normalizada con el catalogo local');
  } else if (!currentCanonicalBrand && data.marca) {
    warnings.push(`La marca ${data.marca} no existe en el catalogo local; revisala manualmente.`);
  } else if (!data.marca && commercialBrand) {
    applyRule('marca', commercialBrand, 'Marca inferida desde el nombre comercial');
  }

  const color = preferredColor(data.nombreComercial, data.color, colorCandidates);
  if (color.suffix) {
    applyRule('nombreComercial', removeColorSuffix(data.nombreComercial, color.suffix), 'Color separado del nombre comercial');
  }
  if (color.value && (!data.color || color.value.length > data.color.length)) {
    applyRule('color', color.value, 'Se eligio el color comercial mas especifico');
  } else if (color.conflictingValue) {
    warnings.push(`El color ${data.color} no coincide con ${color.conflictingValue} detectado en el nombre.`);
  }

  if (data.ram && !RAM_VALUES.has(data.ram)) {
    applyRule('ram', '', 'Valor de RAM fuera del catalogo permitido');
    warnings.push('La RAM detectada no es valida; revisala manualmente.');
  }
  if (data.memoria && !STORAGE_VALUES.has(data.memoria)) {
    applyRule('memoria', '', 'Valor de memoria fuera del catalogo permitido');
    warnings.push('La memoria detectada no es valida; revisala manualmente.');
  }

  if (data.imei1 && !luhn(data.imei1)) {
    applyRule('imei1', '', 'IMEI descartado por checksum Luhn');
    warnings.push('El IMEI 1 detectado no paso la validacion Luhn.');
  }
  if (data.imei2 && !luhn(data.imei2)) {
    applyRule('imei2', '', 'IMEI descartado por checksum Luhn');
    warnings.push('El IMEI 2 detectado no paso la validacion Luhn.');
  }
  if (data.imei1 && data.imei1 === data.imei2) {
    applyRule('imei2', '', 'IMEI duplicado descartado');
    warnings.push('El IMEI 2 repetia el IMEI 1 y fue descartado.');
  }
  return {
    data: normalizarEscaneo(data),
    changes,
    warnings,
    modelVersion: learned.modelVersion,
  };
}

export const __test = {
  preferredColor,
};
