# COMUNIC@TE Design System

## Intent

COMUNIC@TE is an operational product used by staff while serving customers, handling devices and issuing receipts. The interface must disappear into the task: calm, precise, fast and trustworthy.

The visual language takes inspiration from the principles behind modern Apple platforms: clarity, hierarchy, consistency, restrained depth, generous breathing room and motion that explains state. It does not copy Apple layouts, proprietary controls, symbols or materials.

## Physical scene

An operator uses the application on a retail desktop under bright ambient light, frequently moving between keyboard, mouse and a phone-sized secondary device. Light mode is the default for legibility in that scene. Dark mode is a complete alternate theme for lower-light work, not an inverted afterthought.

## Design posture

- Product register, visual density 4/10, motion intensity 3/10.
- Restrained color strategy: tinted neutrals plus one blue accent.
- System typography for a native, fast and multilingual interface.
- Structure through spacing, separators and alignment before containers.
- Elevation only for floating navigation, menus, dialogs and transient feedback.
- Familiar controls and predictable responsive behavior.

## Foundations

### Color roles

The implementation source of truth is `src/index.css`. Components consume roles, never raw colors.

| Role | Light | Dark | Purpose |
|---|---|---|---|
| Canvas | cool off-white | tinted graphite | Application background |
| Surface | near-white | elevated charcoal | Main working surface |
| Raised | lightest surface | lighter charcoal | Menus and dialogs |
| Muted | cool neutral | quiet charcoal | Toolbars and grouped rows |
| Text | blue-tinted ink | soft near-white | Primary content |
| Secondary | medium slate | cool gray | Supporting content |
| Tertiary | muted slate | muted gray | Metadata and placeholders |
| Border | subtle cool line | subtle light line | Separation |
| Accent | operational blue | brighter blue | Primary actions, focus, selection |
| Success | green | green | Completed and valid states |
| Warning | amber | amber | Pending and caution states |
| Danger | red | red | Destructive and invalid states |

Semantic colors must never be used to decorate product areas. Color is not the only state indicator; pair it with text or an icon.

### Typography

Font stack:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
```

| Token | Size | Weight | Use |
|---|---:|---:|---|
| Display | 1.75rem | 700 | Login and rare first-level moments |
| Page title | 1.375rem | 700 | Main screen heading |
| Section title | 1rem | 650 | Local section heading |
| Body | 0.875rem | 400 | Tables, forms and content |
| Label | 0.8125rem | 600 | Form labels and controls |
| Caption | 0.75rem | 500 | Metadata and helper text |
| Kicker | 0.6875rem | 700 | Sparse uppercase category labels |

Body prose is capped at 70ch. Numerical identifiers use the system monospace stack. Avoid light weights, negative tracking and display fonts inside the app.

### Spacing

The base unit is 4px.

| Token | Value |
|---|---:|
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 8 | 32px |
| 10 | 40px |
| 12 | 48px |
| 16 | 64px |

Use denser spacing inside rows and controls, larger spacing between conceptual sections. Do not apply identical padding to every element.

### Shape

| Token | Value | Use |
|---|---:|---|
| Small | 6px | Chips and compact controls |
| Control | 10px | Buttons, inputs and search |
| Surface | 14px | Main surfaces and popovers |
| Dialog | 18px | Dialogs and floating layers |
| Pill | 999px | Status badges only |

Avoid nested rounded containers. A child surface inside a parent surface should usually use a separator, tint or spacing instead of another border.

### Elevation

- Level 0: no shadow, content and table rows.
- Level 1: soft 1px ambient shadow, main detached surface.
- Level 2: menu and popover shadow.
- Level 3: dialog shadow over a dimmed backdrop.

Shadows use the canvas hue and must remain subtle in both themes.

### Icons

- Use `lucide-react` exclusively for application controls.
- Default size: 18px; compact: 16px; prominent: 20px; empty state: 28px.
- Default stroke width: 1.8.
- Icon-only controls require an accessible name and at least a 40px desktop target or 44px mobile target.
- Never use emoji as interface icons.

## Components

### Buttons

- Primary: accent fill, one per local action group.
- Secondary: neutral border and surface.
- Ghost: no persistent container, for low-emphasis actions.
- Danger: red only for destructive confirmation or action.
- Icon: square control with tooltip/title and accessible name.

All variants implement hover, focus-visible, active, disabled and loading. Active feedback uses a 1px translation or 0.98 scale without changing layout.

### Inputs

- Label above control, helper or error below.
- Height 40px desktop, minimum 44px mobile.
- Default, hover, focus, disabled, readonly, valid and invalid states.
- Search uses a leading icon and optional clear control.
- Textareas share the same border, focus ring and typography.

### Badges

Neutral, accent, success, warning and danger. Badges are compact labels, not buttons. Status always remains readable without relying on color.

### Surfaces and cards

- `PageSurface`: the principal working layer for a screen.
- `Panel`: only when a subsection needs independent grouping.
- `Inset`: a quiet tinted region without elevation.
- `Metric`: unboxed by default; use separators between metrics.

Cards are not the default layout primitive. Cards inside cards are prohibited.

### Dialogs and menus

- Dialogs use the shared focus trap and restore focus on close.
- Escape closes unless an irreversible operation is running.
- Backdrop click is opt-in.
- Menus and dropdowns use Level 2 elevation and a clear selected state.
- Full-screen mobile dialogs retain a visible title and close action.

### Tables and responsive lists

- Desktop: quiet header, row separators, sticky header when needed, actions aligned at the trailing edge.
- Tablet: preserve table if columns remain readable; otherwise reduce metadata.
- Mobile: semantic list rows, not miniature desktop tables.
- Loading uses row-shaped skeletons. Empty and error states explain the next action.

### Navigation

- All breakpoints: a centered floating bottom navigation with four primary destinations and `Más`.
- Mobile is canonical; targets remain thumb-friendly and the bar uses safe-area offsets.
- Tablet and desktop increase breathing room without changing the navigation model.
- `Foto DNI`, `Problemas` and `Configuración` are secondary destinations inside `Más`; system actions share that panel.
- Frosted material is limited to the navigation and its contextual panel, with restrained blur, saturation and elevation.
- The active destination uses accent text plus a subtle selected surface; pressed feedback never depends on hover.

### Notifications

- Toasts use `role=status` and `aria-live=polite`; errors use `role=alert`.
- Include a semantic icon and concise action-oriented copy.
- Never rely on red/green background alone.

### Loading, empty and error

- Loading: skeleton that resembles the final layout; spinner only for compact actions.
- Empty: icon, direct title, short explanation and optional primary action.
- Error: semantic icon, precise cause when known and retry action when possible.

## Motion

| Token | Duration | Use |
|---|---:|---|
| Fast | 120ms | Pressed and hover feedback |
| Standard | 180ms | Focus, menus and local state |
| Deliberate | 240ms | Dialog and panel entry |

Use `cubic-bezier(0.16, 1, 0.3, 1)` for entry and state changes. Animate only opacity and transform. Respect `prefers-reduced-motion`; decorative continuous motion is prohibited.

## Responsive contract

- 320–639px: single column, 16px page gutters, bottom navigation, 44px targets.
- 640–767px: wider form groups where safe.
- 768–1023px: tablet navigation, tables only when readable.
- 1024–1279px: full operational layout with reduced secondary copy.
- 1280px+: maximum content width 1280px, no uncontrolled stretching.

No screen may introduce horizontal page scrolling. Wide data regions may scroll internally with a visible affordance.

## Accessibility contract

- WCAG AA contrast for text and controls.
- Visible `:focus-visible` on every interactive element.
- Logical DOM and tab order.
- Labels programmatically associated with form controls.
- Dialog focus trap, Escape close and focus restoration.
- `aria-live` for asynchronous feedback.
- 44px touch targets on mobile where practical.
- Reduced motion support.
- Dark and light themes preserve state contrast.

## Anti-patterns

- No gradient text, neon glow, decorative glass, ornamental grid backgrounds or generic SaaS hero metrics.
- No emoji icons.
- No three-column grids of identical cards as a default.
- No cards inside cards.
- No new modal when inline disclosure is sufficient.
- No hardcoded visual values inside feature components when a token or shared component exists.
- No different colors for modules unless color communicates state.

## Delivery checklist

- Tokens used instead of raw colors.
- Shared primitives used for repeated controls.
- Default, hover, focus, active, disabled and loading verified.
- Empty, error and loading states present.
- 320, 390, 768, 1024 and 1440 widths checked.
- Light and dark themes checked.
- No horizontal page overflow.
- Keyboard order and modal focus checked.
- Lint, tests and production build pass.
