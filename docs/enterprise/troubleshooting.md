# Troubleshooting

## Local API Not Available

Symptoms:

- UI shows `API local no disponible`.
- API request returns HTML instead of JSON.
- `BACKEND_NOT_DEPLOYED` or `BACKEND_INVALID_RESPONSE`.

Checks:

```bash
npm run dev:api
```

Verify:

- `BACKEND_PORT` is free.
- `.env` exists.
- `VITE_BACKEND_BASE_URL` is empty for local proxy mode.
- Vite proxy points to the same `BACKEND_PORT`.

## Missing Firebase Admin Config

Symptoms:

- API returns `FIREBASE_ADMIN_CONFIG_MISSING`.
- Registrations/sales/customer writes fail locally.

Fix:

Set one of these in `.env` or Netlify:

```env
FIREBASE_SERVICE_ACCOUNT={...}
```

or:

```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Invalid Firebase Service Account JSON

Symptoms:

- API returns `FIREBASE_SERVICE_ACCOUNT_INVALID`.

Fix:

- Ensure JSON is one line if stored in Netlify variable.
- Ensure private key newlines are escaped as `\\n`.
- Ensure no surrounding invalid quotes were copied.

## RENIEC Lookup Fails

Symptoms:

- `RENIEC_TOKEN_MISSING`.
- `RENIEC_UPSTREAM_ERROR`.
- DNI lookup returns no data.

Fix:

- Confirm `RENIEC_TOKEN` is configured.
- Confirm provider account is active.
- Confirm the request is authenticated.
- Check Netlify Function logs.
- Validate DNI format.

## Gemini OCR Fails

Symptoms:

- `Falta configurar GEMINI_API_KEY`.
- Gemini API key blocked message.
- Scanner says no text returned.

Fix:

- Confirm `GEMINI_API_KEY`.
- Confirm `GEMINI_MODEL`.
- Confirm image capture is valid JPEG base64.
- Check provider quota.
- Retry with clearer image.

## Camera Scanner Does Not Open

Symptoms:

- Browser denies camera.
- Message says camera only works in HTTPS/localhost.

Fix:

- Use HTTPS or localhost.
- Check browser camera permissions.
- Check system camera permissions.
- Review `Permissions-Policy` headers. Current headers deny camera globally and may need adjustment for scanner usage.

## Login Denied

Symptoms:

- `Acceso denegado. Tu correo no esta autorizado.`
- User signs in but app signs out.

Fix:

- Add email to all current allowlist locations:
  - `src/config/auth.js`
  - `netlify/functions/_shared.mjs` fallback or `ALLOWED_EMAILS`
  - `firestore.rules`
- Ensure Firebase email is verified.
- Redeploy Firestore rules and Netlify env/config as needed.

## Legal Consent Fails

Symptoms:

- Login succeeds but user is signed out.
- Toast says legal consent could not be recorded.
- API returns `LEGAL_VERSION_MISMATCH` or `LEGAL_DOCUMENTS_INCOMPLETE`.

Fix:

- Ensure frontend `LEGAL_DOCUMENT_VERSION` matches function `LEGAL_DOCUMENT_VERSION`.
- Ensure all required document slugs are sent.
- Check `/api/legalConsent` logs.
- Confirm Firebase Admin config is present.

## Firestore Permission Denied

Symptoms:

- Firestore realtime reads fail.
- Console shows permission errors.

Fix:

- Ensure user email is allowed in `firestore.rules`.
- Ensure email is verified.
- Confirm app ID path is `comunicate-pos`.
- Deploy rules:

```bash
npx firebase deploy --only firestore
```

## Build Fails

Fix checklist:

```bash
npm install
npm run lint
npm run build
```

If dependency or Vite errors occur:

- Delete `node_modules`.
- Reinstall with `npm install`.
- Confirm Node version compatibility.

## Lint Warnings

Current known warnings:

- `react-hooks/set-state-in-effect`
- `react-hooks/exhaustive-deps`

Affected areas:

- `RegistroForm.jsx`
- `VentaForm.jsx`
- `BoletaExtranjera.jsx`

Recommended fix:

- Move derived state to `useMemo` where possible.
- Use `useCallback` for async functions used in effects.
- Include missing dependencies or restructure effects.

## npm test Fails

Current reason:

- `package.json` does not define a `test` script.

Fix:

- Add test runner such as Vitest.
- Add script:

```json
"test": "vitest run"
```

## npm audit Reports Low Vulnerabilities

Current known issue:

- `@tootallnate/once` transitive vulnerability through Google Cloud dependencies used by `firebase-admin`.

Recommendation:

- Do not run `npm audit fix --force` blindly, because it may install a breaking downgrade.
- Track compatible `firebase-admin` updates.

## PDF Does Not Open

Symptoms:

- Browser blocks popup.
- PDF tab does not appear.

Fix:

- Allow popups for the site.
- Trigger PDF generation directly from user click.
- Check console for jsPDF/JsBarcode/PDF417 errors.

## Data Looks Incomplete

Symptoms:

- Search does not find older sales/registrations.
- Customer totals do not match expected historical data.

Reason:

- Some views operate on paginated frontend data.

Fix:

- Click "Cargar mas" where available.
- For enterprise accuracy, implement server-side search and aggregate endpoints.

