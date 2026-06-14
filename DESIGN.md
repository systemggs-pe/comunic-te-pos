# DESIGN.md

## Design Register

`product`

COMUNIC@TE uses a restrained operational UI. The interface should prioritize scan speed, predictable controls, dense but readable data, and clear state feedback.

## Visual Direction

Scene: an authorized operator uses the app during store operations, often while handling customers, devices and receipts. The UI should feel calm, quick and trustworthy under everyday office or retail lighting.

Design posture:

- Light product UI.
- Tinted neutral surfaces.
- One blue accent for primary actions and focus.
- Semantic green, amber and red for success, warning and risk states.
- Minimal shadows.
- Rounded corners at 8px or less for product surfaces.
- No decorative hero sections, gradient text, glass effects or ornamental backgrounds.

## Color Tokens

Canonical tokens live in `src/index.css`.

| Token | Value | Use |
|---|---|---|
| `--ggs-bg` | `oklch(0.976 0.006 250)` | App background |
| `--ggs-surface` | `oklch(0.99 0.004 250)` | Cards, panels, forms |
| `--ggs-surface-soft` | `oklch(0.969 0.007 248)` | Toolbars, hover rows |
| `--ggs-surface-softer` | `oklch(0.94 0.012 250)` | Chips and secondary fills |
| `--ggs-border` | `oklch(0.91 0.016 250)` | Standard border |
| `--ggs-border-strong` | `oklch(0.84 0.025 250)` | Hover/strong border |
| `--ggs-ink` | `oklch(0.23 0.028 255)` | Primary text |
| `--ggs-ink-soft` | `oklch(0.37 0.026 255)` | Secondary text |
| `--ggs-muted` | `oklch(0.58 0.024 255)` | Muted labels |
| `--ggs-accent` | `oklch(0.54 0.16 255)` | Primary action |
| `--ggs-accent-hover` | `oklch(0.49 0.17 255)` | Primary hover |
| `--ggs-accent-soft` | `oklch(0.95 0.032 255)` | Active/soft accent |
| `--ggs-success` | `oklch(0.56 0.13 154)` | Success state |
| `--ggs-success-soft` | `oklch(0.95 0.04 154)` | Success background |
| `--ggs-warning-soft` | `oklch(0.96 0.045 82)` | Warning background |
| `--ggs-danger` | `oklch(0.56 0.18 27)` | Danger state |
| `--ggs-danger-soft` | `oklch(0.955 0.04 27)` | Danger background |

## Typography

- Use system sans fonts through Tailwind/default browser stack.
- Keep product headings compact.
- Use uppercase only for small labels, section kickers and table headers.
- Do not use display fonts in app surfaces.
- Body copy should remain short and task-oriented.
- Avoid negative letter spacing.

Recommended scale:

| Role | Size | Weight |
|---|---|---|
| Page title | `1.15rem` | `700` |
| Body/table text | `0.88rem` to `0.9rem` | `400` to `600` |
| Kicker/header label | `0.68rem` to `0.7rem` | `800` |
| Helper text | `0.75rem` to `0.83rem` | `400` to `600` |

## Layout

- Use the authenticated app shell in `src/app/App.jsx`.
- Navigation uses desktop top navigation and compact mobile grid navigation.
- Main content should fit inside `max-w-7xl` or existing shell widths.
- Use tables for desktop lists and mobile rows/cards for small screens.
- Use modals only for confirmation or focused detail views.
- Avoid nested cards.
- Keep repeated operational rows visually quiet.

## Core Components

Use existing component vocabulary before adding new abstractions.

| Component/Class | Use |
|---|---|
| `TopNavItem` | Desktop navigation action |
| `MobileNavIcon` | Mobile navigation action |
| `ConfirmModal` | Confirmation for destructive or risky actions |
| `.saas-list-shell` | Main list/panel surface |
| `.saas-form-shell` | Form container |
| `.saas-settings-card` | Settings surface |
| `.saas-boleta-card` | Foreign receipt surface |
| `.saas-list-toolbar` | List header and toolbar |
| `.saas-form-header` | Form header |
| `.saas-primary` | Main action button |
| `.saas-secondary` | Secondary action button |
| `.saas-ghost-button` | Low-emphasis inline action |
| `.saas-icon-button` | Icon-only action |
| `.saas-searchbox` | Search input wrapper |
| `.saas-search-input` | Search input |
| `.saas-table` | Desktop data table |
| `.saas-mobile-list` | Mobile list wrapper |
| `.saas-mobile-row` | Mobile row/card |
| `.saas-chip` | Small status label |
| `.saas-empty` | Empty state |

## Interaction Rules

- Primary actions use icons from `lucide-react` where available.
- Icon-only buttons need `aria-label` or visible equivalent text.
- Dangerous actions require confirmation.
- Long-running actions should disable the trigger and show loading text.
- Search boxes should keep results stable and avoid layout jump.
- Form sections should reveal complexity progressively when possible.
- For problem tracking, the form stays hidden until the user presses `+ Problema` or edits an existing problem.

## Accessibility Criteria

Baseline requirements:

- Text must meet readable contrast against its surface.
- Interactive targets should be at least 44px on mobile when practical.
- Inputs need visible labels, not placeholder-only meaning.
- Icon-only controls need accessible names.
- Modals should use `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape close and focus return.
- Toasts should eventually expose `aria-live`.
- Keyboard focus states must remain visible.
- Avoid text overlap on mobile and desktop.

Known accessibility gaps:

- Some existing modals need stronger focus management.
- Some compact icon buttons are below ideal mobile touch size.
- Some toast feedback is visual-only.

## Motion

- Motion should communicate state only.
- Use short transitions around 150ms to 250ms.
- Existing splash animation may remain as a brand moment after login.
- Avoid decorative page-load choreography.

## Content Guidelines

- Use Spanish labels for operator-facing UI.
- Keep labels concise: `Guardar`, `Editar`, `Resolver`, `Compartir`, `Buscar`.
- Use exact operational terms: `DNI`, `IMEI`, `RUT`, `boleta`, `registro`, `venta`.
- Error messages should state the missing or invalid field.
- Changelog/problem copy should preserve: problem, detail, route and solution.

## Implementation Guidelines

- Keep styling aligned with `src/index.css`.
- Prefer existing Tailwind patterns and `.saas-*` classes.
- Use `lucide-react` icons instead of inline custom SVG where possible.
- Do not introduce a new UI library without a product-level reason.
- Before adding direct Firestore writes, update `firestore.rules` with schema validation.
- Run `npm run lint` and `npm run build` after UI or code changes.
