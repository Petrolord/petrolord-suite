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
   scope, so toasts stay dark inside light pilots. Acceptable for phase 1;
   theming them needs the Toaster to read the active pilot's theme.
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
- Dev harness `/dev/hubs/<landing|hub slug|vrr>` on the in-memory Supabase.

- 2026-09-27: phase 1 built on `feat/design-system` (tokens, scoped themes,
  provider, adapted primitives, shell pieces, specimen, docs, tests). Pilots
  not started. Next: owner decisions above, then pilot PRs in the order EPE,
  hubs, DCA, VRR/Studio kit, Seismolord.
