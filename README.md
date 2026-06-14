# COMUNIC@TE Enterprise SaaS Documentation

COMUNIC@TE is an operational SaaS platform for device registration, equipment sales, customer records, foreign receipt generation, legal consent capture and PDF ticket/receipt workflows. The product runs under the GGS software ecosystem:

- `GGS`: parent company and corporate ecosystem.
- `GGS SYSTEMS`: commercial software brand and SaaS operator.
- `GGS CODE`: engineering, architecture, security and delivery division.
- `COMUNIC@TE`: operational product inside the GGS SYSTEMS portfolio.

This repository is a Vite + React application backed by Firebase Auth, Firestore and Netlify Functions. The canonical backend is `netlify/functions`; Firebase Cloud Functions are not used.

## Documentation Index

| Document | Purpose |
|---|---|
| [Enterprise Index](docs/enterprise/INDEX.md) | Entry point for all professional documentation. |
| [System Overview](docs/enterprise/system-overview.md) | Product purpose, modules, workflows and stack. |
| [Architecture](docs/enterprise/architecture.md) | Folder structure, frontend/backend/data architecture and diagrams. |
| [Frontend](docs/enterprise/frontend.md) | React surfaces, navigation, state, UI system and responsive behavior. |
| [Functional Specification](docs/enterprise/functional-specification.md) | Business modules, user journeys and operational rules. |
| [API Reference](docs/enterprise/api-reference.md) | Netlify endpoints, request bodies, responses, auth and errors. |
| [Data Model](docs/enterprise/data-model.md) | Firestore collections, relationships, indexes and data flows. |
| [Security](docs/enterprise/security.md) | Authentication, authorization, validation, rate limits and hardening. |
| [Deployment and DevOps](docs/enterprise/deployment-devops.md) | Local setup, builds, hosting, deployment and production operations. |
| [Configuration](docs/enterprise/configuration.md) | Environment variables, secrets and external APIs. |
| [Business and Legal Architecture](docs/enterprise/business-legal.md) | Corporate ownership, legal documents and compliance model. |
| [Developer Guide](docs/enterprise/developer-guide.md) | Onboarding, conventions, module development and maintenance. |
| [Troubleshooting](docs/enterprise/troubleshooting.md) | Common errors, debugging flows and quick fixes. |
| [Maintenance and Scalability](docs/enterprise/maintenance-and-scalability.md) | Future enterprise roadmap, scale plan and technical debt. |

Existing specialized documents:

- [Brand Architecture](docs/brand-architecture.md)
- [Legal Compliance Architecture](docs/legal-compliance-architecture.md)
- [Enterprise SaaS Audit PDF](docs/auditoria-enterprise-saas-comunicate-2026-05-20.pdf)

## Current Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 3 |
| UI Icons | lucide-react |
| Authentication | Firebase Auth with Google provider |
| Database | Firestore |
| Backend | Netlify Functions |
| Server validation | Zod |
| Admin SDK | firebase-admin |
| PDF generation | jsPDF, JsBarcode, local PDF417 script |
| External APIs | RENIEC provider, Gemini OCR |
| Hosting | Netlify for app/functions, Firebase Hosting configuration also present |

## Quick Start

Install dependencies:

```bash
npm install
```

Create local environment values from `.env.example`:

```bash
cp .env.example .env
```

Run the app with local API proxy:

```bash
npm run dev
```

Run only the Vite frontend:

```bash
npm run dev:vite
```

Run only the local API adapter:

```bash
npm run dev:api
```

Run lint:

```bash
npm run lint
```

Build production assets:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Canonical Backend

The active backend is `netlify/functions`.

| Function | Responsibility |
|---|---|
| `reniec.mjs` | DNI lookup through external RENIEC provider. |
| `analizarCajaGemini.mjs` | OCR for phone box images through Gemini. |
| `registros.mjs` | Create, update, delete and unlock equipment registrations. |
| `ventas.mjs` | Create, update and delete equipment sales. |
| `clientes.mjs` | Update and delete customer records. |
| `legalConsent.mjs` | Record authenticated legal consent evidence. |
| `_shared.mjs` | CORS, auth, body parsing, JSON responses and in-memory rate limiting. |
| `_validators.mjs` | Zod schemas for server-side validation. |
| `_firebaseAdmin.mjs` | Firebase Admin initialization. |

## Repository Hygiene

The canonical runtime paths are `src/` for the React app and `netlify/functions/` for backend actions. The following paths are present or may appear locally, but they are not the active backend:

| Path | Current status | Maintenance decision |
|---|---|---|
| `backend/` | Empty local placeholder. | Do not add runtime code here unless architecture changes. It can be removed in a cleanup-only task. |
| `functions/` | Legacy/local Firebase Functions area. Only `functions/.gitignore` is tracked; local `.env`, `node_modules` or `src` content is not canonical. | Keep secrets out of git. Prefer `netlify/functions/` for backend code. |
| `deno.lock` | Netlify Edge/bootstrap lock artifact. | Keep only while Netlify tooling requires it; remove in a separate cleanup task if no Edge/runtime dependency remains. |
| `.agents/` | Versioned Codex/agent skill assets, currently used for design workflow assistance. | Not app runtime. Do not treat as production source code. |

## Deployment Summary

Netlify builds the frontend and serves Netlify Functions:

```bash
npm run build
```

Firestore rules and indexes are deployed separately:

```bash
npx firebase deploy --only firestore
```

Do not deploy Firebase Functions for this project unless the architecture changes.

## Production Notes

- Keep `.env` and `functions/.env` out of version control.
- Configure production secrets in Netlify environment variables.
- Review `firestore.rules` before adding any new client-side write path.
- API writes for registrations, sales and customers should remain server-mediated through Netlify Functions.
- Legal documents define the current Peru/Tacna/domain baseline in `src/config/legal.js`; counsel should still confirm formal registration, tax, retention and provider-processing obligations before public production use.
