# Frontend Documentation

## Overview

The frontend is a Vite-powered React SPA. It uses React state, Firestore realtime listeners, lazy-loaded feature modules and Tailwind CSS plus project-specific CSS utility classes in `src/index.css`.

The app is not a Next.js application. It does not use file-based routing. It does not currently use shadcn/ui. Navigation is handled through a `currentView` string in the main app shell.

## Entrypoints

| File | Responsibility |
|---|---|
| `src/main.jsx` | Mounts React app under `#root` and imports `src/index.css`. |
| `src/App.jsx` | Re-exports `src/app/App.jsx`. |
| `src/app/App.jsx` | Main shell, auth state, view routing, Firestore subscriptions and navigation. |

## Route and View Model

Routes are not handled by a router library. The shell uses:

- Legal route detection from `window.location.pathname`.
- `currentView` internal state for authenticated app screens.

Implemented legal paths are resolved through:

- `src/features/legal/legalRouting.js`
- `src/features/legal/LegalDocumentPage.jsx`

Authenticated views:

| View key | Component |
|---|---|
| `dashboard` | `Dashboard` |
| `registros_list` | `RegistrosList` |
| `registros_new` | `RegistroForm` |
| `registros_edit` | `RegistroForm` |
| `ventas_list` | `VentasList` |
| `ventas_new` | `VentaForm` |
| `ventas_edit` | `VentaForm` |
| `clientes_list` | `ClientesList` |
| `boleta_extranjera` | `BoletaExtranjera` |
| `configuracion` | `ConfiguracionLogo` |

## Lazy Loading

`src/app/App.jsx` lazy-loads major feature components using `React.lazy` and a helper called `lazyNamed`.

Lazy-loaded modules:

- Dashboard
- ConfiguracionLogo
- RegistrosList
- RegistroForm
- VentasList
- VentaForm
- ClientesList
- BoletaExtranjera

Important performance note: some PDF dependencies can still be preloaded by the built output due to shared imports/chunking. See [Maintenance and Scalability](maintenance-and-scalability.md).

## State Ownership

The main shell owns global app state:

| State | Purpose |
|---|---|
| `user`, `authLoading` | Firebase authentication session. |
| `currentView` | Internal view routing. |
| `editingData` | Current record being edited. |
| `formDirty` | Unsaved form protection. |
| `busquedaGlobal`, `mostrarBusqueda` | Global search UI. |
| `logoVentas` | Ticket logo data URL from Firestore. |
| `clientes`, `equipos`, `registros`, `ventas` | Operational collections. |
| `totales` | Count totals from Firestore count queries. |
| pagination refs | Cursor state for registrations and sales. |
| `toast` | Global notification UI. |

## Firestore Reads

Direct client reads include:

- `clientes`
- `equipos`
- `configuracion/logoVentas`
- paginated `registros`
- paginated `ventas`
- `boletasExtranjeras` inside `BoletaExtranjera`
- `configuracion/contadorBoletas` inside `BoletaExtranjera`

The app uses `onSnapshot` for realtime updates and `getDocs` for pagination.

## Forms and Validation

Client-side validation exists for immediate UX. Server-side validation is implemented separately in `netlify/functions/_validators.mjs` and is authoritative for API-mediated writes.

### RegistroForm

Purpose:

- Capture customer document, contact, address and email.
- Capture equipment IMEI, IMEI2, serial, brand, model and commercial name.
- Capture registration state, carrier, type, price and date.
- Consult RENIEC for DNI.
- Open the OCR scanner for box extraction.
- Create or update a registration through `/api/registros`.

Key validations:

- DNI/RUC/CE/PASAPORTE format through `utils/documentos.js`.
- Phone must match Peruvian 9-digit mobile pattern.
- Email format.
- IMEI Luhn validation.
- Price format and blocked-equipment minimum price.

### VentaForm

Purpose:

- Capture customer identity.
- Capture sold equipment data.
- Capture payment method and sale price.
- Add accessory items.
- Generate sale ticket after creation.

Key validations:

- Document format.
- IMEI Luhn validation.
- Positive price.
- Accessory name, quantity and price.

### BoletaExtranjera

Purpose:

- Build foreign receipt flows using existing sales or manual entry.
- Convert PEN to CLP through local utilities.
- Maintain receipt history in Firestore.
- Generate one of three PDF receipt formats.

## Component System

Reusable components:

| Component | Path | Purpose |
|---|---|---|
| `TopNavItem` | `src/components/navigation/TopNavItem.jsx` | Desktop navigation button. |
| `MobileNavIcon` | `src/components/navigation/MobileNavIcon.jsx` | Mobile navigation icon button. |
| `ConfirmModal` | `src/components/ui/ConfirmModal.jsx` | Generic confirmation modal. |
| `IntroSplash` | `src/components/branding/IntroSplash.jsx` | Post-login intro animation. |
| `AppFooter` | `src/components/branding/AppFooter.jsx` | Corporate footer and legal links. |
| `BrandEcosystem` | `src/components/branding/BrandEcosystem.jsx` | Brand hierarchy display. |

## UI System

The UI system is a custom Tailwind/CSS hybrid. Core tokens are defined in `src/index.css` under `:root`:

- `--ggs-bg`
- `--ggs-surface`
- `--ggs-border`
- `--ggs-ink`
- `--ggs-muted`
- `--ggs-accent`
- `--ggs-success`
- `--ggs-danger`

Reusable class families:

- `.saas-list-shell`
- `.saas-form-shell`
- `.saas-primary`
- `.saas-secondary`
- `.saas-icon-button`
- `.saas-table`
- `.saas-mobile-list`
- `.saas-detail-modal`
- `.saas-modal-backdrop`
- `.saas-stepper`
- `.saas-chip`

## Responsive System

Responsive behavior is implemented with Tailwind breakpoints and CSS media rules.

Examples:

- Desktop top navigation is visible from `md`.
- Mobile bottom-style grid navigation is visible below `md`.
- Lists switch from tables on desktop to mobile rows/cards on small screens.
- Detail modals use full-screen behavior on mobile in some modules.

Known improvement:

- Some icon buttons are below the recommended 44px mobile touch target.
- Some modal dialogs need stronger focus management for accessibility.

## Dark Mode

Dark mode is implemented only for legal document pages through local component state in `LegalDocumentPage`. The authenticated product UI does not currently implement global dark mode.

## Animations

Implemented animations:

- Intro splash fade/backdrop animation in `src/index.css`.
- Loading spinners through Tailwind `animate-spin`.
- Small hover transitions for buttons, tables and cards.

No global motion provider exists.

## Accessibility Status

Implemented:

- Many icon-only buttons include `aria-label`.
- Legal document navigation uses semantic landmarks.
- Login SVG icon is hidden with `aria-hidden`.
- Legal consent checkbox has `aria-describedby`.

Needs improvement:

- `ConfirmModal` and custom modals should use `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape close and focus return.
- Touch targets should be at least 44px.
- Some desktop icon-only buttons rely on `title` instead of `aria-label`.
- Toasts should expose `aria-live`.

