# Enterprise Documentation Index

This directory contains the enterprise-grade technical, functional and operational documentation for COMUNIC@TE. It is written for developers, operators, auditors, investors, maintainers and internal onboarding.

## Product Documents

| Document | Audience | Description |
|---|---|---|
| [System Overview](system-overview.md) | Executives, clients, developers | High-level product purpose, problem, stack and modules. |
| [Functional Specification](functional-specification.md) | Product, operations, QA | Business capabilities and user journeys based on implemented code. |
| [Business and Legal Architecture](business-legal.md) | Leadership, legal, compliance | Corporate structure, ownership and legal consent model. |

## Technical Documents

| Document | Audience | Description |
|---|---|---|
| [Architecture](architecture.md) | Architects, senior engineers | Frontend/backend/data architecture, diagrams and responsibilities. |
| [Frontend](frontend.md) | Frontend developers, QA | React components, state, navigation, UI system and responsive behavior. |
| [API Reference](api-reference.md) | Backend/frontend developers | Netlify Functions contract, auth, payloads, responses and errors. |
| [Data Model](data-model.md) | Engineers, data owners | Firestore collections, relationships, indexes and business semantics. |
| [Security](security.md) | Security engineers, auditors | Authentication, authorization, validation, CORS, rate limits and hardening. |

## Operations Documents

| Document | Audience | Description |
|---|---|---|
| [Deployment and DevOps](deployment-devops.md) | DevOps, maintainers | Local setup, production deployment, hosting and operational checklist. |
| [Configuration](configuration.md) | Developers, DevOps | Environment variables, secrets and external API configuration. |
| [Developer Guide](developer-guide.md) | New developers | Onboarding, conventions, module extension and maintenance workflow. |
| [Troubleshooting](troubleshooting.md) | Support, developers | Common errors, diagnostics and recovery steps. |
| [Maintenance and Scalability](maintenance-and-scalability.md) | Architects, leadership | Enterprise roadmap, scale plan and technical debt strategy. |

## Source of Truth

The documentation is based on the current repository implementation:

- Frontend source: `src/`
- Canonical backend: `netlify/functions/`
- Firestore security rules: `firestore.rules`
- Firestore indexes: `firestore.indexes.json`
- Build and tooling: `package.json`, `vite.config.js`, `netlify.toml`, `firebase.json`
- Corporate branding: `src/config/branding.js`
- Legal document registry: `src/config/legal.js`

## Explicit Non-Goals

The current project does not implement:

- Next.js routing.
- Prisma or a relational database.
- Docker runtime.
- CI/CD pipeline files.
- Custom role-based access control.
- Multi-tenant organization isolation.
- A formal automated test suite.
- shadcn/ui components.

Where future-state designs mention these topics, they are labeled as recommendations or migration paths, not current functionality.

