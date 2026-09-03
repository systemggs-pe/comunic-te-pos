# COMUNIC@TE — Design Register

The canonical specification is [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md). Runtime tokens and component styles live in `src/index.css`.

## Direction

The product is an operational workspace for sales, equipment registration, customer records and document capture. It should feel calm, precise and immediate: a modern operating environment rather than a collection of dashboard cards.

- Adaptive light and dark themes.
- Restrained blue accent for focus, selection and primary actions.
- Semantic green, amber and red only for status.
- System typography with a compact, deliberate scale.
- Quiet surfaces, subtle separators and rare shadows.
- One primary surface per task; avoid nested cards.
- Lucide icons only; no emoji or decorative interface symbols.
- Motion communicates response or state and respects reduced-motion settings.

The visual language takes inspiration from Apple platform principles—clarity, hierarchy, familiarity, feedback and direct manipulation—without reproducing proprietary components or layouts.

## Canonical Components

| Primitive | Purpose |
|---|---|
| `Button`, `IconButton` | Action hierarchy, loading and disabled states |
| `PageHeader`, `SearchField` | Consistent page identity and search |
| `StatusBadge` | Compact semantic state |
| `StateView`, `SkeletonRows` | Empty, error and loading feedback |
| `Dialog`, `ConfirmModal` | Focused overlays and destructive confirmation |
| `ThemeToggle` | Persistent light/dark preference |
| `FloatingNavigation` | Floating five-destination navigation and contextual “Más” panel |

Legacy `.saas-*` classes remain as compatibility adapters for the large transactional forms while they consume the same semantic `--ui-*` token set. New UI must use the canonical primitives and role-based tokens.

## Layout

- Mobile first: floating bottom navigation with `Inicio`, `Registros`, `Ventas`, `Clientes` and `Más`.
- Tablet and desktop retain the same bottom navigation language instead of switching patterns.
- `Foto DNI`, `Problemas`, `Configuración`, respaldo, theme and account controls live in `Más`.
- The bar respects safe areas and content always reserves its fixed footprint.
- Lists: real table on desktop, quiet rows on mobile.
- Dialogs: centered on wide screens, bottom-sheet treatment on mobile.
- Touch targets: 44px minimum on mobile.

## Accessibility and Interaction

- Visible `:focus-visible` treatment on every control.
- Labels and accessible names are mandatory; placeholders are supplemental.
- Status feedback uses `role="status"` or `role="alert"`.
- Dialogs must manage focus, Escape and focus return.
- Color never carries meaning alone.
- Motion timing is 120–260ms and disabled under `prefers-reduced-motion`.
- The launch presentation runs after every confirmed login, derives `v7.0` from `package.json`, and reduces to a short static presentation when reduced motion is requested.
- All pages must be checked at 390px, 768px and 1440px widths.

## Product Rules

- Do not alter business logic, authentication, Firebase contracts or API behavior during visual work.
- Do not add a UI library without a product-level reason.
- Do not hardcode new colors, radii, shadows or transition timings.
- Keep operator-facing copy in Spanish and task-oriented.
- Run `npm test`, `npm run lint` and `npm run build` before delivery.
