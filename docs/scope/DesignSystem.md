# Petrolord Design System

One visual family for Suite, NextGen and HSE, taken from the 2026-09
homepages (petrol-green ink, gold, ivory paper; Cormorant Garamond, Public
Sans, IBM Plex Mono). Application consoles are **light by default**; **dark is
a per-user choice**. Since the rollout (waves 0 to 7, complete on
2026-09-28; tracker in `DesignSystem-Rollout.md` section 6) every Suite page
sits in a theme scope.

Audit, pilots and open decisions: `docs/scope/DesignSystem-PLAN.md`.

## 1. Files

| file | what |
|---|---|
| `src/design/tokens.js` | the tokens (single source) and the colour maths |
| `src/design/theme.css` | GENERATED; `node scripts/design/build-theme-css.mjs` |
| `src/design/themeCss.js` | the CSS renderer the script and the test share |
| `src/design/ThemeProvider.jsx` | `ThemedApp`, `ThemeProvider`, `FixedTheme` (the ink rail's fixed dark theme), storage helpers |
| `src/design/themeContext.js` | `useDsTheme`, `usePortalThemeProps` (no dependencies) |
| `src/design/activeTheme.js` | the theme of the scope on screen, for the root toaster |
| `src/design/DashboardScope.jsx` | `DashboardScope`: the one `ThemedApp` DashboardLayout renders around every `/dashboard` page (batch 7A) |
| `src/design/coldLoad.jsx` | `isThemedPath` (any `/dashboard` path, plus the themed pages outside it), `isPublicLightPath`, `coldLoadTheme`, `ThemedLoadingScreen` for the cold-load loaders |
| `src/components/public/PublicPage.jsx` | the public and auth page frame (batch 7C): `PublicPage` (always light, no toggle), the ink `PublicBrandBar` with the wordmark, `AUTH_CARD` and friends, and `PublicScope` (the always-light scope without the frame, for the homepage's Book a Demo dialog) |
| `src/design/testing/themeAssertions.js` | test only: the shared app theme-test helpers (section 4) |
| `src/components/ui/theme-toggle.jsx` | `ThemeToggle` |
| `src/components/ui/app-shell.jsx` | `AppHeader`, `PageContainer`, `PageSection`, `DisplayHeading` |
| `src/components/ui/stat-tile.jsx` | `StatTile` |
| `src/components/ui/segmented-control.jsx` | `SegmentedControl` |
| `src/components/ui/native-select.jsx` | `NativeSelect`, `CompactInput`, `NATIVE_SELECT_THEMED`, `COMPACT_FIELD_THEMED` |
| `src/components/ui/chart-panel.jsx` | `ChartPanel` |
| `src/components/ui/numeric-table.jsx` | `NumericTable`, `NumTh`, `NumRow`, `RowLabel`, `NumCell`, `signedTone` |
| `src/dev/DesignSystemHarness.jsx` | specimen at `/dev/design-system` (dev only) |

Change a colour in `tokens.js`, re-run the script, run
`npx jest src/design`. The test fails if `theme.css` is stale or any text
role drops below WCAG AA.

## 2. Tokens

### Colour roles
Use roles, never hues. Tailwind classes are `bg-pl-<role>`,
`text-pl-<role>`, `border-pl-<role>`, `ring-pl-<role>` (alpha works:
`bg-pl-surface/90`).

The light neutrals are the **grey panel** set (owner decision, 2026-09-28):
a grey page, lighter grey panels and near-white menus and dialogs. Primary,
accent, text and status colours come from the brand pack, and chart cards
stay white. The homepages keep their own paper look (`Home.css`).

| role | light | dark | use |
|---|---|---|---|
| `bg` | `#E1E4E8` | `#07140E` | page canvas |
| `surface` | `#EDEFF2` | `#0C1F16` ink | cards, panels, table bodies |
| `raised` | `#F8F9FA` | `#12301F` | dialogs, popovers, menus (with shadow) |
| `sunken` | `#D8DCE1` | `#0A1A12` | tab rails, table headers, hover fills |
| `border` | `#C3C9D0` | `#24402F` | hairlines |
| `border-strong` | `#6E7883` | `#5F7D6B` | input and control outlines (3:1) |
| `text` | `#14231B` | `#EEF2EC` | body text |
| `muted` | `#4D5761` | `#A9B8AE` | secondary text, labels, units |
| `primary` / `primary-fg` | `#2F6B48` / white | `#7CC49A` / `#07140E` | main action |
| `primary-hover` | `#245A3B` | `#94D2AD` | |
| `primary-text` | `#2F6B48` | `#8FD0AA` | links, active icons |
| `primary-text-hover` | `#1F4E33` | `#B3E2C6` | hover on links and text buttons |
| `accent` / `accent-fg` | `#C8A24E` gold / ink | same | brand highlight fill |
| `accent-text` | `#7A5A12` | `#E6D3A0` | eyebrows, gold words |
| `success` `-fg` `-bg` `-text` | `#1E7A46` ... | `#6FD19A` ... | status only |
| `warning` `-fg` `-bg` `-text` | `#8F5300` ... | `#F0B955` ... | status only |
| `danger` `-fg` `-bg` `-text` | `#B42318` ... | `#F28B82` ... | status only |
| `info` `-fg` `-bg` `-text` | `#1D5FA8` ... | `#8AB8F2` ... | status only |
| `focus` | `#8A6A1F` | `#E6D3A0` | focus ring (3:1 on bg and surface) |
| `chart-surface` | `#FFFFFF` | `#FFFFFF` | the chart standard, both themes |

Checked pairs (all AA 4.5:1 for text, 3:1 for borders and focus, both
themes, also after rounding to the shadcn HSL triplets): see
`CONTRAST_PAIRS` in `tokens.js`.

Inside a scope the shadcn variables are re-pointed at these roles
(`--background` = bg, `--card` = surface, `--popover` = raised,
`--muted` = sunken, `--muted-foreground` = muted, `--input` = border-strong,
`--ring` = focus, `--primary` = primary, `--destructive` = danger ...), so
`bg-background`, `text-muted-foreground`, `border-input` and the rest follow
the theme too. `--chart-1..5` become the chartTheme series colours.
Outside every scope `src/index.css` sets `:root` to the light scope's
values of the same variables (the old "Dark Premium" globals were retired
in 7B; `tokens.test.js` keeps the two in step).

### Type
- `font-pl-display`: Cormorant Garamond. Page titles and hero numbers only
  (`DisplayHeading`). Never for body, tables or form labels.
- `font-pl-sans`: Public Sans. Everything else (the scope's default).
- `font-pl-mono`: IBM Plex Mono with `tabular-nums` for numbers in tables and
  KPI values.
- Scale: Tailwind's own `text-xs` 12, `text-sm` 14, `text-base` 16,
  `text-lg` 18, `text-xl` 20, `text-2xl` 24, `text-3xl` 30, `text-4xl` 36.
  Consoles default to `text-sm`.

### Spacing, radii, shadows
- Spacing: the Tailwind 4px grid (`1` = 4px, `2` = 8px, `4` = 16px,
  `6` = 24px, `8` = 32px). Page gutter `px-4 sm:px-6`, section gap `space-y-8`.
- Radii: 6, 8, 12, 16, pill. Inside a scope `--radius` is 12px, so
  `rounded-lg` = 12, `rounded-md` = 10, `rounded-sm` = 8. Canvas frames
  (seismic sections, maps, 3D viewers) use `rounded-pl-canvas`, which stays
  8px inside a scope (and outside one).
- Shadows: `shadow-pl-sm` (cards), `shadow-pl-md` (menus), `shadow-pl-lg`
  (dialogs). Theme-aware.

## 3. Rules

1. **Light by default, dark by choice.** Every migrated app starts light. The
   user's choice is kept per user in the browser. Never read the OS setting.
2. **Dark canvas only where it helps the work.** Seismic sections, 3D viewers,
   well-log image tracks and similar imagery may sit on `data-canvas="dark"`.
   Panels, forms, tables and dialogs around them follow the user's theme.
   Do not use a dark canvas for decoration or for a whole page.
3. **Colour for status only.** Green, amber, red and blue mean success,
   warning, danger and info, and only via the status roles (`Badge` variants
   `success|warning|danger|info`, `StatTile status`). Never colour a card, a
   heading or an icon for decoration. Pair colour with a word or icon so it
   is not the only signal.
4. **Chart standard.** Every chart uses `chartTheme` + `ChartLogo`, normally
   through `ChartFrame`, on a white surface in both themes (`ChartFrame` sets
   `data-canvas="chart"`). Series colours come from `chartTheme`; do not
   restyle charts per theme.
5. **Copy.** No em dashes. No "X, not Y", "rather than", ", never" or
   "instead of" constructions in UI text. Spell out arrows in prose. Plain
   sentences with commas, "so", "and", or a full stop.
6. **Brand accents.** Gold is a fill with ink text (`accent`, `accent-fg`) or
   `accent-text` for small eyebrow words. Lime is retired from app chrome.
7. **Focus.** Keep the component focus rings (`ring-pl-focus`). The scope also
   draws a focus outline on any element without its own ring.
8. **Toasts match the page** (owner revision of lead decision 3,
   2026-09-28). The one root toaster takes the theme of the scope on
   screen; where none is mounted (the homepage) it shows one light style in
   the homepage's paper palette. Apps call
   `useToast()` or sonner as before; nothing to do per app.
9. **Loaders.** On the themed paths (`src/design/coldLoad.jsx`: every
   `/dashboard` path and the themed pages outside it) the AuthGuard,
   ProtectedRoute and root Suspense loaders, and DashboardLayout's own
   loader, paint the device's last theme, so a light user does not see a
   dark spinner first. The public and auth pages (`PUBLIC_PAGE_PREFIXES`)
   always paint light, as the pages themselves do, and so do the paths with
   no scope (the homepage).

## 4. The dashboard scope, and how a page is themed

Since batch 7A every page under `/dashboard` is themed by one scope:
`DashboardLayout` renders `DashboardScope` (one `ThemedApp`) around its
content column, so the landing, the module hubs, every app and help guide,
the account pages and the `AccessDenied`, `ComingSoon` and access-restricted
states all sit in it. A page under `/dashboard` does **not** wrap itself in
`ThemedApp` (`src/design/__tests__/dashboardScope.test.jsx` fails if a file
under `src/pages`, `src/components` or `src/layouts` renders one, apart
from the pages outside `/dashboard` listed there). Its header carries the
`ThemeToggle` (`AppHeader`, `StudioHeader` and the help guide shell have
it), which switches the dashboard scope. The sidebar rail, the phone bar
and the phone navigation drawer stay outside the scope as the fixed dark
ink frame: they carry `data-pl-theme="dark"` inside a `FixedTheme` (no
storage, no toggle), so their portals (the log-out dialog, the drawer)
carry the dark theme too.

Pages outside `/dashboard` open their own scope: the public and auth pages
through `PublicPage` (always light), `/profile` and the super-admin pages
through `AccountScope` (a plain element when it already sits in a scope),
the `/mobile` shell through `MobileLayout`, and the dev harness routes
through one scope in App.jsx. The root `ErrorBoundary` panels and
`ProtectedRoute`'s access-denied state (for example `/super-admin` for a
non super admin) open one through `AccountScope`. The homepage opens none
(it paints its own paper look in `Home.css`); its Book a Demo dialog brings
`PublicScope`, and the root `PwaUpdatePrompt` is a fixed ink chip.

`ThemedApp` renders a `div` with `data-pl-theme="light|dark"` (the CSS
scope) and `data-pl-root` (page background), reads the signed-in user from
`AuthContext` (no throw outside the provider) and provides the theme to
everything below. While the session is still restoring (loading, no
user yet) it paints the last theme this device resolved
(`petrolord.theme.v1.last`), so a dark user sees no light first frame. Then:

- The adapted primitives switch automatically: `Card`, `Tabs`, `Table`,
  `Input`, `Textarea`, `Label`, `Button` (adds `variant="accent"`), `Badge`
  (adds status variants, `neutral` and `selected`), `Select`, `Dialog`,
  `Popover`, `Tooltip`, `DropdownMenu`, `Checkbox`, `Switch`, `Accordion`,
  `ScrollArea`, `Sheet`, `Slider`, `Progress`, `Alert` (adds status
  variants), `Separator`, `ContextMenu`, `AlertDialog`, `Skeleton`,
  `Toggle`, `ToggleGroup`, `Avatar`, `RadioGroup`, the `FullPrecision`
  toggle and note, `StudioHeader` (shows the toggle), and the full-page
  `AccessDenied` and `ComingSoon` screens; `ProtectedAppRoute`'s loading,
  licence-banner and access-restricted states use roles (7A).
- Put `<ThemeToggle />` in the header, or use `AppHeader`, which has it.
- Portal content (dialog, sheet and alert-dialog overlays and panels,
  menus and submenus, selects, popovers, tooltips) carries the scope
  attribute through `usePortalThemeProps()`; use it on any custom portal.
- A dark canvas: `<div data-canvas="dark">...</div>`. Components inside it
  use the dark roles even when the app is light.

Since batch 7B the shared pieces (the ui kit, the Studio kit, the
workstation shells, the CRS, wells, culture, portability and production
forms, `AccessDenied`, `ComingSoon`) render theme roles only: there is no
legacy branch and no opt-in helper (`useThemeClass` and `useStudioTheme`
are gone). Every page sits in a scope, and the classes only resolve inside
one, so a new page outside `/dashboard` must open a scope (see above).

Class overrides still win (tailwind-merge), so a page must not add its own
`bg-slate-*`, `text-white` and similar classes over a themed piece.

There is no typography plugin, so `prose` classes do nothing. Style article
HTML with explicit role classes (`[&_h2]:text-xl`, `[&_a]:text-pl-primary-text`
and so on), as the NPV and PM help viewers and the ReservoirCalc Pro
documentation do.

### The cold-load loaders

Before the session restores, the loaders outside any scope (AuthGuard,
ProtectedRoute, the root PageLoader) paint the user's last theme on the
paths `isThemedPath()` knows: every `/dashboard` path, and the prefixes in
`THEMED_PAGE_PREFIXES` for the themed pages outside it. A new page under
`/dashboard` needs no registration. A new themed page outside `/dashboard`
adds its prefix there; `coldLoad.test.jsx` checks each prefix is well
formed, listed once and starts a route in `App.jsx`.

### The app theme test

Every migrated app gets `__tests__/<App>.theme.test.jsx` built on the shared
helpers in `src/design/testing/themeAssertions.js` (test only; never import
it from app code):

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome } from '@/design/testing/themeAssertions';
import ReservoirBalance from '@/pages/apps/reservoir-balance/ReservoirBalance';

describeAppTheme({
  name: 'Material Balance Studio',
  route: '/dashboard/apps/reservoir/material-balance-studio',
  renderApp: () => render(<MemoryRouter><ReservoirBalance /></MemoryRouter>),
  ready: () => screen.findByText('Material Balance Studio'),
  scopeTestId: 'mbal-theme-scope', // the app's root element; the checks run on the scope around it
  // userId: 'u1' when the test provides an AuthContext user (default null, the anon key)
  // allow: ['text-red-600'] only for a deliberate legacy token, with the reason
});
```

`describeAppTheme` adds the four standard checks: opens light in the scope;
the header toggle goes to dark and back and stores the choice under the
user's key; no legacy console colour under any `[data-pl-theme]` element
(portals included) outside `data-canvas` regions, with a planted negative
control; and `isThemedPath(route)` is true. It installs the jsdom shims and
clears storage before each test. For a `/dashboard` route it mounts the app
inside `DashboardScope`, as DashboardLayout does. For further states (tabs,
dialogs, results), call `installDashboardScope({ userId })` once at the top
of the file (every `render()` in that block then mounts inside the
dashboard scope, inside any `wrapper` and across `rerender`) and use the
pieces below:

| helper | checks |
|---|---|
| `expectNoLegacyChrome({ root?, allow? })` | no legacy class under a scope, outside `data-canvas` |
| `legacyChromeClasses({ root?, allow? })` | the offending class strings (for a custom assertion) |
| `expectNegativeControl(scope, { allow? })` | a planted `bg-slate-900 text-white` is found, one inside `data-canvas` is not |
| `expectLightByDefault(scope)`, `expectToggleRoundTrip(scope, { userId? })` | the theme checks on their own |
| `expectThemedPath(route)` | the route is registered |
| `installDashboardScope({ userId? })` | every `render()` in the block mounts inside `DashboardScope` |
| `getScopeRoot(testId?)` | the scope root; a test id on an app's own root resolves to the scope around it |
| `installDomShims()`, `hasLegacyChrome(cls)` | utilities |

A legacy token is any Tailwind palette colour on a colour utility (with any
variant), `text-white`, solid `bg-black`, translucent `bg-white/`, gradients
and hex colours. Tokens under `dark:` are ignored (the Suite never sets
`.dark`), and so are translucent black scrims.

## 5. Components

| piece | notes |
|---|---|
| `AppHeader` | sticky bar: back, icon, eyebrow, title, subtitle, children slot (tabs), actions, toggle |
| `PageContainer` | centred body, 1400px max unless `wide` |
| `PageSection` | titled section with optional description and actions |
| `DisplayHeading` | serif display title |
| `Card` | surface, border, `shadow-pl-sm` |
| `StatTile` | label, mono value, unit, hint; optional `status` adds a marker and colours the hint |
| `Table` | sunken header, uppercase muted labels, row hover; use `font-pl-mono tabular-nums` on numeric cells |
| `Field*` (`ui/field.jsx`) + `Label` + `Input`/`Select`/`Textarea` | form layout; strong borders, focus ring |
| `Tabs` | sunken rail, surface active tab |
| `Badge` | `default secondary outline accent destructive` plus `success warning danger info` |
| `ThemeToggle` | light/dark switch, `aria-pressed`, nothing outside a scope |
| `AppHeader` actions | wrap under the title at phone width; put only a few buttons there |
| `Checkbox`, `Switch` | primary when on; `Switch thumbClassName` styles the thumb |
| `SegmentedControl` | mutually exclusive choices as `aria-pressed` buttons in a labelled group; `size="sm"` for toolbars |
| `ToggleGroup`, `Toggle` | Radix toggles; "on" is the primary fill |
| `NativeSelect`, `CompactInput` | native select matched to `Input`; compact field for dense editor tables (`NATIVE_SELECT_THEMED`, `COMPACT_FIELD_THEMED` for hand-written markup) |
| `ChartPanel` | titled white chart card (`data-canvas="chart"`) around a `ChartFrame`; title, subtitle, actions |
| `NumericTable` | ledger tables: sticky `RowLabel`, mono right-aligned `NumCell` with danger text for negatives (`signed={false}` to turn off), `total` rule, sideways scroll inside the card |
| `Alert` | `default destructive` plus `success warning danger info` |
| `Badge` `neutral`, `selected` | `neutral` for non-status tags and counts, `selected` for the chosen chip in a set |
| `Sheet`, `AlertDialog`, `ContextMenu` | raised surface, shadow, scoped portals (submenus too) |
| `Skeleton`, `Progress`, `Slider`, `ScrollArea`, `Separator` | hairline and primary roles |

## 6. Migration checklist (per app)

1. A page under `/dashboard` is already in the dashboard scope; do not
   wrap it in `<ThemedApp>` (section 4). A new themed page outside
   `/dashboard` opens its own scope and lists its prefix in `coldLoad.jsx`.
2. Replace the app's own header with `AppHeader`, or keep `StudioHeader`
   (it themes itself). Make sure the toggle is visible.
3. Remove hard-coded console colours from the app tree: `bg-slate-*`,
   `text-slate-*`, `border-slate-*`, `text-white`, `lime-*`, gradients and
   hex colours in className or style. Replace with roles (`bg-pl-surface`,
   `text-pl-muted`, `border-pl-border` ...). A grep for
   `slate-|lime-|#[0-9a-f]{6}` over the app's files should come back empty
   apart from charts and canvases.
4. Status colours only through status roles; decorative colour removed.
5. Charts: confirm `ChartFrame`/`ChartLogo` + `chartTheme`, white in both
   themes; no dark-background strokes.
6. Dark canvases: wrap seismic, 3D and image views in `data-canvas="dark"`;
   check their overlays, legends and toolbars read in both themes.
7. Custom portals and modals: spread `usePortalThemeProps()` (the ui
   pieces already do). Drop local overrides of adapted pieces (checkbox,
   switch, context menu, skeleton); they theme themselves now.
8. Typography: Public Sans default, mono for numeric columns, serif only for
   the page title if used.
9. Copy pass on every string touched (section 3, rule 5).
10. Tests: app tests still pass; add the app theme test with
    `describeAppTheme` (section 4), and `installDashboardScope` for the
    app's further theme states.
11. Staging walk in light and dark (and the phone width), then update the
    app's `docs/scope/<App>-STATUS.md` and the pilot table in
    `DesignSystem-PLAN.md`.
