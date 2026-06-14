# Functional Specification

## Scope

This document describes implemented functionality based on the current codebase. It does not include future features unless explicitly marked as a recommendation.

## User Roles

Current implementation has one effective role:

| Role | Current mechanism | Capabilities |
|---|---|---|
| Authorized operator | Google account email allowlist | Access app, read shared data, perform allowed operations. |

There is no implemented role hierarchy such as admin, manager, cashier or auditor. There is no implemented self-service registration.

## Authentication Flow

1. User opens app.
2. User accepts required legal documents in the login screen.
3. User clicks Google login.
4. Firebase Auth performs Google sign-in.
5. Frontend checks if email is in `EMAILS_PERMITIDOS`.
6. Server records legal consent through `/api/legalConsent`.
7. User enters dashboard.

## Dashboard

The dashboard displays:

- Total registrations.
- Total sales.
- Total customers currently loaded.
- Shortcuts to create registration, create sale and open customer directory.

Data source:

- `getCountFromServer` for registrations and sales.
- Loaded `clientes.length` for customer count.

## Registration Workflow

Purpose: create and maintain device registration records.

### New Registration

Steps:

1. Operator enters customer document type and number.
2. If customer exists locally, contact data can prefill.
3. If document is DNI and length is 8, RENIEC lookup can fill name/address/email if provider returns values.
4. Operator enters or selects equipment.
5. Operator can open scanner to capture phone box data through Gemini OCR.
6. Operator validates IMEI through Luhn feedback.
7. Operator enters carrier, status, type, price and date.
8. Operator confirms.
9. Frontend posts `/api/registros` with `action=create`.
10. Backend validates payload and writes cliente, equipo, registro and counter in a transaction.

### Edit Registration

Steps:

1. Operator selects an existing registration.
2. Form initializes from registration, customer and equipment data.
3. Operator edits data.
4. Frontend posts `/api/registros` with `action=update`.
5. Backend updates current registration and associated customer/equipment data.

### Delete Registration

Steps:

1. Operator selects delete.
2. Confirmation modal appears.
3. Frontend posts `/api/registros` with `action=delete`.
4. Backend deletes the registration and may remove orphaned equipment/customer records.

### Unlock Registration

The `unlock` action changes `estado` to `NO BLOQUEADO`.

## Sales Workflow

Purpose: create and maintain equipment sale records.

### New Sale

Steps:

1. Operator enters customer document and name.
2. Existing customers can prefill contact data.
3. DNI can trigger RENIEC lookup.
4. Operator enters equipment information or uses scanner.
5. Operator enters price and payment method.
6. Operator can add accessory items.
7. Operator confirms.
8. Frontend posts `/api/ventas` with `action=create`.
9. Backend writes sale, customer, equipment and counter.
10. Frontend prompts for ticket printer width and generates PDF.

### Edit Sale

The edit flow updates sale, customer and equipment data through `/api/ventas` with `action=update`.

### Delete Sale

The delete flow calls `/api/ventas` with `action=delete` and may remove orphaned equipment/customer records according to backend logic.

## Customer Directory

Purpose:

- Search customers by document, name, IMEI, model, commercial name or serial number.
- Display top operational customers when no search term is entered.
- Show customer sales, registrations, associated equipment and total income.
- Edit contact data.
- Delete customer record where allowed by business rules.

Important current limitation:

- The directory calculates operational history from the records currently loaded in the frontend. At scale, this must move to server-side queries or aggregates.

## Foreign Receipt Workflow

Purpose: generate Chile-oriented receipt PDFs from existing sales or manual entries.

Modes:

- `Buscar por DNI`: find a customer, select sales, convert totals to CLP and generate receipt.
- `Nueva Boleta`: manually enter customer and equipment data.
- `Historial`: view and reprint saved receipts.

Current data writes:

- Receipt history writes directly from the client to `boletasExtranjeras`.
- Receipt counter writes directly from the client to `configuracion/contadorBoletas`.

Enterprise recommendation:

- Move receipt emission to a server function for stronger validation, auditability and counter control.

## OCR Scanner

Purpose:

- Capture phone box images using browser camera.
- Send compressed JPEG base64 to `/api/analizarCajaGemini`.
- Parse Gemini JSON response.
- Normalize IMEI, serial, brand, model, memory, RAM and color.

Current constraints:

- Requires camera permissions and secure context.
- Uses a floating scanner panel.
- Server-side function currently assumes JPEG payload.

## Legal and Cookie Workflow

Implemented:

- Legal document pages for privacy, terms, cookies, copyright, anti-abuse and legal notice.
- Cookie preference banner with essential, analytics and marketing categories.
- Mandatory legal acceptance before login.
- Server-side consent recording after authentication.

Important compliance note:

- Legal text defines the current Peru/Tacna/domain baseline. Formal entity registration, tax data, processor contracts and retention schedules require legal review before broad production publication.
