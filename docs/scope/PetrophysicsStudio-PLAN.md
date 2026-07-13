# Petrophysics Studio — Phase G2 Plan

Status: **DRAFT — awaiting owner sign-off** (open questions in §8).
Roadmap slot: Geoscience-ROADMAP.md **Phase G2 — the flagship build**:
one deep log-analysis workstation replacing five shallow tiles. App
name **Petrophysics Studio**, slug `petrophysics-studio` (locked,
roadmap §6.2). Builds directly on the G1 registry — wells, LAS curves,
tops all come from `geo_wells*` via `src/lib/wellsRegistry.js`; there
is no import step of its own beyond what Well Data Manager already
does.

## What this is

The petrophysicist's working environment: load a well's curves from
the shared registry, correct and interpret them (Vsh, porosity, Rw,
Sw), define zones, apply cutoffs, and publish computed curves and
zone summaries BACK to the registry so correlation (G3), mapping (G4)
and volumetrics (ReservoirCalc Pro) consume them with zero re-import.

Supersedes (roadmap §1): WellLogAnalyzer, PetrophysicsEstimator,
CrossplotGenerator, PetrophysicalIntegrationSuite, LogFaciesAnalysis;
AutomatedLogDigitizer folds in as an import utility. Catalog truth
(checked live 2026-07-13): log-facies-analysis and
petrophysical-integration-suite are already Archived; the other four
have **no master_apps rows at all** (routes without tiles) — close-out
is code+route deletion with salvage pointers, not archival.

## Audit of the superseded apps (2026-07-13)

All six are dark ad-hoc UIs (zero chartTheme usage), routed in App.jsx
with no other importers — deletion breaks nothing but their own
routes. What's inside:

| App | Verdict | Salvage |
|---|---|---|
| PetrophysicsEstimator (495 loc + 34 comps) | **Real 509-loc engine** (`src/utils/petrophysicsCalculations.js`: all 5 Vsh models, density/Wyllie/ND porosity, Archie/Simandoux/Indonesia/Waxman-Smits, Timur/Coates/Wyllie-Rose/Tixier perm, zone stats, volumetrics, Monte Carlo) under a **stubbed viewer** (LogViewer ignores its props) and shell tabs | **HIGH — the crown jewel**: port the engine formulas; its parseLAS is redundant (G1 engine is the standard) |
| CrossplotGenerator (261 + 455 loc) | Real math (Pickett iso-Sw lines, ND lithology overlays, from-scratch k-means) but the chart itself renders "Chart removed" | MEDIUM: Pickett/overlay/k-means algorithms |
| WellLogAnalyzer (276 + 174 loc) | Correct Archie + density-φ on Math.random demo data; toy perm; real canvas track renderer | MEDIUM: LogCanvas track-renderer ideas; QC z-score/correlation stats |
| AutomatedLogDigitizer (148 loc + hook) | Genuine image→curve digitization (calibration, trace, Douglas-Peucker simplify) | MEDIUM: the whole workflow, as planned |
| LogFaciesAnalysis (332 loc + 40 comps) | "AI classification" is a setTimeout progress bar + 2-rule if/else + `confidence = 85+rand·10` | LOW (already Archived) |
| PetrophysicalIntegrationSuite (99 loc) | "Under Construction" shell | ZERO (already Archived) |

Also found: `src/services/petro/petrophysicsService.js` (orphaned mock
— delete at close-out), legacy Supabase tables
`saved_petrophysics_projects` / `log_facies_projects` (their apps die
at G2.6; table retirement is a close-out decision, Q5).

**Port discipline**: the oracle (G2.0) is written INDEPENDENTLY from
the primary literature — never from `petrophysicsCalculations.js` —
so validating the ported engine against it stays a genuine dual
implementation, not a circular one.

## Design decisions (proposed — owner sign-off locks these)

1. **All data through the G1 registry; no private well tables.**
   Inputs: `geo_wells` + `geo_wells_logs` (f32 curves in the `wells`
   bucket) + `geo_wells_tops`, read via `src/lib/wellsRegistry.js`.
   Outputs:
   - **Computed curves** (VSH, PHIE, PHIT, SW, BVW, flags) are ordinary
     `geo_wells_logs` rows + f32 objects — **no schema change** — with
     `provenance` marking them: `{computed: true, method, params,
     input_log_ids, engine_version}`. Re-running a recipe **overwrites
     its own previous output** (same well + output mnemonic + project),
     never someone else's; delete-and-replace via the existing
     services.
   - **Zones** are a new SHARED table `geo_wells_zones` (well_id FK
     cascade, name, top_md_m, base_md_m, `properties jsonb`,
     created/updated) — normalized like tops because G3/G4 query zones
     across wells by name. `properties` carries the PUBLISHED summary
     (phi_avg, sw_avg, vsh_avg, ntg, net_m, cutoff + method
     provenance) — compact, consumed whole (the fault-sticks
     precedent). Publishing is an explicit user action, not a
     side-effect of every recompute. RLS identical to tops (child of
     the well row; org read-only, owner-only writes) — shared-table
     bar: second-engineer review + pentest extension.
2. **App state is app-private**: `petro_projects` (product-prefixed;
   user_id owner-only RLS, no org sharing in v1): well list, parameter
   sets (per-well/per-zone a, m, n, Rw, GR clean/clay, matrix/fluid
   constants, cutoffs), track layouts, crossplot definitions, facies
   polygons — all small jsonb. Facies tags are interpretation state,
   not registry data, in v1.
3. **Engines: plain JS + JSDoc, pure functions, validation-first.**
   Closed-form per-sample math (fast enough on the main thread for
   100k-sample wells; worker only if profiling disagrees — G1's worker
   pattern is proven if needed). v1 engine set (roadmap contract):
   - `envCorrections` — **lite**, documented scope: temperature
     conversion (Arps), Rmf/Rw temperature adjustment. Full chart-book
     borehole corrections are OUT of v1 and labeled as such.
   - `vsh` — IGR linear, Larionov (1969) tertiary + older, Clavier
     (1971), Steiber (1970); min/max clamping, null passthrough.
   - `porosity` — density, sonic (Wyllie 1956 + Raymer-Hunt-Gardner
     1980), neutron-density (arithmetic + gas-flagged RMS), shale
     corrections; matrix/fluid constants as explicit parameters, never
     silently assumed.
   - `rw` — SP method (SSP → Rwe → Rw via Bateman & Konen 1977;
     K = 61 + 0.133·T°F), Arps temperature shifts, Pickett-plot line
     fit (log10 φ vs log10 Rt: Sw=1 line → m slope and a·Rw
     intercept).
   - `sw` — Archie (a, m, n explicit), Simandoux (1963, quadratic
     solution), Indonesia (Poupon-Leveaux 1971); each clamped to
     [0, 1] with out-of-range flagged, not hidden.
   - `cutoffs` — boolean flag curves (φ ≥ x, Vsh ≤ y, Sw ≤ z), net
     pay / net-to-gross / zone averages by depth-step integration
     (regular AND irregular steps — the depth curve is data, G1
     lesson).
   - `batch` — same recipe across N wells; per-well parameter
     overrides.
4. **Validation strategy (the roadmap's "published worked examples",
   honestly scoped).** Four layers, all committed under
   `tools/validation/petrophysics/` + `test-data/petrophysics/`:
   1. **Analytic cases** — hand-derivable exact values (e.g. a=1,
      m=n=2, φ=0.2, Rw=0.04, Rt=10 → Sw=√0.1), asserted to 1e-12.
   2. **Identities/limits** — Simandoux→Archie and Indonesia→Archie as
      Vsh→0; Sw monotonic in Rt; Vsh(IGR=0)=0, Vsh(IGR=1)=1 for every
      model; φD(ρb=ρma)=0, φD(ρb=ρf)=1.
   3. **Independent Python oracle** (`oracle.py`, formulas implemented
      from the primary literature with citations) generating goldens
      for synthetic curve fixtures — the lasio/mincurve dual-
      implementation pattern; jest asserts the JS engines match.
   4. **Published end-to-end anchor** — the G2 acceptance case. Open
      web sources verified 2026-07-13 to be login-gated (Crain's) or
      bot-blocked (SEG/AAPG wikis), so the specific textbook example
      (e.g. from Asquith & Krygowski, *Basic Well Log Analysis*) needs
      the owner to supply page-referenced numbers; until then the
      anchor is a fully-documented synthetic type well whose every
      step is hand-checkable in the README. **Owner input wanted (§8
      Q4).**
5. **UI: workstation on the shared shell** (`src/components/
   workstation/WorkspaceShell.jsx`), the WDM/Seismolord idiom:
   - Left explorer: project wells (from the registry, org badges as in
     WDM) with their curve inventory; parameter panel per well/zone.
   - Center: **multi-track log viewer** (canvas, fill-height, dark
     workstation viewport — a viewport, not an analytic chart): shared
     depth axis, per-track linear/log scales, curve fills, zone bands,
     tops markers, interactive depth-pick of GR clean/clay lines. This
     is a NEW component (WDM's LogTracks stays a QC quick-view);
     promote to `src/components/` only at a second consumer (§3 rule).
   - **Crossplot windows** (density-neutron, Pickett, buckets by
     zone): ANALYTIC charts → **white chartTheme + ChartLogo** (the
     suite standard), with polygon drawing for manual facies tagging
     and Pickett line-drag writing m/a·Rw back to parameters.
   - Status bar; ribbon-lite top strip (the WDM pattern, not the full
     Seismolord ribbon).
   - Injected backend pair (registry + in-memory) so
     `/dev/petrophysics-studio` drives the FULL app authless — the
     harness philosophy; e2e drives the track viewer per the roadmap
     acceptance.
6. **Log digitizer**: import wizard (raster image → clicked/traced
   curve → registry log with `provenance.digitized: true`), clearly
   labeled utility-grade. LAST build item; cuttable without hurting
   the core (§8 Q3).
7. **Catalog**: `master_apps` row (Geoscience, `petrophysics-studio`,
   template-copy pattern) flipped Active only at close-out with the
   route in the same PR (the deploy lesson). Superseded app code +
   routes deleted with salvage pointers recorded in the close-out
   commit; the two already-Archived tiles stay archived.

## Schema sketch (G2.2 migration, staging-first, second-engineer review on geo_wells_zones)

```
geo_wells_zones:  id, well_id FK cascade, name, top_md_m, base_md_m,
                  properties jsonb default '{}', created_at, updated_at
                  RLS: exactly the geo_wells_tops pattern (select via
                  well visibility; insert/update/delete owner-only).
                  Index (well_id), (name).

petro_projects:   id, user_id FK cascade, name,
                  well_ids uuid[] , params jsonb, layouts jsonb,
                  crossplots jsonb, facies jsonb,
                  created_at, updated_at
                  RLS: owner-only all ops (no org sharing v1).
```

## Phases

- **G2.0 — Oracle + goldens** *(small-medium)*: `tools/validation/
  petrophysics/` Python oracle + synthetic type-well fixtures +
  committed goldens + README numeric contract (layers 1–3 above; layer
  4 slot prepared). Accept: goldens regenerate byte-identical;
  every formula cites its primary source.
- **G2.1 — Engines** *(medium)*: PORT the proven formulas out of
  `src/utils/petrophysicsCalculations.js` into `engine/` modules per
  decision 3 (pure, explicit parameters, null-safe, no UI coupling),
  then harden; jest-validated against the independent goldens;
  identity/limit suites; fuzz (nulls, irregular steps, all-null
  curves, reversed depths). Accept: all goldens within contract
  tolerances; fuzz green; any divergence between the legacy library
  and the oracle documented and resolved in the oracle's favor.
- **G2.2 — Schema + pentest** *(small)*: migration (geo_wells_zones +
  petro_projects), MIGRATIONS.md, RLS pentest extension executed live
  (zones inherit the well's org visibility; petro_projects owner-only).
- **G2.3 — Workstation core** *(large)*: shell, explorer, parameter
  panel, multi-track viewer, zone manager, compute pipeline for one
  well end-to-end (Vsh → φ → Sw → flags as in-memory preview curves),
  `/dev/petrophysics-studio` harness + e2e (track viewer interactions,
  full single-well workflow authless).
- **G2.4 — Crossplots + facies + Pickett** *(medium)*: white-theme
  crossplot windows, polygon facies tagging, Pickett fit writing
  parameters back; e2e.
- **G2.5 — Write-back + batch** *(medium)*: publish computed curves to
  the registry (provenance contract, overwrite-own-output rule), zone
  publish (`properties`), multi-well batch runs; cross-app check: a
  published PHIE curve is visible in Well Data Manager (and Seismolord
  lists the well untouched). e2e on the harness; live smoke needs a
  signed-in session (owner).
- **G2.6 — Digitizer + close-out** *(small-medium)*: raster import
  wizard; delete superseded app code/routes (salvage pointers); tile
  Active + route in one PR; STATUS/roadmap docs; acceptance case
  reproduced end-to-end.

Estimated overall: larger than G1 (the roadmap calls it the flagship);
G2.3 is the big one.

## Risks

- **Formula-parameter footguns** (a/m/n defaults, matrix constants,
  °F/°C): every engine takes explicit parameters; defaults live in ONE
  documented constants module; the UI always shows what's applied.
  SI internally (G1 rule); °F only inside Rw temperature formulas,
  documented at the boundary.
- **Published-example access**: layer-4 anchor needs owner-supplied
  page refs (Q4) — the build doesn't block on it, acceptance does.
- **Scope gravity** (roadmap risk): v1 contract above is the fence —
  no ML facies, no full chart-book corrections, no NMR/dielectric/
  advanced models. Growth lands in later phases against goldens.
- **Zone-table blast radius**: geo_wells_zones becomes load-bearing
  for G3/G4 — same discipline as G1.1 (review, pentest, compat
  thinking before any later shape change).

## Open questions for sign-off

1. **Zone publish shape**: `geo_wells_zones.properties` jsonb summary
   (recommended — compact, consumed whole, provenance inside) vs a
   normalized results table per property. Confirm jsonb.
2. **Facies polygons app-private in v1** (recommended): they're
   interpretive workspace state; sharing/propagation is G3 territory.
   Confirm.
3. **Digitizer priority**: keep in G2.6 (recommended) or cut from v1
   entirely if the phase runs long. Confirm keep-as-last.
4. **The published acceptance example**: can you supply one
   page-referenced worked example (Asquith & Krygowski or equivalent)
   with inputs and expected Sw/net-pay outputs? Until then the
   acceptance anchor is the documented synthetic type well. (Related
   v1 scope note: the exact Bateman & Konen Rwe→Rw coefficients could
   not be verified from open sources 2026-07-13 — v1 ships the
   documented SP quicklook chain Rwe = Rmf·10^(SSP/K) with Rw ≈ Rwe
   caveated; the full conversion lands when a page-referenced source
   is in hand.)
5. **Legacy tables** `saved_petrophysics_projects` and
   `log_facies_projects`: their apps delete at G2.6. Recommend leaving
   the tables (row-preserving, the QuickVol spirit) and logging a
   retirement decision for the suite DB-cleanup effort. Confirm.
