# Maintenance and Scalability

## Current Maturity

COMUNIC@TE is currently a functional internal SaaS with a pragmatic architecture. It is suitable for a controlled user group, but it needs additional engineering before scaling to multiple organizations, stores, roles or audited enterprise clients.

## Primary Scale Risks

| Risk | Current cause | Impact |
|---|---|---|
| Tenant data mixing | All data under `users/shared`. | Cannot safely host multiple customers or stores. |
| Role limitations | Email allowlist only. | No manager/auditor/operator separation. |
| Data incompleteness | Client derives views from paginated arrays. | Search/KPIs/customer history may be incomplete. |
| Business integrity | IMEI uniqueness not locked server-side. | Duplicate operations possible. |
| Frontend complexity | Large app/forms with mixed responsibilities. | Harder maintenance and regression risk. |
| No tests | No `test` script. | High risk when changing business logic. |
| Limited observability | Console logs only. | Slow incident response. |
| Repository ambiguity | `backend/`, `functions/`, `deno.lock` and `.agents/` can be mistaken for active runtime surfaces. | Confusion during onboarding, deployment or maintenance. |

## Repository Hygiene Backlog

The active backend remains `netlify/functions/`. Cleanup of non-canonical paths should be handled as a separate maintenance task, not mixed into feature work.

| Path | Current finding | Recommended action |
|---|---|---|
| `backend/` | Empty local placeholder. | Delete if no tooling depends on the directory. |
| `functions/` | Legacy Firebase Functions/local area; local `.env`, `node_modules` and `src` may exist but are not canonical. | Keep ignored local files out of git. Remove the directory after confirming no deployment script references it. |
| `deno.lock` | Netlify Edge/bootstrap lock artifact. | Remove only after confirming Netlify build/deploy does not regenerate or require it. |
| `.agents/` | Versioned agent skill assets for development assistance. | Keep if the team uses agent skills; otherwise move to external tooling documentation or remove in a dedicated cleanup PR. |

## Recommended Enterprise Roadmap

### Phase 1: Stabilize Core Integrity

Goals:

- Make business data trustworthy.
- Make access control explicit.
- Add minimum automated tests.

Actions:

1. Add `npm test` with Vitest.
2. Test document validation, IMEI Luhn, money calculations and Zod validators.
3. Implement IMEI locks in Firestore transactions.
4. Use Firebase Admin token verification with revocation check.
5. Add request IDs and structured function logs.
6. Add CSP/HSTS.

### Phase 2: Access Control and Tenant Model

Target Firestore path:

```text
organizations/{orgId}
+-- members/{uid}
+-- clientes/{clienteId}
+-- equipos/{imei}
+-- registros/{registroId}
+-- ventas/{ventaId}
+-- ...
```

Required concepts:

- Organization ID.
- Store/branch ID if needed.
- User roles.
- Permission matrix.
- Audit log.

Example role model:

| Role | Permissions |
|---|---|
| Owner | Manage org, users, settings, all data. |
| Admin | Manage operations and users except billing/ownership. |
| Operator | Create sales and registrations, read customers. |
| Auditor | Read-only access to logs and reports. |

### Phase 3: Server-Side Queries and Aggregates

Move these from client arrays to backend:

- Global search.
- Customer directory.
- Customer totals.
- Dashboard KPIs.
- Equipment history.
- Duplicate checks.

Recommended endpoints:

```text
POST /api/search
POST /api/dashboard
POST /api/clientes/query
POST /api/equipos/history
```

Recommended aggregate collections:

```text
customerStats/{dni}
equipmentStatus/{imei}
dailyStats/{yyyy-mm-dd}
```

### Phase 4: Frontend Modularization

Refactor targets:

- `src/app/App.jsx`
- `src/features/registros/RegistroForm.jsx`
- `src/features/ventas/VentaForm.jsx`
- `src/features/boletas/boletaPdf.js`

Recommended structure:

```text
src/
+-- domain/
|   +-- registros/
|   +-- ventas/
|   +-- clientes/
|   +-- documentos/
+-- hooks/
+-- repositories/
+-- services/
+-- features/
```

Candidate hooks:

- `useAuthSession`
- `useToast`
- `useDirtyFormGuard`
- `useCollectionPage`
- `useGlobalSearch`
- `useReniecLookup`
- `useScannerOcr`

### Phase 5: Observability and Operations

Add:

- Error reporting.
- Structured server logs.
- Request correlation ID.
- Audit event collection.
- Provider health checks.
- Usage metrics.
- Alerting for API failures and high error rates.

Audit event example:

```json
{
  "eventType": "REGISTRO_CREATED",
  "actorUid": "firebase-uid",
  "actorEmail": "user@example.com",
  "orgId": "org-id",
  "resourceType": "registro",
  "resourceId": "doc-id",
  "createdAt": "serverTimestamp",
  "metadata": {
    "imei": "123456789012345"
  }
}
```

## Performance Roadmap

Current heavy assets observed in build output:

- Firebase vendor chunk.
- jsPDF vendor chunk.
- html2canvas vendor chunk.
- React vendor chunk.
- JsBarcode vendor chunk.

Recommendations:

1. Use dynamic imports for PDF-only dependencies.
2. Avoid preloading PDF chunks on initial app load.
3. Split legal pages if public SEO matters.
4. Memoize maps by `dni` and `imei`.
5. Move customer directory and search to backend.
6. Add pagination to boleta history.
7. Use Firestore indexes for query paths.
8. Consider Cloud Functions/Cloud Run for heavy document generation if client performance degrades.

## Security Hardening Roadmap

Priority:

1. Custom claims.
2. Tenant paths.
3. Server-side permission checks.
4. Distributed rate limiting.
5. CSP.
6. Provider timeouts.
7. Payload size limits.
8. Secrets rotation policy.
9. Audit logs.
10. Automated dependency update process.

## Compliance Roadmap

Actions:

- Confirm formal legal entity, tax data, domicile, processor contracts and retention schedules.
- Review legal copy with counsel.
- Document subprocessors.
- Add retention schedules.
- Add data deletion/export workflow.
- Add incident response runbook.
- Add access review process.
- Add immutable audit events for critical operations.

## Testing Roadmap

Minimum test plan:

| Area | Tests |
|---|---|
| Utils | IMEI Luhn, document validation, currency conversion, dates. |
| Validators | Valid/invalid registration, sale, customer and legal consent payloads. |
| Functions | Auth failure, validation failure, success path with mocked Firestore. |
| Domain | IMEI lock behavior, counters, orphan cleanup. |
| UI | Critical form validation and navigation guard. |

Recommended tools:

- Vitest.
- React Testing Library.
- Firebase emulator or repository mocks.
- Playwright for critical end-to-end flows.

## Future Architecture Options

### Option A: Stay on Firebase and Netlify

Best if:

- Team wants fast iteration.
- Data volume is moderate.
- Realtime reads are valuable.

Needed improvements:

- Tenant paths.
- Server-side aggregates.
- Stronger authz.
- Better testing/monitoring.

### Option B: Move Backend to Cloud Run or Firebase Functions v2

Best if:

- Functions need longer runtime.
- PDF generation moves server-side.
- Provider integrations need richer retry/circuit logic.

### Option C: Next.js + PostgreSQL/Prisma

Best if:

- Product becomes multi-tenant enterprise SaaS with reporting, billing and complex relational queries.

Migration considerations:

- Model legal consents, users, organizations, customers, equipment, sales, registrations and audit events relationally.
- Preserve Firestore IDs or create migration mapping.
- Move realtime features selectively.
