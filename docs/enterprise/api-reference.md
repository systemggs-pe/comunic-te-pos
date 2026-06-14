# API Reference

## Overview

The API layer is implemented with Netlify Functions and exposed through Netlify redirects in `netlify.toml`.

All functions use POST requests. Browser clients call the API through `src/services/functionsClient.js`, which adds:

- `Content-Type: application/json`
- `Authorization: Bearer <Firebase ID token>`

## Base URL

In production when frontend and Netlify Functions are deployed together:

```text
/api/{function}
```

With `VITE_BACKEND_BASE_URL` configured:

```text
{VITE_BACKEND_BASE_URL}/api/{function}
```

Local development uses the Vite proxy to `http://127.0.0.1:{BACKEND_PORT}` when `VITE_BACKEND_BASE_URL` is empty.

## Shared Request Pipeline

Implemented in `netlify/functions/_shared.mjs`:

1. Build CORS headers from allowed origins.
2. Accept `OPTIONS`.
3. Require `POST`.
4. Require Firebase ID token.
5. Validate allowed and verified email.
6. Apply in-memory per-user rate limit.
7. Parse JSON body.
8. Run endpoint callback.
9. Log a structured JSON request result with `requestId`.
10. Return JSON with `X-Request-Id`.

Every response includes:

```http
X-Request-Id: request-correlation-id
```

The same ID is written to structured function logs and server-side audit events for critical writes.

## Shared Error Format

```json
{
  "error": "ERROR_CODE_OR_MESSAGE",
  "requestId": "request-correlation-id",
  "details": {
    "issues": [
      {"path": "field.path", "message": "VALIDATION_CODE"}
    ]
  }
}
```

`details` is only present for validation errors that include a payload.

## Endpoint Summary

| Method | URL | Function | Auth Required | Purpose |
|---|---|---|---|---|
| POST | `/api/reniec` | `reniec.mjs` | Yes | Lookup DNI data. |
| POST | `/api/analizarCajaGemini` | `analizarCajaGemini.mjs` | Yes | OCR phone box image. |
| POST | `/api/registros` | `registros.mjs` | Yes | Create, update, delete and unlock registrations. |
| POST | `/api/ventas` | `ventas.mjs` | Yes | Create, update and delete sales. |
| POST | `/api/clientes` | `clientes.mjs` | Yes | Update and delete customers. |
| POST | `/api/legalConsent` | `legalConsent.mjs` | Yes | Record legal consent. |

## Authentication Requirements

All endpoints require:

```http
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

The authenticated user must:

- Have `emailVerified == true`.
- Have email in configured `ALLOWED_EMAILS` or fallback default allowlist.

## POST /api/reniec

Looks up DNI data using the external RENIEC provider.

### Request Body

```json
{
  "dni": "40000000"
}
```

Validation:

- `dni` is validated by `parseDniPayload`.
- Currently supports the generic document schema, but the external endpoint is DNI-specific.

### Success Response

```json
{
  "success": true,
  "source": "RENIEC_NETLIFY",
  "result": {
    "document_number": "40000000",
    "first_name": "NOMBRES",
    "first_last_name": "APELLIDO_PATERNO",
    "second_last_name": "APELLIDO_MATERNO",
    "full_name": "APELLIDO PATERNO APELLIDO MATERNO NOMBRES",
    "address": "",
    "phone": "",
    "email": ""
  }
}
```

### Errors

| Status | Error | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body. |
| 401 | `No autorizado` or `Sesion invalida` | Missing or invalid token. |
| 403 | `No autorizado` | Email not verified or not allowed. |
| 429 | rate limit message | Too many requests. |
| 500 | `RENIEC_TOKEN_MISSING` | Missing provider token. |
| upstream status | `RENIEC_UPSTREAM_ERROR` or provider message | External API failure. |

### Rate Limit

```js
{name: 'reniec', max: 60, windowMs: 60 * 1000}
```

## POST /api/analizarCajaGemini

Analyzes a phone box image with Gemini OCR.

### Request Body

```json
{
  "imageBase64": "<jpeg-base64-without-data-prefix>"
}
```

### Success Response

Raw Gemini response is returned. The frontend reads:

```text
candidates[0].content.parts[0].text
```

Expected model text is JSON shaped like:

```json
{
  "imei1": "",
  "imei2": "",
  "sn": "",
  "marca": "",
  "modelo": "",
  "nombreComercial": "",
  "ram": "",
  "memoria": "",
  "color": ""
}
```

### Errors

| Status | Error | Cause |
|---|---|---|
| 400 | `Falta imageBase64` | No image sent. |
| 401/403 | Auth errors | Invalid or unauthorized user. |
| 429 | rate limit message | Too many requests. |
| 500 | `Falta configurar GEMINI_API_KEY` | Missing Gemini key. |
| upstream status | `GEMINI_UPSTREAM_ERROR` or provider message | Gemini failure. |

### Rate Limit

```js
{name: 'gemini', max: 15, windowMs: 60 * 1000}
```

## POST /api/registros

Handles registration operations.

### Actions

| Action | Body requirement | Purpose |
|---|---|---|
| `create` | `cliente`, `equipo`, `registro` | Create registration and update related records. |
| `update` | `id`, `cliente`, `equipo`, `registro` | Update registration and related records. |
| `delete` | `id` | Delete registration and clean orphaned records. |
| `unlock` | `id` | Set registration status to `NO BLOQUEADO`. |

### Create Request

```json
{
  "action": "create",
  "cliente": {
    "tipoDocumento": "DNI",
    "dni": "40000000",
    "nombre": "CLIENTE",
    "celular": "999999999",
    "celularRef": "999999999",
    "correo": "cliente@example.com",
    "direccion": "DIRECCION",
    "celulares": [],
    "correos": []
  },
  "equipo": {
    "idEquipo": "123456789012345",
    "idDuenio": "40000000",
    "imei2": "",
    "sn": "",
    "marca": "SAMSUNG",
    "modelo": "SM-A000",
    "nombreComercial": "GALAXY",
    "isRegistrado": true,
    "imei1Registrado": true,
    "imei2Registrado": false
  },
  "registro": {
    "tipoDocumentoCliente": "DNI",
    "dniCliente": "40000000",
    "celularCliente": "999999999",
    "celularRef": "999999999",
    "imeiEquipo": "123456789012345",
    "imeiRegistrado": "123456789012345",
    "imei2Equipo": "",
    "modeloEquipo": "SM-A000",
    "marcaEquipo": "SAMSUNG",
    "nombreComercialEquipo": "GALAXY",
    "estado": "NO BLOQUEADO",
    "operador": "BITEL",
    "tipo": "TIENDA",
    "precio": "50.00",
    "fecha": "2026-05-20T10:00:00.000Z",
    "pdfDniUrl": "",
    "pdfCajaUrl": "",
    "pdfReciboUrl": ""
  }
}
```

### Create Response

```json
{
  "id": "firestore-doc-id",
  "registro": {
    "id": "firestore-doc-id",
    "nRegistro": "RECO-00001"
  }
}
```

The response includes the full registration data.

### Errors

| Status | Error | Cause |
|---|---|---|
| 400 | `ACTION_INVALIDA` | Unknown action. |
| 400 | `VALIDATION_ERROR` | Zod validation failed. |
| 404 | `REGISTRO_NOT_FOUND` | Update/unlock target missing. |
| 401/403 | Auth errors | Invalid or unauthorized user. |
| 429 | rate limit message | Too many requests. |

### Rate Limit

```js
{name: 'registros', max: 120, windowMs: 60 * 1000}
```

## POST /api/ventas

Handles sale operations.

### Actions

| Action | Body requirement | Purpose |
|---|---|---|
| `create` | `cliente`, `equipo`, `venta` | Create sale and update related records. |
| `update` | `id`, `cliente`, `equipo`, `venta` | Update sale and related records. |
| `delete` | `id` | Delete sale and clean orphaned records. |

### Create Request

```json
{
  "action": "create",
  "cliente": {
    "tipoDocumento": "DNI",
    "dni": "40000000",
    "nombre": "CLIENTE",
    "celular": "999999999",
    "correo": "cliente@example.com",
    "celulares": [],
    "correos": []
  },
  "equipo": {
    "idEquipo": "123456789012345",
    "idDuenio": "40000000",
    "imei2": "",
    "sn": "",
    "nombreComercial": "GALAXY",
    "marca": "SAMSUNG",
    "modelo": "SM-A000",
    "ram": "8",
    "memoria": "256",
    "color": "NEGRO",
    "isVendido": true
  },
  "venta": {
    "tipoDocumentoCliente": "DNI",
    "dniCliente": "40000000",
    "imeiEquipo": "123456789012345",
    "imei2Equipo": "",
    "sn": "",
    "modeloEquipo": "SM-A000",
    "marcaEquipo": "SAMSUNG",
    "nombreComercial": "GALAXY",
    "ram": "8",
    "memoria": "256",
    "color": "NEGRO",
    "precio": "1000.00",
    "medioPago": "EFECTIVO",
    "precioEquipo": "1000.00",
    "itemsAdicionales": [],
    "fecha": "2026-05-20T10:00:00.000Z"
  }
}
```

### Create Response

```json
{
  "id": "firestore-doc-id",
  "venta": {
    "id": "firestore-doc-id",
    "nVenta": "VEN-0001"
  }
}
```

### Errors

| Status | Error | Cause |
|---|---|---|
| 400 | `ACTION_INVALIDA` | Unknown action. |
| 400 | `VALIDATION_ERROR` | Zod validation failed. |
| 404 | `VENTA_NOT_FOUND` | Update target missing. |
| 401/403 | Auth errors | Invalid or unauthorized user. |
| 429 | rate limit message | Too many requests. |

### Rate Limit

```js
{name: 'ventas', max: 120, windowMs: 60 * 1000}
```

## POST /api/clientes

Handles customer update and delete operations.

### Actions

| Action | Body requirement | Purpose |
|---|---|---|
| `update` | `cliente` | Update customer contact profile. |
| `delete` | `dni` | Delete customer record and optionally orphaned equipment. |

### Update Request

```json
{
  "action": "update",
  "cliente": {
    "tipoDocumento": "DNI",
    "dni": "40000000",
    "nombre": "CLIENTE",
    "celular": "999999999",
    "celularRef": "999999999",
    "correo": "cliente@example.com",
    "direccion": "DIRECCION",
    "celulares": ["999999999"],
    "correos": ["cliente@example.com"]
  }
}
```

### Update Response

```json
{
  "cliente": {
    "id": "40000000",
    "dni": "40000000"
  }
}
```

### Delete Request

```json
{
  "action": "delete",
  "dni": "40000000"
}
```

### Delete Response

```json
{
  "deleted": true
}
```

### Rate Limit

```js
{name: 'clientes', max: 120, windowMs: 60 * 1000}
```

## POST /api/legalConsent

Records legal acceptance evidence after authentication.

### Request Body

```json
{
  "accepted": true,
  "acceptedAt": "2026-05-26T10:00:00.000Z",
  "documentVersion": "2026.05.26",
  "documents": [
    {
      "slug": "privacy-policy",
      "title": "Politica de Privacidad",
      "version": "2026.05.26",
      "updatedAt": "2026-05-26"
    }
  ],
  "cookiePreferences": {
    "essential": true,
    "analytics": false,
    "marketing": false
  },
  "timezone": "America/Lima",
  "locale": "es-PE",
  "source": "pre-login-gate"
}
```

The server requires all slugs listed in `REQUIRED_DOCUMENTS`.

### Success Response

```json
{
  "ok": true,
  "consentId": "uid_2026.05.26",
  "documentVersion": "2026.05.26"
}
```

### Errors

| Status | Error | Cause |
|---|---|---|
| 400 | `LEGAL_CONSENT_REQUIRED` | `accepted` is not true. |
| 400 | `LEGAL_DOCUMENTS_INCOMPLETE` | Required document slug missing. |
| 409 | `LEGAL_VERSION_MISMATCH` | Client version does not match server version. |
| 401/403 | Auth errors | Invalid or unauthorized user. |
| 429 | rate limit message | Too many requests. |

### Rate Limit

```js
{name: 'legalConsent', max: 20, windowMs: 60 * 1000}
```
