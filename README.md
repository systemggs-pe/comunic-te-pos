# Comunicate

Aplicacion React + Vite desplegada en Netlify.

## Backend canonico

El unico backend activo del proyecto esta en `netlify/functions`.

- `reniec.mjs`: consulta DNI con token RENIEC.
- `analizarCajaGemini.mjs`: OCR de caja con Gemini.
- `registros.mjs`: altas, ediciones, desbloqueos y borrados de registros con transacciones Firestore.
- `ventas.mjs`: altas, ediciones y borrados de ventas con transacciones Firestore.
- `_validators.mjs`: modelos Zod compartidos para validar DNI, celular, email, IMEI, precio y fechas en servidor.

No se usan Firebase Cloud Functions para mantener compatibilidad con el plan gratuito de Firebase.

## Variables de entorno en Netlify

Configurar en `Site configuration > Environment variables`:

```env
FIREBASE_SERVICE_ACCOUNT=JSON_PRIVADO_DE_FIREBASE_ADMIN_EN_UNA_LINEA
FIREBASE_API_KEY=TU_FIREBASE_WEB_API_KEY
ALLOWED_EMAILS=correo1@gmail.com,correo2@gmail.com
ALLOWED_ORIGINS=https://tu-sitio.netlify.app
RENIEC_TOKEN=TU_TOKEN_RENIEC
GEMINI_API_KEY=TU_API_KEY_GEMINI
GEMINI_MODEL=gemini-2.0-flash
VITE_BACKEND_BASE_URL=
```

Si el frontend se despliega en Netlify junto con las funciones, `VITE_BACKEND_BASE_URL` queda vacio.

## Desarrollo local

Para probar frontend consumiendo las mismas APIs sin hacer hosting:

```bash
npm run dev
```

Ese comando levanta la API local en `http://127.0.0.1:3001` y Vite redirige `/api` hacia ese servidor local. Mantén `VITE_BACKEND_BASE_URL` vacio en `.env` para usar ese proxy.

Para revisar solo frontend sin API local:

```bash
npm run dev:vite
```

Para levantar solo la API local:

```bash
npm run dev:api
```

Para probar frontend y Netlify Functions localmente:

```bash
npx netlify dev
```

## Despliegue

Netlify construye con:

```bash
npm run build
```

Firestore rules se despliegan aparte:

```bash
npx firebase deploy --only firestore
```

No desplegar Firebase Functions.

La configuracion de Firestore incluye `firestore.rules` y `firestore.indexes.json`. Los listados de ventas y registros leen por paginas ordenadas por `fecha desc`.
