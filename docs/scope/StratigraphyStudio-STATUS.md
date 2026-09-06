# Stratigraphy Studio, STATUS

Plan of record: docs/scope/Stratigraphy-PLAN.md (approved as recommended
2026-09-06, PR #411). Roadmap slot: Geoscience-ROADMAP.md Phase G9, the
eleventh Geoscience tile. Slug `stratigraphy-studio`, route
`/dashboard/apps/geoscience/stratigraphy-studio`, harness
`/dev/stratigraphy-studio`. Engines: `packages/engines/engines/stratigraphy/`
(central repo Petrolord/petrolord-engines, subtree-vendored).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| ST0 stratigraphic framework | **COMPLETE 2026-09-06: migration APPLIED, pentest green, PR #412 merged** | engines #140 (vocabulary, ICS 2023/09 timescale, column tree; 66 tests); Suite branch `feat/st0-stratigraphic-framework`: migration 20260906180000 (geo_strat_units + typed-top columns), stratRegistry.js, typed tops through wellsRegistry, typed markers in Well Correlation and Petrophysics, Type/Unit/Confidence/Age in the Well Data Manager tops tab, the Stratigraphy Studio app (Column editor, Tops typing, Glossary, terminology display option), portability spec + hook, guard test, pentest SQL, e2e |
| ST1 lithology, core and facies | not started | |
| ST2 sequence stratigraphy + Wheeler | not started | |
| ST3 biozones and ages | not started | |
| ST4 stratigraphic maps | not started | |
| ST5 seismic stratigraphy | not started | |

## ST0, what shipped

**Engines (petrolord-engines PR #140, merged, subtree ec85d59).**
- `vocabulary.js`: the ten stored surface codes (`formation_top`, `SU`,
  `CC`, `BSFR`, `RSME`, `MRS`, `TRS`, `MFS`, `unconformity`, `biozone`),
  five systems tracts, five log motifs, three stacking patterns.
  `displayLabel(code, scheme, {kind, short})` returns the label of the
  chosen scheme with `fallback: true` where Exxon has no term (RSME, FSST,
  RST). `surfaceLineStyle(code)` is the marker style every painter uses.
  `expectedTract(lower, upper)` names the tract a pair of surfaces bounds
  (depositional-sequence model with CC sensu Hunt and Tucker, plus the
  T-R model), `certain: false` when an internal boundary was not picked.
- `timescale.js`: the ICS International Chronostratigraphic Chart
  v2023/09 (CC BY 4.0) as committed data: 102 Phanerozoic ages plus the
  Precambrian, `approx` flagged where the chart says "~". Lookups by name
  and by age (`unitsAt`, `unitAt`, `unitsBetween`, `lineage`). Guard tests
  pin the K/Pg boundary at 66.0, Tr/J at 201.4, base Cambrian at 538.8 and
  gap-free tiling at every level.
- `column.js`: unit tree (`buildColumnTree`, `orderedUnits`),
  `validateColumn` (orphans, cycles, rank order, age order, ages outside
  the parent), `inheritedTopAge`.

**Migration 20260906180000 (APPLIED 2026-09-06 by the owner, the second-engineer review).** New
`geo_strat_units`; additive `surface_type`, `unit_id`, `confidence`,
`age_ma`, `notes` on `geo_wells_tops` with check constraints. A jest
guard reads the migration and compares the check list with the engine's
`SURFACE_CODES`. Live pentest in `tools/validation/stratigraphy/rls-pentest.sql`
(four blocks: private units, org read-only, typed tops ride the tops RLS
and refuse bad codes, delete clears references without cascading).

**Services.** `src/lib/stratRegistry.js` (units CRUD, `shareColumn`,
stamped through stateVersion kind `strat-unit`). `wellsRegistry.js`
`saveTop`/`updateTop`/`replaceTops` accept the typed fields through
`topRow`; callers that never heard of them are unchanged.

**Consumers opted in.**
- `paintTopMarker` takes `style` and `label`; Well Correlation's section
  and Petrophysics' track viewer draw each top with its type's line style
  and put the typed abbreviation in front of the name (formation tops
  unchanged). The section exposes `data-top-types` and `data-scheme` for
  the e2e.
- Well Data Manager tops tab: Type (select, scheme-labelled), Unit
  (select from the column), Confidence, Age (Ma) columns in the grid and
  the table; `RowGridEditor` gained a `select` column type. The backends
  expose `listUnits`.
- The in-memory backends of Well Correlation, Petrophysics and Well Data
  Manager carry the typed fields; the correlation sample types Mid Shale
  as MFS and Base Sand as SU.

**Stratigraphy Studio app** (`src/pages/apps/StratigraphyStudio/`).
Workstation on the shared shell: ribbon (Geoscience home, view buttons,
terminology select `strat-scheme`, dock toggle), explorer (registry wells,
the column as a tree, a Well Data Manager link), centre views Column
editor (`ColumnEditor`: ranks, parents, sibling order, ages typed or
filled from an ICS stage, colours; save validated by the engine and
refused as a whole on a problem; new parents saved before new children),
Tops typing (`TopsTyping`: type, unit, confidence, age per top of the
selected well; the tract a typed pair bounds shown read-only), Glossary
(both schemes, fallback badges), dock legend. Registry and in-memory
backends; jest (backend + components, 19 tests) and e2e
`e2e/stratigraphy-studio.spec.js`.

**Terminology display option.** `src/lib/stratigraphy/scheme.js`:
localStorage `strat.scheme`, `useScheme()` follows changes in the page
and across tabs. Every painter and list reads it. The guard test greps
`src/` for Exxon labels outside the engine, so a component can never
store or compare one.

**Portability.** `geoscienceSpec.js` gains `geo_strat_units` (scope
user/org, stamped, optional self reference) and the optional
`unit_id` soft reference on tops; the collector hook pulls the units a
packaged top names, with their ancestors; import order puts units before
tops.

## Deviations from the plan

- The tile is NOT seeded Archived in ST0 (plan section 7 said it would
  be). A throwaway Archived row plus a later flip is two migrations for
  nothing; the route is reachable by superadmins meanwhile and the tile
  seeds Active at close-out, in the same PR as the help guide. Recorded
  here so the close-out does not look for a row to flip.
- The pre-existing `appLinks` test expectation for Seismolord's harness
  path was stale since SL0 (red on main); fixed in this branch.

## Verification

- Engines: 66 tests + copy lint green in the central repo.
- Suite jest on the touched areas green (Stratigraphy Studio, lib/stratigraphy,
  components/wells, Well Correlation, Well Data Manager, Petrophysics,
  portability).
- e2e `stratigraphy-studio.spec.js` on the staging harness: column save,
  typed top, scheme toggle with fallback badge, read-only shared well,
  Well Correlation typed markers. See the PR for the run.
- Live RLS pentest 2026-09-06: all four blocks as expected (see MIGRATIONS.md row), zero residue.

## Close-out (ST0 acceptance, plan section 7)

Done in this build: a top typed MFS in Stratigraphy Studio draws as an MFS
in Well Correlation (same rows, typed marker) with the existing tops
reload; the Exxon toggle relabels it "Maximum flooding surface (MFS)";
FSST shows the fallback badge in the glossary. Migration applied and pentest run 2026-09-06; PR #412 merged. Remaining
for the owner: walk the app on staging.
