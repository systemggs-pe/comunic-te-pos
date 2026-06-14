# Developer Guide

## Onboarding Checklist

1. Read [System Overview](system-overview.md).
2. Read [Architecture](architecture.md).
3. Install dependencies with `npm install`.
4. Create `.env` from `.env.example`.
5. Run `npm run dev`.
6. Verify Firebase Auth login with an allowed account.
7. Verify local API warnings from `scripts/local-api.mjs`.
8. Run `npm run lint`.
9. Review `firestore.rules` before changing any data path.
10. Read [API Reference](api-reference.md) before changing function payloads.

## Development Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start local API adapter and Vite. |
| `npm run dev:vite` | Start Vite only. |
| `npm run dev:api` | Start local API adapter only. |
| `npm run dev:netlify` | Run Netlify local dev. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Build production assets. |
| `npm audit` | Check dependency vulnerabilities. |

## Coding Conventions

Current conventions:

- React function components.
- ES modules.
- Tailwind utility classes plus project CSS classes.
- Domain-specific modules under `src/features`.
- API calls centralized in `src/services/functionsClient.js`.
- Firebase app initialization in `src/lib/firebase.js`.
- Server-side schemas in `netlify/functions/_validators.mjs`.

Recommended conventions:

- Keep server-side validation authoritative.
- Avoid adding direct Firestore writes unless rules are reviewed.
- Prefer feature-local utilities only when they are not shared.
- Put shared domain logic in `src/utils` or a future `src/domain`.
- Keep UI components small and reusable.
- Avoid disabling lint rules unless there is a documented reason.

## How to Add a New Feature Module

Recommended steps:

1. Create feature folder:

```text
src/features/{featureName}/
```

2. Add UI components and feature-specific utilities.

3. If the feature needs backend writes, add a Netlify Function:

```text
netlify/functions/{featureName}.mjs
```

4. Add Zod schemas to `_validators.mjs` or a new feature validator module.

5. Add frontend client function in:

```text
src/services/functionsClient.js
```

6. Add redirect in:

```text
netlify.toml
```

7. Add Firestore rules if the client reads or writes new collections.

8. Add indexes if queries require ordering/filtering combinations.

9. Lazy-load the feature in `src/app/App.jsx` if it is a major screen.

10. Document the feature in this docs directory.

## How to Add an API Action

Example for an existing endpoint:

1. Define the action string.
2. Add schema validation.
3. Parse payload inside function dispatcher.
4. Run Firestore transaction or write.
5. Return compact JSON.
6. Map frontend error in `obtenerMensajeErrorFuncion` if needed.
7. Update [API Reference](api-reference.md).

Rules:

- Never trust client validation.
- Validate all IDs.
- Keep enum values explicit.
- Keep transaction boundaries small.
- Do not expose secrets or upstream raw errors unnecessarily.

## Firestore Development Rules

Before adding a collection:

- Define document ID strategy.
- Define read/write owner.
- Decide if writes are client-side or function-mediated.
- Add Firestore rules.
- Add indexes.
- Add documentation in [Data Model](data-model.md).

For core business data, prefer server-mediated writes.

## UI Development Guidelines

Use existing classes before inventing new styling:

- `.saas-primary`
- `.saas-secondary`
- `.saas-icon-button`
- `.saas-list-shell`
- `.saas-form-shell`
- `.saas-table`
- `.saas-detail-modal`

Product UI principles:

- Keep workflows dense but readable.
- Make primary actions obvious.
- Use confirmation modals for destructive actions.
- Preserve mobile workflows.
- Avoid decorative complexity in operational screens.
- Keep labels explicit and field validation immediate.

## Validation Guidelines

Client validation:

- Good for immediate feedback.
- Must mirror server rules where practical.
- Must not be the only enforcement.

Server validation:

- Zod schemas are the source of truth for API writes.
- Validate document numbers, phone, email, IMEI, money and dates.
- Use `.strict()` for nested objects where possible.

## Current Technical Debt to Respect

Important areas to avoid worsening:

- `src/app/App.jsx` is large and owns many responsibilities.
- `RegistroForm.jsx` and `VentaForm.jsx` are large and mix UI/domain logic.
- Email allowlist is duplicated.
- Some data views use paginated data as if complete.
- Tests are not implemented yet.

When changing these areas, keep changes scoped and add tests as soon as the test framework exists.

## Recommended Branch and Review Workflow

Recommended enterprise workflow:

1. Create branch per feature/fix.
2. Run lint locally.
3. Run tests once configured.
4. Run build before deployment PRs.
5. Include screenshots for UI changes.
6. Include API payload examples for backend changes.
7. Include Firestore rule/index changes in the same PR as data model changes.
8. Update docs with behavior changes.

