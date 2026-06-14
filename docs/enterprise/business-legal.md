# Business and Legal Architecture

## Corporate Structure

COMUNIC@TE is documented as part of the GGS ecosystem.

| Entity | Role |
|---|---|
| `GGS` | Parent company and corporate ecosystem. |
| `GGS SYSTEMS` | Commercial software brand and SaaS operator. |
| `GGS CODE` | Engineering, architecture, development, security and delivery division. |
| `COMUNIC@TE` | Operational SaaS product within the GGS SYSTEMS portfolio. |

Source:

```text
src/config/branding.js
docs/brand-architecture.md
```

## Brand Ownership Model

Current language:

```text
COMUNIC@TE operates under GGS SYSTEMS, with engineering and delivery by GGS CODE.
```

Recommended legal interpretation:

- `GGS` owns or governs the parent ecosystem.
- `GGS SYSTEMS` commercializes or operates the software product line.
- `GGS CODE` is the technical delivery and engineering unit.
- `COMUNIC@TE` is the product name and operational SaaS surface.

Final ownership language should be reviewed by counsel and matched to the real company registration.

## Product Ownership

Current legal document copy states that the interface, code, architecture, flows, components, documentation and visual elements belong to the GGS SYSTEMS ecosystem with engineering by GGS CODE, except third-party libraries under their own licenses.

Source:

```text
src/config/legal.js
```

## Legal Document Registry

Configured in:

```text
src/config/legal.js
```

Version:

```text
2026.05.26
```

Effective date:

```text
2026-05-26
```

Documents:

| Slug | Purpose |
|---|---|
| `privacy-policy` | Privacy policy. |
| `terms-and-conditions` | Contract terms. |
| `terms-of-use` | Acceptable use rules. |
| `legal` | Legal notice. |
| `cookies` | Cookie policy. |
| `copyright` | Copyright and IP terms. |
| `community-guidelines` | Anti-abuse and sanctions. |

Required acceptance set:

```js
[
  'terms-and-conditions',
  'privacy-policy',
  'terms-of-use',
  'cookies',
  'copyright',
  'community-guidelines'
]
```

## Consent Capture

Implemented flow:

1. User checks legal acceptance on login page.
2. Acceptance timestamp is stored locally for the active legal version.
3. User signs in with Google.
4. Server validates authenticated user.
5. Server validates active document version and required document slugs.
6. Consent is written to Firestore.
7. Consent event is written to a subcollection.

Consent collection:

```text
artifacts/comunicate-pos/users/shared/legalConsents/{uid}_{documentVersion}
```

Subcollection:

```text
events/{eventId}
```

Captured evidence:

- UID.
- Email.
- Document version.
- Required document snapshot.
- Client acceptance time.
- Server acceptance time.
- Cookie preferences.
- IP address from headers.
- User agent.
- Locale.
- Timezone.
- Source.

## Cookie Consent

Implemented categories:

- Essential.
- Analytics.
- Marketing.

Non-essential categories default to false. Preferences are stored in browser localStorage and sent during legal consent recording.

## Legal Baseline and Required Review

Current legal configuration defines:

- Country: Peru.
- Jurisdiction: Republic of Peru with operational reference in Tacna.
- Domain: `https://comunicate-tacna.web.app`.
- Operational address: Galerias de Gamarra Int. 1B, Tacna, Peru.
- Privacy framework: Ley N. 29733 and Decreto Supremo N. 016-2024-JUS.
- Data rights: ARCO, with GDPR rights when applicable.
- Provider list: Firebase/Google Cloud, Netlify, RENIEC/Codart and Google Gemini where each function is used.

Before broad production publication:

- Confirm formal legal entity registration and tax data.
- Confirm whether the operational address is also the formal legal domicile.
- Confirm privacy law obligations for Peru and any user/customer jurisdictions.
- Define retention schedules.
- Confirm processor/subprocessor contracts.
- Document RENIEC, Codart and Gemini data processing.
- Confirm customer data rights process.
- Review consumer/tax/receipt rules for the foreign receipt workflow.

## Enterprise Compliance Roadmap

| Area | Recommendation |
|---|---|
| Privacy | Formal privacy notice with data categories, basis, retention and rights process. |
| Data Processing | DPA/subprocessor register for Firebase, Netlify, Google/Gemini and RENIEC provider. |
| Consent | Versioned legal content hash, immutable consent events and export function. |
| Audit | Event log for create/update/delete/unlock/sale/receipt actions. |
| Access | RBAC, tenant isolation and account lifecycle policy. |
| Retention | Define retention/deletion rules for customers, equipment, logs and consent evidence. |
| Incident Response | Define breach notification workflow and owner. |
