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
| `GEMINI_API_KEY` | Required for OCR | functions | Google Gemini API key. |
| `GEMINI_MODEL` | Optional | functions | Gemini model name. Defaults to `gemini-2.0-flash`. |

## Safe Example

```env
BACKEND_PORT=3001
VITE_BACKEND_BASE_URL=
FIREBASE_API_KEY=your-firebase-web-api-key
ALLOWED_EMAILS=operator1@example.com,operator2@example.com
ALLOWED_ORIGINS=https://your-production-domain.example
RENIEC_TOKEN=your-reniec-token
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
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

### Gemini

Variables:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

Used by:

```text
netlify/functions/analizarCajaGemini.mjs
```

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

