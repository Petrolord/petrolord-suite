# Petrolord Design System

One visual family for Suite, NextGen and HSE, taken from the 2026-09
homepages (petrol-green ink, gold, ivory paper; Cormorant Garamond, Public
Sans, IBM Plex Mono). Application consoles are **light by default**; **dark is
a per-user choice**. Apps adopt it one at a time by opting in.

Audit, pilots and open decisions: `docs/scope/DesignSystem-PLAN.md`.

## 1. Files

| file | what |
|---|---|
| `src/design/tokens.js` | the tokens (single source) and the colour maths |
| `src/design/theme.css` | GENERATED; `node scripts/design/build-theme-css.mjs` |
| `src/design/themeCss.js` | the CSS renderer the script and the test share |
| `src/design/ThemeProvider.jsx` | `ThemedApp`, `ThemeProvider`, storage helpers |
| `src/design/themeContext.js` | `useDsTheme`, `usePortalThemeProps` (no dependencies) |
| `src/components/ui/theme-toggle.jsx` | `ThemeToggle` |
| `src/components/ui/app-shell.jsx` | `AppHeader`, `PageContainer`, `PageSection`, `DisplayHeading` |
| `src/components/ui/stat-tile.jsx` | `StatTile` |
| `src/dev/DesignSystemHarness.jsx` | specimen at `/dev/design-system` (dev only) |

Change a colour in `tokens.js`, re-run the script, run
`npx jest src/design`. The test fails if `theme.css` is stale or any text
role drops below WCAG AA.

## 2. Tokens

### Colour roles
Use roles, never hues. Tailwind classes are `bg-pl-<role>`,
`text-pl-<role>`, `border-pl-<role>`, `ring-pl-<role>` (alpha works:
`bg-pl-surface/90`).

| role | light | dark | use |
|---|---|---|---|
| `bg` | `#F2F4EF` paper | `#07140E` | page canvas |
| `surface` | `#FFFFFF` | `#0C1F16` ink | cards, panels, table bodies |
| `raised` | `#FFFFFF` | `#12301F` | dialogs, popovers, menus (with shadow) |
| `sunken` | `#E7EBE3` | `#0A1A12` | tab rails, table headers, hover fills |
| `border` | `#D5DCD2` | `#24402F` | hairlines |
| `border-strong` | `#7D8B82` | `#5F7D6B` | input and control outlines (3:1) |
| `text` | `#14231B` | `#EEF2EC` | body text |
| `muted` | `#56655C` | `#A9B8AE` | secondary text, labels, units |
| `primary` / `primary-fg` | `#2F6B48` / white | `#7CC49A` / `#07140E` | main action |
| `primary-hover` | `#245A3B` | `#94D2AD` | |
| `primary-text` | `#2F6B48` | `#8FD0AA` | links, active icons |
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

Inside a scope the legacy shadcn variables are re-pointed at these roles
(`--background` = bg, `--card` = surface, `--popover` = raised,
`--muted` = sunken, `--muted-foreground` = muted, `--input` = border-strong,
`--ring` = focus, `--primary` = primary, `--destructive` = danger ...), so
`bg-background`, `text-muted-foreground`, `border-input` and the rest follow
the theme too. `--chart-1..5` become the chartTheme series colours.

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
  `rounded-lg` = 12, `rounded-md` = 10, `rounded-sm` = 8.
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

## 4. How an app opts in

```jsx
import { ThemedApp } from '@/design/ThemeProvider';

<Route path="apps/economics/epe/cases" element={
  <ProtectedAppRoute appId="epe-suite" appName="Petroleum Economics Studio">
    <ThemedApp className="min-h-screen"><EpeCaseList /></ThemedApp>
  </ProtectedAppRoute>
} />
```

Wrap every route of the app (or give the app a layout route with one
`ThemedApp` around its `<Outlet />`), so the theme does not flip while the
user moves between the app's pages.

`ThemedApp` renders a `div` with `data-pl-theme="light|dark"` (the CSS
scope) and `data-pl-root` (page background), reads the signed-in user from
`AuthContext` (no throw outside the provider) and provides the theme to
everything below. While the session is still restoring (loading, no
user yet) it paints the last theme this device resolved
(`petrolord.theme.v1.last`), so a dark user sees no light first frame. Then:

- The adapted primitives switch automatically: `Card`, `Tabs`, `Table`,
  `Input`, `Textarea`, `Label`, `Button` (adds `variant="accent"`), `Badge`
  (adds status variants), `Select`, `Dialog`, `Popover`, `Tooltip`,
  `DropdownMenu`, `StudioHeader` (shows the toggle).
- Put `<ThemeToggle />` in the header, or use `AppHeader`, which has it.
- Portal content carries the scope attribute through `usePortalThemeProps()`;
  use it on any custom portal.
- A dark canvas: `<div data-canvas="dark">...</div>`. Components inside it
  use the dark roles even when the app is light.

Outside a `ThemedApp` nothing changes: the primitives render their legacy
classes byte for byte and no rule in `theme.css` matches.

Class overrides still win (tailwind-merge), so a pilot must remove its own
`bg-slate-*`, `text-white` and similar classes for the theme to show.

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

## 6. Migration checklist (per app)

1. Wrap the route element in `<ThemedApp>`; one PR per app.
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
7. Custom portals and modals: spread `usePortalThemeProps()`.
8. Typography: Public Sans default, mono for numeric columns, serif only for
   the page title if used.
9. Copy pass on every string touched (section 3, rule 5).
10. Tests: app tests still pass; add a render test inside `ThemedApp` for the
    main page. If the app was the non-pilot proof in
    `src/design/__tests__/optInScope.test.jsx`, move that proof to another
    app.
11. Staging walk in light and dark (and the phone width), then update the
    app's `docs/scope/<App>-STATUS.md` and the pilot table in
    `DesignSystem-PLAN.md`.
