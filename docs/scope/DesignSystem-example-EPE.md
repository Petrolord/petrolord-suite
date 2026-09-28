# Worked example: Petroleum Economics Studio (EPE)

Pilot 3 of 5, 2026-09-27. The first app migrated onto the design system, kept
as the recipe for the apps that follow. It is a companion to
`docs/scope/DesignSystem.md` (owned by the design-system lead); read section 6
there first, then use this page for the concrete steps and the traps.

Scope: 11 page files (`src/pages/apps/epe/*`, `src/components/epe/*`), about
800 legacy colour classes before, none after. No engine, calculation, export
or behaviour change: the four existing EPE suites pass unchanged.

## 1. One scope for the whole app

`src/App.jsx` wraps every EPE route in one pathless layout route, so the
theme does not remount when the user moves between pages:

```jsx
<Route element={<ThemedApp className="min-h-screen"><Outlet /></ThemedApp>}>
  <Route path="apps/economics/epe/cases" element={...} />
  ...all eight EPE routes...
</Route>
```

The redirects stay outside the layout route. The dev harness
(`/dev/epe/...`) uses the same `ThemedApp`, so screenshots match production.

## 2. A local recipe file, no hues in pages

`src/pages/apps/epe/epeUi.js` holds every class string the pages share, all
written with theme roles:

| export | use |
|---|---|
| `epePage` | page body under the header (`max-w-[1400px]`, 16px gutter on phones) |
| `epePanel`, `epeSubPanel`, `epeTile`, `epeRow` | cards, groups inside a card, KPI tiles, clickable list rows |
| `epeH2`, `epeH3`, `epeEyebrow` | section headings and small uppercase group labels |
| `epeNum`, `epeNumCell`, `epeSigned(v)` | mono tabular numbers; right-aligned cells; danger text for a negative |
| `epeSelect`, `epeCellInput` | native `<select>` matched to the themed Input; dense editor-table inputs |
| `epeNativeCheck` | native checkbox accent (the Radix `Checkbox` themes itself since the follow-up; `epeCheckbox` is gone) |
| `epePill(active)` | segmented choices and results tabs (works as a `Button` className) |
| `epeCallout(tone)`, `epeBadge(tone)` | status boxes and pills: info, success, warning, danger, neutral |
| `epeTh`, `epeThNum`, `epeTd`, `epeTable` | hand-written tables |

Copy the file for your app and rename the prefix. It keeps pages readable and
gives one place to change when the lead adds a shared primitive.

## 3. Steps, in the order that worked

1. **Codemod the obvious classes.** A throwaway script mapped the legacy
   dark-console classes to roles, keeping variant prefixes (`hover:`,
   `data-[state=checked]:`):
   - `text-white`, `text-slate-100..300` to `text-pl-text`; `text-slate-400..600` to `text-pl-muted`
   - `bg-white/10` to `bg-pl-surface`; `bg-white/5`, `bg-slate-800`, `bg-gray-700` to `bg-pl-sunken`; `bg-gray-800` (inputs) to `bg-pl-surface`; `bg-gray-900` (dialogs) to `bg-pl-raised`
   - `border-white/*`, `border-slate-500..800` to `border-pl-border`
   - red, amber, green, blue to the matching status `-text`, `-bg` and `/40` border
   - `backdrop-blur-lg` removed

   It left gradients and cyan or lime text for the manual pass on purpose.
2. **Manual pass, file by file.** The codemod guesses wrong in context:
   - Cyan and lime were decoration. Headings become `text-pl-text`,
     subtitles `text-pl-muted`, KPI values `text-pl-text` in mono. Keep
     `text-pl-primary-text` for links and active icons only.
   - A text colour inside a status box must match the box
     (`bg-pl-info-bg` with `text-pl-info-text`), so use `epeCallout(tone)`.
   - Every gradient goes: primary buttons become the default `Button`
     (petrol green), segmented toggles `epePill`, icon tiles
     `bg-pl-primary text-pl-primary-fg` (the `AppHeader` icon does this).
   - Remove colour overrides from `Input`, `Textarea`, `DialogContent` and
     `Card` (`bg-gray-800 border-slate-600`...). tailwind-merge lets them win
     over the themed defaults, so leaving them keeps the page dark.
3. **Headers.** Each page's back button, gradient icon tile and big title
   became `AppHeader` (eyebrow "Petroleum Economics Studio", page title,
   subtitle, `backTo`, `backLabel` = the old button text, which stays the
   accessible name). Keep header actions to one or two icon buttons: the
   actions slot does not wrap, so four text buttons scroll sideways at 390px.
   Put the rest in a wrapping row at the top of the body.
4. **Status only for status.** Run badges (Failed, Running, Locked,
   Approved), file states, economic-limit and abandonment pills and the
   PIA framework badge use tones. Decorative KPI icon colours were removed.
   Deltas in the comparison keep success or danger because they carry a sign.
5. **Charts untouched.** `ChartFrame`, `chartTheme` and `CHART_COLORS` stay;
   the white chart wrappers that the PDF captures (`epe-pdf-capture-*`) keep
   their inline white and gain `data-canvas="chart"`. Headings inside a white
   chart card keep `CHART_COLORS`; headings outside use `text-pl-text`.
6. **Phone width.** `grid-cols-2` became `grid-cols-1 sm:grid-cols-2`,
   `col-span-2` inside a one-column grid became `md:col-span-2` (it creates an
   implicit column and overflows), button rows got `flex-wrap`, fixed widths
   got `w-full sm:w-64`.
7. **Copy pass** on text touched: no em dashes in prose (the `—` empty-cell
   placeholder in tables and exports stays, it is a value), and no "rather
   than" or "instead of".

## 4. The cash-flow table recipe

The Year-by-Year Detail table moved from white chart styling to themed
classes, because people read it line by line like a ledger:

- outer card `border-pl-border bg-pl-surface`; an inner `overflow-x-auto`
  scrolls the table so the page never scrolls sideways
- header `epeTh` / `epeThNum` on `bg-pl-sunken`, with a
  `border-b-2 border-b-pl-border-strong` rule; year headers in mono
- row labels are `<th scope="row">`, sticky left on `bg-pl-surface` so the
  numbers scroll under them; on phones they wrap inside 8 to 10rem
- every number `epeNumCell`: right aligned, `font-pl-mono tabular-nums`,
  no wrap; a negative gets `epeSigned(raw)` (danger text beside its minus
  sign, so colour is not the only signal)
- Net Cash Flow row semibold with a strong top rule; Cumulative CF success
  text when zero or above, danger when below
- the `fmt` functions are unchanged, so the table, CSV, XLSX and PDF agree

The comparison tables use the adapted `Table` with the same cell classes.

## 5. Tests

- The existing suites (`piaScreens.mount`, `piaCompliance`,
  `engines193Epe`, `economicsDefects`) pass unchanged. They render the
  pages outside a scope, so they also prove the legacy path still mounts.
- New `src/pages/apps/epe/__tests__/epeThemeScope.test.jsx`: the case list
  inside the App.jsx layout route opens light, the header toggle switches to
  dark and back and stores the choice per user; no legacy class
  (`slate|gray|zinc|lime|cyan`, `text-white`, `bg-white/`, gradients) is
  left under the scope root (negative control: a planted `text-slate-400`
  fails it); App.jsx keeps all eight EPE routes inside the one layout route.
- Screenshots: the harness pages in light and dark at 1440 and 390 wide,
  with a scrollWidth check for horizontal page scroll (none).

## 6. Traps worth knowing

- The worktree's tracked `node_modules` is partial, so jest and vite fail
  there. Run them from a mirror with `node_modules` symlinked to the primary
  checkout, and always pass a private vite `cacheDir`; the default would
  write into the shared staging `.vite`.
- `ThemedApp` reads `AuthContext` for the per-user theme key. A test that
  mocks `@/contexts/SupabaseAuthContext` must keep exporting `AuthContext`
  if it renders `ThemedApp`; the EPE test renders a real
  `AuthContext.Provider` around the layout route.
- `Button asChild` around a `Link` gives one focusable element; a `Link`
  around a `Button` gives two.
- The shadcn `Checkbox` inside a scope with `--radius: 12px` looked round;
  the adapted `Checkbox` now sets a 4px corner itself.

## 7. Needs raised for the design-system lead

All seven were built in the design-system follow-up (2026-09-28): the
adapted `Checkbox`; `NativeSelect` and `CompactInput` (`epeSelect` and
`epeCellInput` re-export them); `SegmentedControl`; `NumericTable`
(`epeSigned` re-exports its `signedTone`); `ChartPanel`; the
`primary-text-hover` role (EPE links use it); and `AppHeader` actions that
wrap on phones. See `DesignSystem.md` section 5.

1. Adapt `@/components/ui/checkbox` (EPE overrides it with `epeCheckbox`).
2. A themed native `select` and a compact dense-table input style.
3. A segmented control or toggle group with `aria-pressed` built in.
4. A numeric table variant: sticky label column, totals rule, signed-number
   colour.
5. A titled white chart card (`ChartPanel`) so apps stop repeating the
   white wrapper with `data-canvas="chart"`.
6. A hover role for text links (`primary-text-hover`); EPE uses
   `primary-hover`.
7. `AppHeader` actions that wrap or collapse on phones.
