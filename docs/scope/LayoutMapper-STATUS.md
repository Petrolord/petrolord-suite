# Facility Layout Mapper — status

Phase: Facilities F8 (Facilities-ROADMAP.md §3 app 8, §5 F8)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f8)
Slug: `facility-layout-mapper` (unchanged; no tile migration — the
tile's promise is now kept rather than changed).

## What this phase was for

The Layout Mapper was the module's honest oddity: a genuinely working
geospatial drafting tool (Leaflet placement, pipe runs with flow
decorators, DXF/KML/SVG/GeoJSON/PDF export, Supabase persistence) with
**zero engineering math**, while its catalog tile advertised "safety
distances". Owner decision F#2 kept it as a utility tile and deferred
the spacing checks to this phase. This is the missing half.

## What shipped

- **Engine** (`@petrolord/engines` PR #84, vendored, shim at
  `src/utils/facilities/engine/spacing.js`) that keeps two kinds of
  answer visibly apart:
  - **TABLE spacings** between equipment classes: the customary
    onshore production figures, symmetric, replaceable wholesale by a
    site standard, and returning `null` rather than guessing on an
    unknown pair. A table is a table and the UI says so.
  - **COMPUTED setbacks** from the duty: flare radiation via the same
    API 521 point-source model the F2 relief engine uses, and pool
    fires via published burning-rate and Thomas flame-height
    correlations. These **move when the duty moves**, which a table
    figure cannot, and the engine flags when the point-source model is
    being applied inside the flame height where it under-predicts.
- **Great-circle distances**, because the mapper places equipment on a
  map and a planar distance is wrong at the scale of a large site at
  high latitude.
- **Suite adapter** `src/utils/facilities/layoutSpacing.js` (no
  physics): maps icon names to equipment classes, and deliberately
  **refuses to judge** pipe runs (no single position) and custom icons
  (no class the table knows), reporting them instead of silently
  passing them.
- **Safety Spacing panel** in the mapper's control accordion:
  pass/fail summary, computed setbacks with their notes, violations
  sorted worst-first with the shortfall named, and the honest
  statement of what was skipped and why.
- **Equipment tags are now sequential, not random.** The audit flagged
  `Math.random()`-suffixed tags; an equipment tag is an identity a
  drawing and a datasheet share, and a suffix that changes on every
  placement is not one.

## Validation

Oracle (`oracle_spacing.py`) checks the distance against **both** the
Vincenty sphere formula **and** a 3D chord-through-the-earth
derivation — three formulations of the same quantity — and checks the
radiation setbacks by **round trip**: compute the intensity at the
returned distance and confirm it equals the allowable. 14 engine gates
plus 8 adapter gates; engines suite 1961 green.

## Honest limits (stated in-app)

- Table spacings are industry-practice figures, not a calculation, and
  a site standard should replace them.
- Pipe runs and custom icons are not judged.
- The pool-fire point source under-predicts close to the flame; the
  engine says when that is happening.

## Open

- No tile migration: the tile keeps its name and Active status. Its
  claim is simply true now.
- ARMED literature gate: the published spacing tables themselves
  (owner PDFs) — the values here are the commonly cited figures.

## FC1-0 repairs (2026-09-15, branch fix/fc1-0-separator-layout-apps)

Suite-side repairs, decided under the owner's delegation. Engine repairs
run in a separate engines PR; nothing under packages/engines changed here.

- **S1 pool-fire setback measured from the wrong point (HIGH, failed
  open).** The adapter passed the engine's `setbackFromEdgeM` while
  `checkLayout` measures centre to centre from the tank icon, so the check
  was short by half the pool diameter (default 20 m bund: 56.1 m used,
  66.1 m true). It now uses `radiusFromCentreM`, labelled "radius from the
  tank centre", with the edge distance shown for reference. Gate
  reproduces the probe at 60 m, the old wiring passing it, and a 70 m
  negative control.
- **Radiation inputs exposed and saved.** Flare: relief rate, LHV,
  fraction radiated, allowable. Pool: diameter, burn rate, LHV, fraction
  radiated, allowable (separate from the flare's). Initial values are the
  previous panel values and the engine's own pool defaults. A blank input
  is named ("Flare setback not computed. Missing or invalid: ...") and the
  check is marked incomplete. Saved inside `facility_layouts.layout_data`
  as `{ layers, spacingInputs }`; state kind `facility-layout` is now
  version 2 with a 1 -> 2 migrator for bare layer arrays. No schema change.
- **PDF export** gains a Safety spacing section (summary, uncomputed
  setbacks, computed setbacks, violations, measurement notes).
- **Pipeline tags** are sequential (`PL-001`) from the tags on the map,
  sharing `src/utils/facilities/layoutTags.js` with equipment tags.
  (The "sequential tags" claim above was true for equipment only until now.)
- **Help guide** added (`LayoutMapperHelpGuide.jsx`, header button), with
  a coverage and copy-rule guard.

Engine follow-ups to adopt when the engines repair PR lands: any rename of
`radiusFromCentreM` (the adapter falls back to edge + D/2), and any
`skipped`/`complete` flags checkLayout starts returning (the adapter
currently computes `complete` from its own source errors).


## FC1-0 engine integration (2026-09-15, engines #188)

`checkLayout` now reports what it could not judge, and the adapter and the
panel follow it:

- **Both skip lists survive.** The engine returns `skipped` as
  `[{ id, reason }]`; the adapter used to overwrite that with its own list
  of pipe runs and custom icons. The two are merged now. Standard
  equipment that has no position is passed to the engine without
  coordinates so the ENGINE skips it ('bad-coordinates') and marks the
  check incomplete, rather than the adapter dropping it silently.
- **Completeness is the engine's flag**, with the one thing it cannot
  see: a radiation setback the adapter could not compute.
- **`pass` can be null.** When every pair on a layout has no required
  spacing, nothing was checked, and the panel says so instead of showing
  a pass.
- **Two rankings, neither called "worst" alone**: `worstAbsolute` (the
  largest shortfall in metres) and `worstRelative` (the largest shortfall
  as a fraction of its own requirement), both shown, and `severity` is
  now `shortfallFraction` on every violation.
- `poolFireSetbackM` carries `setbackStatus`, so a radius that lies
  inside the pool edge says why the edge setback is zero.

## 2026-09-28: design system rollout W5A (light default, dark per user)

The page wraps itself in `ThemedApp` (App.jsx is untouched), so the app
opens on the grey panel light theme; a theme toggle now sits beside the
help guide in the sidebar header and switches to dark and back, stored per
user. The route prefix `/dashboard/apps/facilities/facility-layout-mapper`
is registered in `src/design/rollout/w5a.js` for the themed cold-load
loaders.

- Chrome on roles: the sidebar, its accordion sections, the equipment
  palette (the picked tool is the primary fill), custom icons, precision
  placement, properties, the save and load dialogs and the export buttons
  moved to `pl-*` roles. The dark overrides on the adapted Input, Select,
  Dialog and Button went, and the teal buttons are the standard primary
  and secondary buttons. The decorative gradient behind the page and the
  app icon went.
- Status colour only for status: the safety spacing verdict (fail as
  danger, incomplete or nothing checked as warning, all pass as success),
  the shortfalls and the setback notes.
- The map is a canvas: the plot plan is drawn on a street basemap whose
  tiles are light in both themes, so it sits on `data-canvas="light"`
  and the coordinate readout and the equipment markers keep the light
  roles over it in either theme. The pipeline stroke colours are map
  drawing and did not change. The canvas is its own stacking context
  (`relative z-0`), which also fixes a defect on main: Leaflet's panes
  (z-index 400) covered the save, load and help dialogs.
- Phones: the sidebar stacks above the map (half the screen at most) and
  the map takes the rest; no sideways page scroll at 390 px.
- Exports: the SVG, DXF, KML, GeoJSON and PDF files are unchanged.
- Tests: new `src/pages/apps/__tests__/FacilityLayoutMapper.theme.test.jsx`
  (the shared `describeAppTheme` checks, the light map canvas, every
  sidebar section with a tool picked, the placement tabs, the save and
  load dialogs and the help drawer; Leaflet and the export libraries are
  stubbed in jsdom). No calculation change; the existing suites pass
  unchanged.
