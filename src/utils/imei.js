export function normalizeImei(value) {
  const imei = String(value || '').replace(/\s/g, '');
  return /^\d{15}$/.test(imei) ? imei : '';
}

export function luhn(imei) {
  if (!imei || imei.length !== 15 || !/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

