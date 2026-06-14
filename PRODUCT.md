# PRODUCT.md

## Product Register

`product`

COMUNIC@TE is a private operational SaaS for authorized staff who manage mobile device registrations, equipment sales, customer history, ticket PDFs, foreign receipts and legal consent evidence.

The product belongs to the GGS software ecosystem:

- `GGS`: parent company and corporate ecosystem.
- `GGS SYSTEMS`: commercial software brand and SaaS operator.
- `GGS CODE`: engineering, architecture, security and delivery division.
- `COMUNIC@TE`: operational product inside the GGS SYSTEMS portfolio.

## Users

Primary user:

- Authorized operator: store or operations staff who need to enter customer, equipment, payment and receipt data quickly and accurately.

Secondary stakeholders:

- Business owner or manager: reviews totals, customer history, operational issues and compliance posture.
- Developer or maintainer: ships fixes, audits data flows and keeps Firestore rules/API boundaries aligned.
- Legal/compliance reviewer: checks consent, privacy, cookie and receipt workflows before production publication.

## Product Purpose

COMUNIC@TE centralizes workflows that would otherwise be split across spreadsheets, messaging apps, manual tickets and disconnected customer records.

Core outcomes:

- Register equipment with IMEI, customer, carrier, status, type, price and date.
- Record device sales, accessory sales and payment method.
- Maintain searchable customer and equipment history.
- Generate thermal sale tickets and foreign receipt PDFs.
- Query RENIEC for DNI assistance.
- Extract phone box information with OCR to reduce manual entry errors.
- Capture legal acceptance and cookie preferences.
- Track app/web problems, affected files, solutions and changelog entries.

## Product Principles

- Speed matters, but not at the expense of validation.
- Server-side validation is authoritative for sensitive writes.
- The interface should feel operational, dense and calm, not like a marketing site.
- Search and customer history must avoid partial-data assumptions wherever possible.
- Every generated document should preserve enough context for later review.
- Legal and security surfaces should be explicit, auditable and conservative.
- Maintenance work should leave a problem trail: issue, impact, files, solution and resolved status.

## Core Flows

### Authentication

1. User accepts required legal documents.
2. User signs in with Google.
3. App checks email allowlist.
4. API records legal consent evidence.
5. User enters the dashboard.

### Registration

1. Operator enters document data and customer contact details.
2. Existing customer data or RENIEC data can prefill fields.
3. Operator enters IMEI, serial, brand, model, commercial name and device status.
4. OCR scanner can extract box information.
5. Client validation guides the operator.
6. Netlify Function validates and writes customer, equipment and registration data.

### Sales

1. Operator enters customer and equipment data.
2. Existing customer/equipment data can prefill fields.
3. Operator adds payment method, equipment price and optional accessories.
4. Netlify Function validates and writes the sale.
5. App generates a thermal ticket PDF.

### Customer Directory

1. Operator searches by document, name, IMEI, model, commercial name or serial number.
2. App shows operational customer history.
3. Operator can update or delete customer contact records where allowed.

### Foreign Receipts

1. Operator searches existing sales or creates a manual receipt.
2. App selects one of three configured receipt formats.
3. App generates a PDF and stores receipt history.
4. Configurable issuer data controls name, address and RUT per format.

### Problems and Changelog

1. Operator or maintainer creates a problem with severity, details, affected file paths and proposed solution.
2. Pending problems stay visible for follow-up.
3. When solved, the app records a changelog entry.
4. The issue can be shared/copied with problem, detail, route and solution.

## Tone

- Direct, operational and concrete.
- Spanish-first for app UI labels used by operators.
- Avoid decorative or vague language.
- Use "problema", "detalle", "solucion", "resuelto", "registro", "venta", "cliente" consistently.
- Error messages should tell the operator what to fix, not blame the operator.

## Non-Goals

- Public landing page.
- Self-service user registration.
- Multi-tenant organization management.
- Role hierarchy beyond the current allowlisted operator model.
- Replacing legal review with generated legal text.

## Known Product Risks

- Automated tests currently cover IMEI lock concurrency; broader unit and integration coverage is still needed.
- Firestore rules must be deployed whenever new direct client write paths are added.
- Legal documents define the current Peru/Tacna/domain baseline; formal company registration, tax data, provider contracts and retention schedules still require professional legal review.
- Current authorization is allowlist-based, not role-based.
- Some advanced operational reporting still depends on query and aggregation maturity.

## Success Criteria

- Operators can complete a registration or sale without leaving the app.
- Historical customer, sale and registration data can be found reliably.
- Generated PDFs contain the correct customer, equipment, date and issuer context.
- Sensitive writes remain server-mediated unless Firestore rules explicitly validate the direct write.
- A maintainer can understand what changed, why, and which files were affected.
