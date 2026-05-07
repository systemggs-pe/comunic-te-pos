const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://comunicate-tacna.web.app",
  "https://comunicate-tacna.firebaseapp.com",
];

function setCors(req, res) {
  const origin = req.get("origin");
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function requireAuth(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw Object.assign(new Error("No autorizado"), {status: 401});
  return admin.auth().verifyIdToken(match[1]);
}

function onlyPost(req) {
  if (req.method !== "POST") {
    throw Object.assign(new Error("Metodo no permitido"), {status: 405});
  }
}

function handleHttp(handler) {
  return onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      onlyPost(req);
      await requireAuth(req);
      await handler(req, res);
    } catch (error) {
      logger.error(error);
      res.status(error.status || 500).json({
        error: error.message || "Error interno",
      });
    }
  });
}

exports.consultarReniec = handleHttp(async (req, res) => {
  const dni = String(req.body?.dni || "").replace(/\D/g, "").slice(0, 8);
  if (dni.length !== 8) {
    res.status(400).json({error: "DNI invalido"});
    return;
  }

  if (!process.env.RENIEC_TOKEN) {
    res.status(500).json({error: "Falta configurar RENIEC_TOKEN en functions/.env"});
    return;
  }

  const response = await fetch(`https://api-codart.cgrt.org/api/v1/consultas/reniec/dni/${dni}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RENIEC_TOKEN}`,
    },
  });
  const data = await response.json();
  res.status(response.ok ? 200 : response.status).json(data);
});

exports.analizarCajaGemini = handleHttp(async (req, res) => {
  const imageBase64 = String(req.body?.imageBase64 || "");
  if (!imageBase64) {
    res.status(400).json({error: "Falta imageBase64"});
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({error: "Falta configurar GEMINI_API_KEY en functions/.env"});
    return;
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

  const modelo = "gemini-flash-latest";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: "image/jpeg", data: imageBase64}},
        {text: prompt},
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 1024},
    }),
  });
  const data = await response.json();
  res.status(response.ok ? 200 : response.status).json(data);
});
