# Petrolord Design System: audit, phase 1 and pilot plan

Owner decision 2026-09-27: one visual family across Suite, NextGen and HSE,
modelled on the new homepages. Application consoles move to a light default
with dark as a per-user choice. Dark canvases stay where they help the work
(seismic sections, 3D viewers). Roll out in phases, starting with 3 to 5
pilot apps. Do not redesign every app at once.

This document covers the audit, what phase 1 (this PR) delivers, the pilot
choice and the open owner decisions. The usage rules live in
`docs/scope/DesignSystem.md`.

## 1. Audit: how theming works today (main 10b28abb0)

**Tailwind.** `tailwind.config.js` uses `darkMode: ["class"]` and maps the
stock shadcn colour names (`background`, `card`, `primary`, `muted` ...) to
`hsl(var(--x))`. Nothing ever adds the `dark` class and there is no
ThemeProvider mounted (`next-themes` is a dependency, read only by
`ui/sonner.jsx` and `RiskMatrix.jsx`, both falling back to "system").

**shadcn variables (`src/index.css`).** One set of variables under
`:root, .dark`, named "Petrolord Dark Premium Theme": background
`210 25% 8%`, card `219 25% 18%`, primary blue `217 91% 60%`. There is no
light set. `--muted` is a text-like grey, so `bg-muted` and
`text-muted-foreground` are the same colour, a sign the variables were never
used as designed. `body` gets `bg-background` and DM Sans (which is not
loaded; the fonts loaded in `index.html` are Cormorant Garamond, Public Sans
and IBM Plex Mono for the homepage).

**Where the dark console really comes from.** Not from the variables. It is
hard-coded Tailwind slate:
- `@/components/ui/*` bake slate into the primitives: Card
  `bg-slate-800/30 border-slate-700 text-slate-100`, Input and Select
  `bg-slate-800`, Tabs `bg-slate-800`, Dialog and Popover `bg-slate-900`,
  Button default `bg-blue-600`, outline `border-slate-700`. 22 of the ui
  files hard-code slate. Badge still carries the stock light shadcn classes
  with `dark:` variants that never fire.
- `DashboardLayout` (`bg-slate-900`), `DashboardSidebar`, and the Studio kit
  (`StudioLayout` root `bg-slate-950 text-slate-100`, used by 33 apps).
- App code: 2,664 `bg-slate-950/900` usages across 842 `.jsx` files, 957
  `lime-*` usages (the old accent), 1,606 hex colours in JSX. Only 60 usages
  of the token classes (`bg-background`, `bg-card`, `text-foreground` ...).
- `src/App.css` adds lime scrollbars, a lime `.text-gradient` and a lime
  focus outline.

**Homepage styles.** `src/pages/Home.css` is scoped under `.suite-home` and
defines its own brand pack as CSS variables (`--ink #0C1F16`,
`--gold #C8A24E`, `--paper #F2F4EF`, `--text #14231B`, `--muted #56655C`,
`--line #D5DCD2`) with Cormorant Garamond and Public Sans. NextGen's
`LandingPage.css` (`.ng-home`) uses the same pack. These are the only light,
on-brand surfaces in either product today, and nothing in the app shell reads
them.

**Chart standard.** `src/utils/chartTheme.js` (white plot, slate-200 grid,
slate-700 axis text, series colours dark enough for white) plus `ChartLogo`
and `ChartFrame` (white frame, reserved watermark band). 192 files use
ChartFrame or ChartLogo. On the dark console a chart is a white card on
slate; the standard is already "light", which the new light theme matches
naturally.

**Biggest sources of inconsistency**
1. Colour lives in class strings, not variables: the ui primitives and 842
   app files hard-code slate, so there is no single switch to theme anything.
2. Two unrelated palettes: the app consoles (slate plus blue, lime, cyan
   accents chosen per app) and the brand pack (ink, gold, paper) that only the
   homepages use.
3. The shadcn variable set is dark-only and partly misused (`--muted`), so
   even the components that do use tokens cannot go light.
4. Focus rings differ per primitive (blue-300, blue-500, cyan-500, lime) and
   the fonts differ (DM Sans declared but not loaded; homepage fonts unused in
   apps).
5. Status colour is ad hoc: each app picks its own green, amber and red, often
   on the dark background, and several reuse the same hues as series colours.

## 2. Phase 1 (this PR)

- **Tokens** in `src/design/tokens.js` (single source), generated into
  `src/design/theme.css` by `node scripts/design/build-theme-css.mjs`.
  Colour roles for light and dark; type families and scale; spacing; radii;
  shadows. See `DesignSystem.md` for the table.
- **Scoped themes.** Every rule in `theme.css` sits under `[data-pl-theme]`.
  Inside a scope the shadcn variables are re-pointed at the roles, so stock
  shadcn classes follow the theme. Outside a scope nothing changes.
- **ThemedApp / ThemeProvider** (`src/design/ThemeProvider.jsx`): light
  default, per-user choice in localStorage (`petrolord.theme.v1:<user id>`,
  `anon` when signed out, try/catch around every access), follows other tabs,
  does not read the OS preference (the codebase never did).
- **ThemeToggle** for app headers; renders nothing outside a scope.
- **Adapted ui primitives**: card, tabs, table, input, textarea, label,
  button, badge, select, dialog, popover, tooltip, dropdown menu, and the
  shared `StudioHeader`. Each renders its legacy classes byte for byte outside
  a scope and theme roles inside one. Portal content (dialogs, menus,
  selects, tooltips) carries `data-pl-theme` itself.
- **New shell pieces** (scope only): `AppHeader`, `PageContainer`,
  `PageSection`, `DisplayHeading` (`ui/app-shell.jsx`), `StatTile`
  (`ui/stat-tile.jsx`). Form layout uses the existing `ui/field.jsx`, which
  already reads shadcn variables and so follows the theme.
- **Canvases**: `data-canvas="dark"` keeps a region dark inside a light app;
  `ChartFrame` now carries `data-canvas="chart"`, which pins the light roles
  and a white surface inside either theme.
- **Dev specimen** at `/dev/design-system` (dev builds only).
- **Small fix**: `NEXTGEN_LIVE_COURSES` 72 to 79, pinned in the catalogue test.

### How non-pilot apps are proven unchanged
1. `src/design/__tests__/optInScope.test.jsx` renders every adapted primitive
   outside a scope and compares its class string with the string on main,
   byte for byte; mounts Voidage Replacement Monitor (a real non-pilot app)
   and asserts no `data-pl-theme`, no `*-pl-*` class, no toggle, and the
   `bg-slate-950` Studio root.
2. `tokens.test.js` asserts every selector in `theme.css` starts with
   `[data-pl-theme` or `[data-pl-root` (none touch `:root`, `.dark`, `body`,
   `html`), that `index.css` still holds the legacy dark values, and that the
   CSS is the generated output of the tokens.
3. Before/after DOM diff (manual, 2026-09-27): the Voidage Replacement
   Monitor page (with sample data and both tabs) and a kit of every adapted
   primitive including open dialog, popover, select and menu portals were
   rendered on main and on this branch. The kit HTML is identical. The page
   differs by one attribute, `data-canvas="chart"` on the chart frame, which
   no rule matches outside a scope.
4. Negative controls run: lowering light `muted` to `#9AA59E` fails the
   contrast tests; appending an unscoped rule to `theme.css` fails the
   scoping test.

## 3. Pilot selection

Evidence (read-only production counts, 2026-09-27; the product is early, so
volumes are small but they are the only usage signal stored):

| table | rows |
|---|---|
| saved_dca_projects | 12 |
| epe_cases | 10 |
| seismic_volumes / seismic_horizons | 6 / 5 |
| saved_quickvol_projects (ReservoirCalc Pro) | 5 |
| saved_vrr_projects, saved_well_test_projects, petro_projects | 4 each |
| every other saved_* / *_projects table | 0 to 3 |

`access_logs` and `usage_metrics` are empty, and `user_activity_logs` has 5
rows, so there is no page-view data yet.

**Chosen pilots (5)**

1. **Module hubs and the dashboard landing** (`/dashboard`,
   `/dashboard/<module>`: ten hub pages over one shared `ApplicationsGrid`).
   Every signed-in user sees them first, on every visit. Small surface (about
   160 slate classes across `ApplicationsGrid`, `Dashboard.jsx` and the ten
   hub wrappers, a third of them in `AssuranceHub`), so it shows the new look
   everywhere quickly. Needs the sidebar decision below.
2. **Decline Curve Analysis** (`apps/reservoir/decline-curve-analysis`). Most
   saved projects of any app (12), the reservoir flagship, and the reference
   app for the chart standard, so it exercises white charts in both themes.
   About 560 slate classes.
3. **Petroleum Economics Studio (EPE)** (`apps/economics/epe/*`). Second-most
   stored work (10 cases), the economics flagship and NPV home, and the
   smallest tree (11 pages, about 200 slate classes), a good first migration
   to settle the recipe.
4. **Seismolord** (`apps/geoscience/seismolord`). The dark-canvas pilot:
   the WebGL slice and cube viewers stay on `data-canvas="dark"` while the
   panels, trees and dialogs around them go light. Real data stored (6
   volumes, 5 horizons). About 650 slate classes.
   **Migrated 2026-09-28** (branch `feat/ds-pilot-seismolord`): section,
   map, 3D and synthetics canvases carry `data-canvas="dark"` with their
   classes and pixels unchanged (2D canvas buffers hash-identical, WebGL
   screenshots identical apart from the anti-aliased corner pixels);
   WorkspaceShell, ModuleHomeLink, HelpGuideLayout and the shared CRS, well
   and culture import forms follow the theme inertly (snapshots from main
   prove unmigrated apps unchanged). See `Seismolord-STATUS.md`.
5. **Voidage Replacement Monitor on the Studio kit**
   (`apps/reservoir/voidage-replacement-monitor`). 4 saved projects, and it
   is built on `StudioLayout`/`StudioHeader`, which 33 apps share. Migrating
   the kit's layout once lifts all of those apps' shells, so this pilot
   proves the cheapest path for the long tail. When it migrates, move the
   non-pilot proof in `optInScope.test.jsx` to another app.

Reserve: ReservoirCalc Pro (5 saved; the largest tree at about 890 slate
classes, better once the recipe is settled).

Pilots are **not** migrated in this PR.

### Per-pilot recipe
Wrap the route element in `<ThemedApp>`, then follow the checklist in
`DesignSystem.md` section 6. One PR per pilot, with a staging walk in both
themes.

## 4. Decisions for the owner

1. **Sidebar and dashboard frame.** Hubs sit inside `DashboardLayout` next to
   the dark `DashboardSidebar`. Options: (a) theme the whole dashboard frame
   (sidebar included) as part of pilot 1, so the landing is fully light;
   (b) keep the sidebar dark as a brand rail (ink green, like the homepage
   header) and theme only the content. Recommendation: (b) for the pilot,
   restyled from slate to ink so it matches.
2. **Primary colour in apps.** Proposed petrol green `#2F6B48` for primary
   actions in light (gold is too light for text on white; it stays the accent
   fill with ink text). In dark, primary becomes a light green `#7CC49A`.
   Confirm, or choose gold-filled primary buttons as on the homepages.
3. **Toasts.** The Toaster is mounted once at the app root, outside any
   scope, so toasts stayed dark inside light pilots. **Revised 2026-09-28:
   toasts match the page.** Each outermost `ThemedApp` publishes its theme
   (`src/design/activeTheme.js`) and the root sonner toaster follows it;
   with no app opted in on screen it keeps its legacy look (follow-up PR,
   `feat/ds-followup`).
4. **Theme choice storage.** localStorage per user per browser, as briefed.
   A profile column would follow the user across devices but touches the
   shared users table (second-engineer review). Recommend staying on
   localStorage until pilots are live.
5. **First paint for dark users.** The user id arrives after the auth session
   restores, so a user who chose dark saw one light frame on a cold load.
   Fixed in pilot 1: the provider also keeps the last theme resolved for a
   signed-in user under one device key (`petrolord.theme.v1.last`) and uses
   it only while AuthContext is still loading with no user. Once the id is
   known the per-user choice applies as before; signed-out pages never read
   it. Tests in `src/design/__tests__/ThemeProvider.test.jsx`.

## 5. Status

### Pilots (all five merged, 2026-09-28)

| # | pilot | PR | notes |
|---|---|---|---|
| 1 | Module hubs and dashboard landing | #747 | `HubScope`, ink sidebar rail |
| 2 | Decline Curve Analysis | #750 | on the Studio kit, white charts |
| 3 | Petroleum Economics Studio (EPE) | #748 | recipe in `DesignSystem-example-EPE.md` |
| 4 | Seismolord | #751 | dark canvases, shared shells and forms |
| 5 | Voidage Replacement Monitor + Studio kit | #749 | kit themes itself inside a scope |

### Follow-up (`feat/ds-followup`, 2026-09-28)
The pilots' combined needs, built once in `src/design` and
`src/components/ui`, all inert outside a scope (pinned DOM in
`src/design/__tests__/uiLegacyDom.test.jsx`):
- adapted checkbox, switch (thumb hook), accordion, scroll-area, sheet,
  slider, progress, alert, separator, context-menu, alert-dialog, skeleton,
  toggle and toggle-group; Badge `neutral` and `selected`
- new `SegmentedControl`, `NativeSelect`/`CompactInput`, `ChartPanel`,
  `NumericTable`, the `primary-text-hover` role, `rounded-pl-canvas`, and
  `AppHeader` actions that wrap on phones
- one opt-in helper, `useThemeClass` (`src/design/themeClass.js`); the
  Studio kit's `useStudioTheme` returns the same picker
- toasts follow the page (decision 3 revised); AccessDenied and ComingSoon
  themed inside a scope; cold-load loaders on pilot paths paint the
  device's last theme
- pilot workarounds removed (EPE `epeCheckbox`, DCA `dsClasses.js`,
  Seismolord `themedContextMenu.jsx`, the hub Skeleton override); VRR
  wraps itself in `ThemedApp` and dropped its legacy branch; the
  non-pilot proofs (`optInScope`, `hubScope`) mount Waterflood Design
  Studio

### Grey tone experiment (owner, 2026-09-28)
Owner feedback on the live pilots: "The new looks are really awesome ...
However, I was expecting light grey for the apps consoles and not off white.
Let us try light grey please. Experiment it on Seismolord and let me provide
feedback." Branch `feat/ds-grey-tones`.

Three light-grey **tones** of the light theme, in `tokens.js` `LIGHT_TONES`.
A tone overrides only the neutral roles; petrol-green primary, gold accent,
ink text and the status colours are unchanged, and the dark theme is
untouched. Every tone passes the full `CONTRAST_PAIRS` AA contract
(`tokens.test.js`). All greys are neutral or very slightly cool (the
off-white has a green tint).

| role | off-white (current) | grey-soft | grey-panel | grey-classic |
|---|---|---|---|---|
| bg (page) | `#F2F4EF` | `#E6E9EC` | `#E1E4E8` | `#D8DCE1` |
| surface (panels, cards) | `#FFFFFF` | `#FFFFFF` | `#EDEFF2` | `#E2E5E9` |
| raised (menus, dialogs) | `#FFFFFF` | `#FFFFFF` | `#F8F9FA` | `#F3F4F6` |
| sunken (rails, headers) | `#E7EBE3` | `#DCE0E4` | `#D8DCE1` | `#CAD0D6` |
| border | `#D5DCD2` | `#CCD2D8` | `#C3C9D0` | `#AEB5BE` |
| border-strong | `#7D8B82` | `#7A838C` | `#6E7883` | `#5F6973` |
| muted text | `#56655C` | `#525C66` | `#4D5761` | `#454E57` |

- **grey-soft**: grey page and rails, white panels. The lightest step away
  from off-white.
- **grey-panel**: grey page and grey panels, lighter menus and cards.
- **grey-classic**: the neutral mid-light grey of engineering desktop panels
  (Petrel, Techlog), with darker borders.

How it works. `ThemedApp` takes an optional `tone`; it sets
`data-pl-tone` on the scope root, nested scopes and portal content
(`usePortalThemeProps`). `theme.css` has one block per tone under
`[data-pl-theme="light"][data-pl-tone="<name>"]` (plus that scope's
`data-canvas="light"` and `data-canvas="chart"` regions). Without a tone
(every other pilot) nothing changes: no attribute, `tone: null` in the
context, the same portal props. In dark the tone has no effect. Dark
canvases inside a toned scope re-declare every role, so they stay
pixel-identical (canvas interiors hashed identical across off-white, the
three greys and dark).

How to switch on staging. Open Seismolord on suite.studio.petrolord.com; the
ribbon shows a **shade picker** beside the light/dark toggle: "Off-white
(current)", "Grey soft", "Grey panel", "Grey classic". The choice is kept per
user in the browser (`petrolord.theme.v1.tone:<user id>`) and the help guide
follows it. The picker is disabled in dark (shades are for the light theme).

Gating. The picker renders only on a Vite dev server
(`import.meta.env.DEV`, via `src/lib/devBuildFlag.js`) or on a
`*.studio.petrolord.com` host (`isToneExperimentEnabled` in
`src/pages/apps/Seismolord/toneExperiment.jsx`). A production build on
petrolord.com renders no picker, reads no stored tone and keeps today's
off-white (tests: `toneExperiment.production.test.jsx` and
`toneExperiment.staging.test.jsx`).

Next: the owner picks a tone (or none). The chosen values then replace the
light theme's neutral roles for every scope, and the picker and the
experiment gate are removed.

### Rollout waves (from the pilot 5 estimate)
The pilot 5 survey sized the remaining Studio-kit apps as **15 small,
6 medium and 11 large**; the main blockers were the unadapted
`Accordion` and `Switch`, which the follow-up adapts. Plan:
- **Wave A, the 15 small kit apps**: wrap the route (or the page, like DCA
  and VRR) in `ThemedApp`, remove their own slate classes, add the route to
  `coldLoad.jsx`. Several per PR, grouped by module.
- **Wave B, the 6 medium kit apps**: one PR each; charts through
  `ChartPanel`, ledgers through `NumericTable`.
- **Wave C, the 11 large kit apps**: one PR each after A and B, with a
  staging walk in both themes; ReservoirCalc Pro (the reserve pilot) leads.
- Non-kit apps follow the EPE recipe, one per PR.
Each wave keeps the non-pilot proof on an app that has not migrated yet
(move it off Waterflood Design Studio when that app's wave comes).

### Pilot 1: module hubs and dashboard landing (2026-09-27, `feat/ds-pilot-hubs`)
- Opt-in: a pathless layout route in `App.jsx` wraps exactly `/dashboard`
  (index) and the ten hub routes in `HubScope` (`src/components/hubs/`),
  one `ThemedApp` for all of them, so the theme holds while moving between
  hubs. Lazy hubs suspend inside the scope with a themed loader.
- Every other route under `/dashboard` (applications, admin pages) sits
  outside the scope. Proof in `src/components/hubs/__tests__/hubScope.test.jsx`:
  the App.jsx block holds only the landing and the ten hubs; Voidage
  Replacement Monitor mounted through the real `DashboardLayout` has no
  `[data-pl-theme]` ancestor, no toggle and no pl-* class, and its markup is
  identical to the app rendered on its own (negative control: moving the
  app route inside the scope fails the test).
- Sidebar (lead decision 1): a fixed `data-pl-theme="dark"` rail in the ink
  green, gold eyebrows, gold bar on the active item, in both themes. At
  phone width it moves into a drawer opened from an ink top bar.
- Shared chrome: `HubHeader` (eyebrow, serif title, actions, toggle),
  `HubSearch`, `HubToolbar`, `HubSectionTitle`. `ApplicationsGrid` is on
  theme roles (it is only mounted in the hubs): status badges `info` Coming
  Soon, `secondary` In Development, `warning` Locked; keyboard-openable cards.
- Dev harness `/dev/hubs/<landing|hub slug|wds>` on the in-memory Supabase
  (`wds`, Waterflood Design Studio, is the unmigrated app since VRR became
  pilot 5).

- 2026-09-27: phase 1 built on `feat/design-system` (tokens, scoped themes,
  provider, adapted primitives, shell pieces, specimen, docs, tests). Pilots
  not started. Next: owner decisions above, then pilot PRs in the order EPE,
  hubs, DCA, VRR/Studio kit, Seismolord.
- 2026-09-27: pilot 5 (Voidage Replacement Monitor and a theme-aware Studio
  kit) on `feat/ds-pilot-vrr`. The kit (`src/components/studio/*`) picks its
  classes with `useStudioTheme()` (`studioTheme.js`): legacy strings byte for
  byte outside a scope, theme roles inside one; on phones the themed rails
  float over the page with their own close button and the header wraps.
  Another Studio-kit app now opts in by wrapping its route in `ThemedApp` and
  migrating its own panels. The non-pilot proof in `optInScope.test.jsx`
  still mounts VRR outside a scope (VRR keeps its legacy branch for that;
  the follow-up moved the proof to Waterflood Design Studio and dropped
  the branch);
  it can move to another app, for example Waterflood Design Studio.
- 2026-09-28: pilot 2, Decline Curve Analysis, on `feat/ds-pilot-dca`. Built
  on the pilot 5 kit (`useStudioTheme()`); DCA's own panels migrated, charts
  stay white via `data-canvas="chart"`. `studioKitLegacyDom.test.jsx` adds a
  whole-kit DOM fixture from pre-pilot main (tag, class, aria-label) as a
  second proof that other Studio apps are unchanged.
- 2026-09-28: pilot 4, Seismolord, on `feat/ds-pilot-seismolord` (PR #751). The dark
  canvas pilot: section, map, 3D and synthetics canvases carry
  `data-canvas="dark"` and keep their legacy classes and pixels (2D canvas
  buffers hash-identical to main in both themes, WebGL screenshots identical
  apart from the anti-aliased corner pixels; radius pinned at the legacy
  8px). The workstation shell, module home link, help guide layout and the
  shared CRS, well and culture import forms follow the theme only inside a
  scope (`useThemeClass`, `src/lib/themeClass.js`; snapshots from main in
  `sharedShellsOptIn.test.jsx` and `sharedFormsOptIn.test.jsx`).
  `themedContextMenu.jsx` stood in until `ui/context-menu` was adapted
  (removed in the follow-up).
