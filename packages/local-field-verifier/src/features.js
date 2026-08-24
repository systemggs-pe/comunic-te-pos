import {normalizeFieldValue} from './normalize.js';

export function removedSuffix(beforeValue, afterValue) {
  const before = normalizeFieldValue(beforeValue);
  const after = normalizeFieldValue(afterValue);
  if (!before || before === after) return '';
  if (!after) return before;
  return before.startsWith(`${after} `) ? before.slice(after.length + 1).trim() : '';
}

export function targetAcceptsPhrase(targetValue, phraseValue) {
  const target = normalizeFieldValue(targetValue);
  const phrase = normalizeFieldValue(phraseValue);
  if (!phrase) return false;
  if (!target || target === phrase) return true;
  return phrase.endsWith(` ${target}`) || target.endsWith(` ${phrase}`);
}

export function stripSuffix(value, suffix) {
  const normalized = normalizeFieldValue(value);
  const normalizedSuffix = normalizeFieldValue(suffix);
  if (!normalizedSuffix || normalized === normalizedSuffix) return '';
  if (!normalized.endsWith(` ${normalizedSuffix}`)) return normalized;
  return normalized.slice(0, -(normalizedSuffix.length + 1)).trim();
}
