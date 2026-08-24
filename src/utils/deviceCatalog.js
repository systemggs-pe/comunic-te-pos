const BRAND_RULES = [
  {canonical: 'APPLE', pattern: /\b(?:APPLE|IPHONE)\b/i, strong: /\bIPHONE\b/i},
  {canonical: 'SAMSUNG', pattern: /\b(?:SAMSUNG|GALAXY)\b/i, strong: /\bGALAXY\b/i},
  {canonical: 'XIAOMI', pattern: /\b(?:XIAOMI|REDMI|POCO)\b/i, strong: /\b(?:REDMI|POCO)\b/i},
  {canonical: 'MOTOROLA', pattern: /\b(?:MOTOROLA|MOTO)\b/i, strong: /\bMOTO\b/i},
  {canonical: 'GOOGLE', pattern: /\b(?:GOOGLE\s+PIXEL|GOOGLE|PIXEL)\b/i, strong: /\bPIXEL\b/i},
  {canonical: 'HONOR', pattern: /\bHONOR\b/i, strong: /\bHONOR\b/i},
  {canonical: 'HUAWEI', pattern: /\bHUAWEI\b/i, strong: /\bHUAWEI\b/i},
  {canonical: 'OPPO', pattern: /\bOPPO\b/i, strong: /\bOPPO\b/i},
  {canonical: 'REALME', pattern: /\bREALME\b/i, strong: /\bREALME\b/i},
  {canonical: 'VIVO', pattern: /\bVIVO\b/i, strong: /\bVIVO\b/i},
  {canonical: 'ONEPLUS', pattern: /\bONE\s*PLUS\b/i, strong: /\bONE\s*PLUS\b/i},
  {canonical: 'TECNO', pattern: /\bTECNO\b/i, strong: /\bTECNO\b/i},
  {canonical: 'INFINIX', pattern: /\bINFINIX\b/i, strong: /\bINFINIX\b/i},
  {canonical: 'ZTE', pattern: /\bZTE\b/i, strong: /\bZTE\b/i},
  {canonical: 'NOKIA', pattern: /\bNOKIA\b/i, strong: /\bNOKIA\b/i},
  {canonical: 'NOTHING', pattern: /\bNOTHING(?:\s+PHONE)?\b/i, strong: /\bNOTHING\b/i},
  {canonical: 'ASUS', pattern: /\b(?:ASUS|ROG\s+PHONE)\b/i, strong: /\b(?:ASUS|ROG\s+PHONE)\b/i},
  {canonical: 'LENOVO', pattern: /\bLENOVO\b/i, strong: /\bLENOVO\b/i},
  {canonical: 'HTC', pattern: /\bHTC\b/i, strong: /\bHTC\b/i},
];

const COLOR_NAMES = [
  'AWESOME BLACK', 'MIDNIGHT BLACK', 'GRAPHITE BLACK', 'PHANTOM BLACK', 'OBSIDIAN BLACK',
  'TITANIUM BLACK', 'CARBON BLACK', 'STARRY BLACK', 'MYSTIC BLACK', 'COSMIC BLACK',
  'TITANIUM GRAY', 'TITANIUM GREY', 'GRAPHITE GRAY', 'GRAPHITE GREY', 'SPACE GRAY', 'SPACE GREY',
  'GLACIER BLUE', 'GLACIAR BLUE', 'AZUL GLACIAR', 'ICE BLUE', 'SKY BLUE', 'NAVY BLUE',
  'OCEAN BLUE', 'AURORA BLUE', 'MISTY BLUE', 'STARLIGHT BLUE', 'LIGHT BLUE', 'DARK BLUE',
  'FOREST GREEN', 'MINT GREEN', 'EMERALD GREEN', 'OCEAN GREEN', 'AURORA GREEN',
  'LAVENDER PURPLE', 'COSMIC PURPLE', 'DEEP PURPLE', 'LILAC PURPLE',
  'ROSE GOLD', 'CHAMPAGNE GOLD', 'DESERT GOLD', 'STARLIGHT',
  'PEARL WHITE', 'CERAMIC WHITE', 'ARCTIC WHITE', 'CRYSTAL WHITE',
  'AWESOME SILVER', 'TITANIUM SILVER',
  'BLACK', 'WHITE', 'BLUE', 'GREEN', 'GRAY', 'GREY', 'GOLD', 'SILVER', 'PURPLE', 'PINK',
  'RED', 'ORANGE', 'YELLOW', 'BROWN', 'AZUL', 'NEGRO', 'BLANCO', 'VERDE', 'GRIS', 'DORADO',
  'PLATEADO', 'MORADO', 'ROSADO', 'ROJO', 'NARANJA', 'AMARILLO',
];

export const DEVICE_COLOR_NAMES = [...new Set(COLOR_NAMES)]
  .sort((left, right) => right.length - left.length);

export const DEVICE_BRANDS = BRAND_RULES.map(rule => rule.canonical);

export function canonicalBrandFromText(value) {
  const text = String(value || '');
  return BRAND_RULES.find(rule => rule.pattern.test(text))?.canonical || '';
}

export function strongBrandFromCommercialName(value) {
  const text = String(value || '');
  return BRAND_RULES.find(rule => rule.strong.test(text))?.canonical || '';
}

export function isKnownBrand(value) {
  const canonical = canonicalBrandFromText(value);
  return Boolean(canonical && canonical === String(value || '').trim().toUpperCase());
}

export function colorSuffixFromName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return DEVICE_COLOR_NAMES.find(color => normalized.endsWith(` ${color}`)) || '';
}

const COLOR_FAMILIES = new Map([
  ['GREY', 'GRAY'], ['GRIS', 'GRAY'], ['AZUL', 'BLUE'], ['NEGRO', 'BLACK'], ['BLANCO', 'WHITE'],
  ['VERDE', 'GREEN'], ['DORADO', 'GOLD'], ['PLATEADO', 'SILVER'], ['MORADO', 'PURPLE'],
  ['ROSADO', 'PINK'], ['ROJO', 'RED'], ['NARANJA', 'ORANGE'], ['AMARILLO', 'YELLOW'],
]);

export function colorFamily(value) {
  const words = String(value || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] || '';
  return COLOR_FAMILIES.get(lastWord) || lastWord;
}

export function compatibleColors(left, right) {
  if (!left || !right) return true;
  return colorFamily(left) === colorFamily(right);
}
