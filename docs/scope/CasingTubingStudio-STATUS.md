# Casing & Tubing Design Studio — STATUS

App: Drilling module, slug `casing-tubing-design-pro` (Drilling-ROADMAP.md
§4 D6). The Horizons-era Casing & Tubing Design Pro (45 files, mock
physics, permanently-null results, the module's LAST `public.wells`
reader) UPGRADED IN PLACE: same slug/tile/route and UI skeleton, real
engine, real data spine, real persistence. Built 2026-08-27 (waves U0-U3,
one Suite PR + engines PRs #43/#45).

## What shipped

- **Engine** (`@petrolord/engines` PRs #43/#45, subtree-pulled;
  `packages/engines/engines/drilling/tubularDesign.js`):
  - `barlowBurstPa` — API internal yield (Barlow, 12.5% wall tolerance).
  - `api5c3CollapsePa` — the FOUR-regime API 5C3 collapse
    (yield/plastic/transition/elastic) with the published A,B,C,F,G
    coefficient polynomials and D/t regime boundaries; combined loading
    via the axial-adjusted yield Ypa (tension derates collapse). The
    single sanctioned imperial boundary (Yp→psi inside, documented).
  - `triaxialSF` — Lamé hoop/radial at BOTH walls + axial ± bending
    (σb = E·(OD/2)·κ from design DLS), von Mises worst point.
  - `loadCaseProfiles` — 7 canonical generators (gasKickBurst,
    pressureTestBurst, full/partialEvacuationCollapse, cementingCollapse,
    runningAxial, customGradient) → {tvd, pi, po, fa} on a 51-point grid.
  - `evaluateString` — per section × case, scanning the WHOLE profile for
    the governing depth (the legacy shoe-only miss), collapse derated by
    the local axial stress, PASS/WARN/FAIL banding.
  - `tubingLoads` — the Lubinski/Hammerlindl planning set: piston
    (seal-bore/tubing areas), ballooning (0.6 form), thermal (−EAαΔT from
    the linear profile mean or per-case override), Dawson-Paslay/helical
    buckling with the REAL tubing-casing radial clearance (reuses the D1
    `bucklingLimits`), length changes vs PBR stroke, packer rating SF.
  - `erosionalVelocityMs` — API RP 14E (the invented flow correlation is
    DELETED; nodal cross-links to Nodal Analysis Studio).
  - Catalog (`data/tubulars.js`): `CASING_CATALOG`/`TUBING_CATALOG` with
    REAL API 5CT wall/ID per (OD, weight) — 28 rows — + `CASING_GRADES`
    (10 API 5CT grades) + nominal `CONNECTION_EFFICIENCIES`. Ratings are
    NEVER stored; computed at load by the engine.
- **Validation**: independent numpy oracle
  (`tools/validation/drilling/oracle_tubular.py`, byte-identical reruns)
  with self-asserts BEFORE writing: Barlow hand algebra, 5C3
  regime-boundary CONTINUITY per grade, VME identity, thermal −EAαΔT,
  Ypa monotone. Spot values match published tables (9-5/8 47 L-80:
  6,865/4,754 psi; 7" 29 P-110: 11,220/8,532 psi; 20" 94 K-55 elastic).
  Golden design: two-section 9-5/8 (47 P-110 BTC / 53.5 L-80 LTC) on the
  D1 slant well, MD sections + MD-weighted mean string weight (exactly
  the ctRun mapping). 23 engines jest gates; suite runner **A22-A23
  ACTIVE (23/23 total pass)**; **L13 (API 5C3 / vendor data book ratings
  table) ARMED**.
- **Data model** (migration `20260827080000`, applied live 2026-08-27,
  rollback-wrapped dry run + JWT RLS probes pass): `wp_ct_cases`
  (strings/environment/load_cases/packer/safety_factors jsonb, SI MD
  metres) + `wp_ct_runs` (immutable, insert-own+delete-own). Trajectory =
  definitive `wp_designs` stations via the D1 tdApi re-export; PPFG hint
  from published pp-1.0.0 curves via the shared `well-planning/services/
  ppfg.js` loader.
- **App** (`src/pages/apps/CasingTubingDesignPro/`, upgraded in place):
  injected backend (page = wp/registry, harness = in-memory), context
  fully rewritten (the `public.wells` read + ALL mock generators
  deleted; results recompute synchronously through the pure
  `services/ctRun.js` on every edit). Tabs: Well & Loads (real
  trajectory table, PPFG published-badge/manual with Sync, fluids +
  temperature), Load Cases (canonical type-specific editor), Casing
  Design (catalog-only section editor, per-case worst-point results with
  governing depths, all-case string summary), Tubing Design (Lubinski
  force table + white-theme force chart, packer panel, erosional card +
  nodal cross-link), Visualizer (honest schematic; mock baseline +
  fake integration buttons deleted). LeftPanel site→wellbore→case with
  WORKING Save/Duplicate/Delete (+ run snapshot on save); RightPanel
  KPIs bound to real results with the controlling load named;
  CatalogBrowser onSelect WIRED into the section editors. Ctrl+S saves
  for real. Deleted: `utils/{calculations,casingCalculations,
  tubingCalculations}.js`, `data/catalog.js` (mock physics),
  TubingDesignResultsTable, FlowCapacityAnalysis, TubingPlots,
  IntegrationPanel, DesignComparison, ProfilePlot (10 files).
- **Cross-links**: WDS AnalysisTab stale slug fixed
  (`drilling/casing-tubing-design` → `-pro`); `/help` guide
  (CasingTubingHelpGuide, EPE pattern, honesty markers, 3 jest gates).
- **Tests**: 22 suite jest (ctRun closed loop vs goldens + help guide);
  e2e `e2e/casing-tubing-studio.spec.js` (4 specs) recomputing
  expectations via ctRun + engines on `/dev/casing-tubing`.

## Held for the program launch (single-upload gate)

- Tile UPDATE migration `20260827100000_update_casing_tubing_studio_tile.
  sql` (rename to "Casing & Tubing Design Studio" + launch copy) — apply
  with the ONE prod upload that ships all 12 D&C apps.

## Out of scope (v1, documented in the help guide)

- APB, sour-service/temperature derating, wear-derated ratings (D1
  casing-wear tie-in later), connection-specific ratings beyond nominal
  efficiencies, salt loading, post-lockup buckling/corkscrew analysis.
- Only the first tubing string is analyzed; extras are schematic.
- Completion components are schematic markers; D7 Completion Design
  absorbs them.

## Staging E2E checklist (owner)

1. Open Drilling → Casing & Tubing Design Pro (Studio after launch);
   pick a site/wellbore with a definitive design; create a case.
2. Well & Loads: confirm the trajectory table matches the WDS plan; if
   the wellbore is bridged to a registry well with published PP/FP,
   press Sync and check the Published badge.
3. Casing Design: add a string from the catalog, check ratings against
   a known table row (9-5/8 47 L-80 burst ≈ 6,870 psi), switch load
   cases and watch the governing depth move.
4. Tubing Design: set the packer, check the stimulation case flags the
   seal stroke, and the erosional card reacts to the mixture density.
5. Save, duplicate, reload; confirm the case round-trips.

## Tester fix: trajectory fallback and wellbore details (2026-09-07)

Drilling and Completions testers reported that a well created in Well Design
Studio showed only its name in Torque & Drag Studio and Casing & Tubing Design
Studio, with no survey or other details. Cause: every Drilling studio read the
trajectory through `tdApi.getDefinitiveTrajectory`, which returned the station
cache of a design with `status = 'definitive'` and nothing else. The tester's
wellbore (Lad, design Plan A, 220 stations) was saved as a draft and never
promoted with Set definitive, so eleven studios showed the name and an error
in the log.

- `well-planning/services/trajectorySource.js` (pure, 9 jest gates): the
  working trajectory is resolved in order definitive design, actual survey
  composite (runs flagged `is_in_definitive`), latest saved draft design,
  the linked registry well's deviation, else none; the result carries
  `source`, `label` and an actionable `note`.
- `tdApi.getDefinitiveTrajectory` (shared by all eleven studios) now
  returns `{ wellbore, design, stations, source, label, note }`. The name
  and the `stations` contract are unchanged, so no consumer changed.
- `components/WellboreDetails.jsx` (shared by the T&D explorer and the
  Casing & Tubing left panel; 3 jest gates): trajectory source line with the
  note, wellbore header (depth unit, KB, GL, water depth, azimuth reference,
  wellhead, UWI, status, registry link, TD MD and TVD, max inclination,
  station count) and a survey listing (MD, inc, azi, TVD, DLS) in the
  wellbore's depth unit.
- Run error strings no longer demand a definitive design; the C&T
  environment card is titled Trajectory with the source badge; Well Design
  Studio's Save design toast says how to promote a draft.

## Tester fix: schematic and unsaved work (2026-09-07)

The Drilling tester's four notes on Casing & Tubing Design Studio:

1. **White schematic with the Petrolord mark.** `components/visualizer/WellboreVisualization.jsx`
   is now the one schematic (the Casing Design card and the Tubing Design
   card wrap it in compact form): white background, light grid, dark text,
   the shared `ChartLogo` watermark, a depth axis at round steps in the
   wellbore's unit (`depthTickStep`).
2. **Vertical exaggeration.** A `Vertical` control (squeeze, slider,
   stretch, fit; 0.5 to 8 in steps of 0.5) scales measured depth while
   diameters stay to scale; the schematic scrolls when stretched; the
   factor is remembered per schematic in browser storage
   (`ct-viz-vex:<key>`); the footer states pixels per unit and the factor.
3. **Casing shoe with depth.** Every casing string ends in the paired-wedge
   shoe symbol with a bold `Shoe <depth> <unit>` label
   (`ct-viz-shoe-<string>`); the string name and OD sit at its top; tubing
   and packer labels carry their depths too.
4. **Unsaved work survives leaving the page.** `services/draftStore.js`
   (pure, 3 jest gates) mirrors the dirty case document to browser storage
   (debounced 400 ms, key `ct-draft:<wellbore>:<case>`); opening a case
   restores a draft that is newer than the saved row and differs from it,
   marks the case dirty, logs the time and shows an amber note under Save
   with a Discard link (`ct-draft-restored`, `ct-discard-draft`). Save,
   Discard, delete and create clear the draft; a reload or tab close with
   unsaved work gets the browser's leave prompt. `saveCase` now stamps
   `updated_at` so the newer-than check holds on the in-memory backend too.

Found on the way: the five tab panels in `CenterContent.jsx` carried a
`flex` class that overrode Radix's `hidden` attribute, so the four
inactive panels rendered as empty boxes above the active one and the
Visualizer tab got 132 px. Panels are now `flex-col
data-[state=active]:flex flex-1 min-h-0`; every tab fills its space.
The in-memory harness trajectory now carries `source` and `label` like the
registry backend (the log said "Trajectory loaded: undefined").

e2e: two new tests (draft survives reload and Discard; white schematic,
shoe label, x2 stretch). The suite clears browser storage before each
test so one test's draft never restores into the next.
