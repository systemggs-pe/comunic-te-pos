# Variables and Configuration

## Environment File Strategy

Local environment files:

- `.env`
- `.env.local`
- `functions/.env`

These are ignored by git. Do not commit real secrets.

Example file:

- `.env.example`

Production secrets should be configured in Netlify environment variables.

## Variable Reference

| Variable | Required | Runtime | Purpose |
|---|---:|---|---|
| `BACKEND_PORT` | Local only | local API | Port for `scripts/local-api.mjs`. Defaults to `3001`. |
| `VITE_BACKEND_BASE_URL` | Optional | frontend build/runtime | Absolute backend base URL. Empty means use relative `/api`. |
| `FIREBASE_API_KEY` | Recommended | functions | Firebase web API key used by current token lookup implementation. |
| `FIREBASE_SERVICE_ACCOUNT` | Required for server writes | functions/local API | JSON service account for Firebase Admin SDK. |
| `FIREBASE_PROJECT_ID` | Alternative | functions/local API | Alternative to service account JSON. |
| `FIREBASE_CLIENT_EMAIL` | Alternative | functions/local API | Alternative to service account JSON. |
| `FIREBASE_PRIVATE_KEY` | Alternative | functions/local API | Alternative to service account JSON. |
| `ALLOWED_EMAILS` | Recommended | functions | Comma-separated authorized emails. |
| `ALLOWED_ORIGINS` | Recommended | functions | Comma-separated allowed CORS origins. |
| `RENIEC_TOKEN` | Required for RENIEC | functions | Bearer token for RENIEC provider. |
| `APPLE_RECEIPTS_API_URL` | Required for Apple registrations | functions/local API | HTTPS endpoint of the external receipts service. |
| `APPLE_RECEIPTS_API_KEY` | Required for Apple registrations | functions/local API | Server-only key sent as `X-API-Key`; never use a `VITE_` prefix. |
| `APPLE_RECEIPTS_TIMEOUT_MS` | Optional | functions/local API | External receipt lookup timeout. Defaults to 10000 and is capped at 20000 ms. |

## Safe Example

```env
BACKEND_PORT=3001
VITE_BACKEND_BASE_URL=
FIREBASE_API_KEY=your-firebase-web-api-key
ALLOWED_EMAILS=operator1@example.com,operator2@example.com
ALLOWED_ORIGINS=https://your-production-domain.example
RENIEC_TOKEN=your-reniec-token
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
APPLE_RECEIPTS_API_URL=https://comunicate-boletas.netlify.app/api/boletas
APPLE_RECEIPTS_API_KEY=your-server-only-integration-key
APPLE_RECEIPTS_TIMEOUT_MS=10000
```

Do not put real secrets in documentation, screenshots, commits or client-visible code.

## Firebase Client Configuration

Current frontend Firebase config is in:

```text
src/lib/firebase.js
```

It includes:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `measurementId`

Firebase web API keys are not secret in the same sense as service credentials, but they should still be restricted in Google Cloud where possible.

## Firebase Admin Configuration

Implemented in:

```text
netlify/functions/_firebaseAdmin.mjs
```

Supported formats:

1. `FIREBASE_SERVICE_ACCOUNT` as one-line JSON.
2. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

`FIREBASE_PRIVATE_KEY` supports escaped newline replacement:

```js
replace(/\\n/g, '\n')
```

## Allowed Origins

Configured in `_shared.mjs` from:

- Local development origins.
- Firebase hosting domains.
- Netlify deploy URLs.
- `ALLOWED_ORIGINS`.

Production recommendation:

- Include only the production domain and required preview domains.
- Avoid broad wildcard origin behavior.

## Allowed Emails

Configured in `_shared.mjs` from:

- `ALLOWED_EMAILS`, if present.
- Fallback default emails, if not present.

Also configured in:

- `src/config/auth.js`
- `firestore.rules`

Recommended:

- Replace duplicated email allowlists with custom claims and a server-managed user directory.

## External API Configuration

### RENIEC

Variable:

```env
RENIEC_TOKEN=...
```

Used by:

```text
netlify/functions/reniec.mjs
```

External endpoint:

```text
https://api-codart.cgrt.org/api/v1/consultas/reniec/dni/{dni}
```

### Gemini Box Scanner (active)

Set `GEMINI_API_KEY` in the server environment (`.env` locally, Netlify Functions
environment in production). Never prefix it with `VITE_`. `GEMINI_MODEL` defaults to
`gemini-2.5-flash`; `GEMINI_TIMEOUT_MS` defaults to 25000 and is capped at 25000 ms.
The browser uses `/api/analizarCajaGemini` and still needs an authorized Firebase session.
Deploy both the frontend and the Function/redirect when publishing this change.
No Firebase Storage configuration or database backfill is required.

The image is compressed to JPEG (maximum 1.5 MiB) before the operator-requested upload.
The backend uses inline image data and JSON structured output; see the official
[Gemini image API](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)
and [structured output reference](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig).

### External Apple receipt lookup

Apple registration receipt checks are performed only by Netlify Functions. Configure
`APPLE_RECEIPTS_API_URL`, `APPLE_RECEIPTS_API_KEY` and, optionally,
`APPLE_RECEIPTS_TIMEOUT_MS` both in the local `.env` and in the Netlify environment.
The browser receives only the sanitized receipt result; the API key is never bundled
into the Vite application. The current integration sends an exact IMEI query compatible
with the external boletas `/api/boletas` `searchHistory` action, forwards the already
authenticated operator token, and sends the integration key as `X-API-Key`.

The external boletas service must be configured to accept that integration key (or the
forwarded authenticated operator token) and return either `{ boletas: [...] }` or
`{ found, boleta }`. COMUNIC@TE rejects responses whose receipt does not contain the
requested IMEI and verifies the receipt again when the registration is saved.

### Local OCR and Trainable Verifier (temporarily paused)

`EscanerCaja.jsx` currently calls only `geminiBoxScanner.js`. It does not load the
local OCR/verifier or read, train, save, export or erase corrections. Existing IndexedDB
data and `packages/local-field-verifier` remain intact. The following describes the
preserved local implementation for future reactivation or standalone reuse.

The local scanner requires no API key. The build still copies the Tesseract worker, English
language data and compatible WASM cores from installed npm packages into `/ocr`.
Run `npm run prepare:ocr-assets` when serving Vite outside the provided npm scripts.

The reusable verifier is located at `packages/local-field-verifier`. The browser stores
sanitized corrections in IndexedDB and automatically trains a device-local model before
the next scan. Two matching corrections are required before a pattern becomes active.

Export is optional and remains available for backup or for publishing a shared model
across devices. Train/evaluate that shared version with:

```powershell
npm run train:box-verifier -- --input correcciones-ocr.json --min-count 2 --version 1.0.0
npm run evaluate:box-verifier -- --input evaluacion-ocr.json
```

Training updates both the portable JSON model and the JavaScript module consumed by
the web application. Review the diff and evaluation metrics before committing a new model.

## Build Configuration

Vite config:

```text
vite.config.js
```

Important settings:

- Dev proxy from `/api` to local API port.
- Manual chunks for Firebase, React, jsPDF, html2canvas, DOMPurify, JsBarcode, icons and generic vendor code.

Tailwind config:

```text
tailwind.config.js
```

Content paths:

```js
["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
```

## Security Headers

Netlify:

```text
public/_headers
```

Firebase Hosting:

```text
firebase.json
```

Current headers:

- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Frame-Options`

Recommended additions:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `Cross-Origin-Opener-Policy`
- Cache headers for immutable assets.
