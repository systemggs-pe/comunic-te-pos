import {fetchWithTimeout, handlePost} from './_shared.mjs';

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function normalizeImageBase64(value) {
  const raw = String(value || '').trim().replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 === 1) {
    throw Object.assign(new Error('IMAGEN_BASE64_INVALIDA'), {status: 400});
  }
  const bytes = Buffer.byteLength(raw, 'base64');
  if (!bytes || bytes > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('IMAGEN_MUY_GRANDE'), {status: 413});
  }
  return raw;
}

async function analizarCajaGemini(body) {
  const imageBase64 = normalizeImageBase64(body?.imageBase64);
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('Falta configurar GEMINI_API_KEY'), {status: 500});
  }

  const prompt = `Eres un experto en OCR de cajas de celulares. La imagen puede estar oscura, borrosa o con reflejo. Tu tarea es extraer TODOS los datos que puedas leer, aunque sean parciales.

REGLA MAS IMPORTANTE: Siempre responde con un JSON valido. NUNCA digas que no puedes leer. Si un dato es ilegible, deja el campo vacio "". Pero si puedes leer ALGO del campo, ponlo aunque no estes 100% seguro.

Responde UNICAMENTE con este JSON (sin backticks, sin explicaciones):
{"imei1":"","imei2":"","sn":"","marca":"","modelo":"","nombreComercial":"","ram":"","memoria":"","color":""}

Guia de extraccion:
- imei1: numero de 15 digitos cerca de la palabra "IMEI" o "IMEI 1". Solo digitos.
- imei2: segundo numero de 15 digitos cerca de "IMEI 2". Solo digitos. Si no hay, "".
- sn: alfanumerico junto a "S/N", "SN:", "Serial No" o "Serial Number".
- marca: SAMSUNG / XIAOMI / MOTOROLA / APPLE / OPPO / REALME / HUAWEI / VIVO / TECNO / INFINIX / ONEPLUS / NOKIA. En mayusculas.
- modelo: codigo tecnico como SM-A566E, 23053RN02A, XT2343-1. En mayusculas.
- nombreComercial: nombre de marketing como GALAXY A56, REDMI NOTE 13. En mayusculas.
- ram: solo numero en GB. Si dice "8GB RAM" -> "8".
- memoria: solo numero en GB de almacenamiento. Si dice "256GB" -> "256".
- color: color en mayusculas. Ej: NEGRO, AZUL, BLANCO.

Aunque la imagen sea dificil de leer, SIEMPRE devuelve el JSON con lo que puedas extraer.`;

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: 'image/jpeg', data: imageBase64}},
        {text: prompt},
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 1024},
    }),
  }, Number(process.env.GEMINI_TIMEOUT_MS || 20 * 1000));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || data.error || 'GEMINI_UPSTREAM_ERROR'), {
      status: response.status,
      payload: data,
    });
  }
  return data;
}

export const handler = event => handlePost(event, analizarCajaGemini, {
  maxBodyBytes: 2.1 * 1024 * 1024,
  rateLimit: {name: 'gemini', max: 15, windowMs: 60 * 1000, distributed: true},
});

export const __test = {normalizeImageBase64};
