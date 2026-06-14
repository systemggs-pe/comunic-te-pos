# Legal compliance architecture

This project currently runs on Vite, React, Firebase Auth, Firestore and Netlify Functions. The production implementation added here follows the same runtime so the feature can ship without a platform migration.

## Implemented structure

- `src/config/legal.js`: legal document registry, versions, Peru/Tacna company baseline, privacy framework and required acceptance set.
- `src/features/legal/LegalDocumentPage.jsx`: responsive legal pages with automatic index, dark mode, SEO metadata and JSON-LD.
- `src/features/legal/LegalConsentGate.jsx`: accessible mandatory checkbox before login.
- `src/features/legal/CookieConsentBanner.jsx`: granular cookie consent for essential, analytics and marketing.
- `netlify/functions/legalConsent.mjs`: authenticated server-side consent recorder with rate limiting and IP/user-agent capture.
- `public/sitemap-legal.xml` and `public/_headers`: legal sitemap and baseline security headers.

## Firestore audit model

Collection:

```text
artifacts/comunicate-pos/users/shared/legalConsents/{uid}_{documentVersion}
```

Fields:

```json
{
  "uid": "firebase uid",
  "email": "user@example.com",
  "documentVersion": "2026.05.26",
  "documents": [{"slug": "privacy-policy", "version": "2026.05.26"}],
  "acceptedAtClient": "2026-05-26T10:00:00.000Z",
  "acceptedAt": "server timestamp",
  "ipAddress": "client ip from trusted headers",
  "userAgent": "browser user agent",
  "cookiePreferences": {"essential": true, "analytics": false, "marketing": false},
  "timezone": "America/Lima",
  "locale": "es-PE",
  "source": "pre-login-gate"
}
```

Every acceptance also writes a history event under:

```text
legalConsents/{consentId}/events/{eventId}
```

## Target Next.js, Prisma and PostgreSQL schema

For a future migration to Next.js, Prisma and PostgreSQL, use this equivalent model:

```prisma
model LegalDocumentVersion {
  id          String   @id @default(cuid())
  slug        String
  title       String
  version     String
  publishedAt DateTime
  contentHash String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@unique([slug, version])
}

model UserLegalConsent {
  id              String   @id @default(cuid())
  userId          String
  email           String
  documentVersion String
  documents       Json
  cookiePrefs     Json
  ipAddress       String?
  userAgent       String?
  locale          String?
  timezone        String?
  acceptedAt      DateTime @default(now())
  source          String

  @@index([userId, documentVersion])
}
```

## Security controls

- Client checkbox is only a UX gate. The server function validates authentication, required document slugs and active version.
- Consent is recorded after Firebase authentication and before the session is allowed to continue.
- API calls use Firebase ID tokens, origin-aware CORS and per-user rate limiting.
- Cookie consent is granular and non-essential categories default to off.

Legal note: the included text now defines a Peru/Tacna operational baseline, the production domain and a provider-processing list. Counsel should still confirm formal company registration, tax data, retention schedules, processor agreements and sector-specific obligations before broad public use.
