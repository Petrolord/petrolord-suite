# Petrolord Geoscience Module — Roadmap

Status: **APPROVED — owner sign-off 2026-07-12** (decisions in §6)
Scope: the entire Geoscience module (Geophysics, Geology, Petrophysics)
This file is the plan of record. Per-app plans (like Seismolord-PLAN.md)
are written per phase against this roadmap.

---

## 1. The honest baseline

A geoscientist's daily loop is: **manage well data → analyze logs →
correlate wells → interpret seismic → tie wells to seismic → map
surfaces → compute volumes → risk the prospect.** Petrel, Kingdom and
DecisionSpace cover that loop as one platform with ~6 workspaces.
Petrolord currently covers it with ~15 tiles, of which two fly.

Audited state of every current Geoscience app (entry LOC + component
trees + mock-density spot checks, 2026-07-12):

| App | State | Verdict |
|---|---|---|
| Seismolord | Full interpretation workstation, validated engines, workspace UI (PR #50) | **KEEP — flagship** |
| ReservoirCalc Pro | Real volumetrics + correlated Monte Carlo, consolidated 2026-07-08 | **KEEP** |
| WellCorrelationTool | 98-line shell | **REPLACE** (Phase G3) |
| WellLogAnalyzer | 276 loc, shallow | **SUPERSEDE** by Petrophysics Studio |
| PetrophysicsEstimator | 495 loc, shallow | **SUPERSEDE** by Petrophysics Studio |
| CrossplotGenerator | 261 loc, shallow | **SUPERSEDE** by Petrophysics Studio |
| PetrophysicalIntegrationSuite | 99-line shell | **SUPERSEDE** by Petrophysics Studio |
| LogFaciesAnalysis | 332 loc, shallow | **SUPERSEDE** by Petrophysics Studio |
| EarthModelStudio | 229-loc shell over shared tree | **CONSOLIDATE** into one Earth Modeling slot (Phase G8) |
| EarthModelPro | 87-line shell | **CONSOLIDATE** (same slot) |
| SubsurfaceStudio | 284 files, no active route, 9 files on Math.random | **DELETE** (harvest UI idioms — its tree-panel pattern already informed Seismolord's explorer) |
| AutomatedLogDigitizer | 148 loc utility | **FOLD** into Petrophysics Studio import wizard |
| ContourMapDigitizer | 121 loc utility | **FOLD** into Mapping Studio import wizard |
| AnalogFinder | 206 loc, no analog database behind it | **PARK** (archive tile) |
| BasinFlowGenesis | ~10k loc; audited — real burial/thermal solvers, placeholder Ro | **UPGRADE** (see BasinFlowGenesis-AUDIT.md; Phase G7) |
| MechanicalEarthModel | 108 files; audited — routed page runs no math, engine orphaned | **REBUILD under Drilling** (locked 2026-07-12; tile archived; see MEM-AUDIT.md) |

**Catalog note:** the whole Geoscience module is bulk-seeded in
`master_apps` at flat 899, including hollow tiles. Tiles that don't fly
get **Archived** (the QuickVol pattern — status='Archived' preserves
rows and entitlement FKs), not deleted.

## 2. Target portfolio — 10 tiles

**Core six** (a geoscientist can run a full prospect-to-volumes study):

1. **Seismolord** — geophysics workstation *(exists)*
2. **Well Data Manager** — shared subsurface well registry *(new — Phase G1)*
3. **Petrophysics Studio** — one deep log-analysis app *(new — Phase G2)*
4. **Well Correlation** — cross-sections + tops *(rebuild — Phase G3)*
5. **Mapping & Surface Studio** — gridding/contouring/basemaps *(new — Phase G4)*
6. **ReservoirCalc Pro** — volumetrics + uncertainty + prospect risking *(exists; risking module added in Phase G5)*

**Advanced three** (differentiators, after the core loop closes):

7. **Rock Physics / QI** — AVO, Gassmann, wedge models *(new — Phase G6)*
8. **Basin & Charge Modeling** — BasinFlowGenesis upgraded or rebuilt *(G7)*
9. **Geomechanics / 1D MEM** — DECIDED 2026-07-12 (MEM-AUDIT.md):
   rebuilds under the **Drilling module** on the salvaged engine core;
   tile archived until then. Geoscience keeps seismic-velocity-driven
   pore-pressure prediction as a later capability *(G7)*

**Eventual one:**

10. **Earth Modeling** — ONE consolidated slot, scoped v1 (structural
    framework + layer-cake zones + simple property population), built
    **last** *(Phase G8)*. Full 3D geostatistics is explicitly out of
    scope until everything above ships.

## 3. Architecture principles (carried from Seismolord — locked unless owner overrides)

- **Shared data first.** The module's moat is the shared project tree,
  not any single app. Wells, logs, tops, checkshots and surfaces live in
  cross-app registries that every geoscience app reads. No more
  app-private well tables after G1.
- **Client-side engines** in plain JS + JSDoc, heavy compute in Web
  Workers; production stays static SPA + Supabase. No server-side
  numerics (nothing exists to host them).
- **Validation-first**: every engine validates against published /
  known-truth references (Python oracles + committed goldens where
  numeric fidelity matters — the Seismolord/mincurve pattern) before any
  tile goes Active. jest is the only unit runner; Playwright e2e via
  auth-free `/dev/*` harnesses.
- **Workspace UI standard**: the Seismolord shell (ribbon / explorer
  tree / fill-height center / status bar, `react-resizable-panels`) is
  the house pattern for workstation-class apps (Petrophysics Studio,
  Well Correlation, Mapping Studio). Extract the shell primitives to
  `src/components/workspace/` when the second consumer appears — not
  before.
- **Chart standard**: analytic charts (crossplots, histograms) use the
  shared white chartTheme + ChartLogo watermark. Log tracks, seismic and
  maps are canvas/WebGL workstation surfaces and exempt.
- **DB conventions**: migrations staging-first, logged in MIGRATIONS.md.
  New cross-app tables use the `wells_*` / `geo_*` prefixes and — being
  shared across products — carry the same second-engineer review bar as
  the existing shared tables. RLS: private-by-default rows with explicit
  org sharing through the `is_org_member()` helper (locked in §6.1).
- **Storage**: bulk data (LAS curves, surface grids) as float32/blob
  objects in private buckets under owner paths with Storage RLS;
  metadata rows in Postgres. Never large jsonb curves.

## 4. Phases

Estimates are relative, calibrated against Seismolord history (its P0–P6
took ~2 days of focused agent work; wells W0–W4 ~1 day). Real elapsed
time depends on review cadence.

### Phase G0 — Catalog truth + audits *(small)*
- Archive tiles: the five petrophysics apps, WellCorrelationTool,
  EarthModelStudio/Pro duplicates, AnalogFinder, both digitizers
  (idempotent migration, QuickVol archive pattern). Routes stay as
  aliases where a successor exists.
- Delete the unrouted `SubsurfaceStudio.jsx` page + its stale
  registrations (lazy import, route metadata, allApps, pricing).
  *Correction found during execution:* `src/components/subsurface-studio/`
  is NOT dead — it is the component tree behind the routed
  EarthModelStudio, and MEM imports two of its chart files; the tree is
  deleted when its consumers go (G8 consolidation / MEM decision), not
  in G0.
- **Audit reports** (each a short doc in docs/scope/): BasinFlowGenesis
  and MechanicalEarthModel — what's real, what's mock, upgrade-vs-rebuild
  recommendation, and (MEM) module placement recommendation.
- Acceptance: hub shows only apps that work; two audit docs delivered;
  no deleted route referenced anywhere.

### Phase G1 — Well Data Manager (shared subsurface registry) *(medium — the keystone)*
- Tables (staging-first): `wells` (header, surface X/Y, KB, CRS note,
  `user_id` owner + nullable `organization_id` per §6.1),
  `wells_deviations`, `wells_logs` (LAS metadata; curves as float32
  objects in a private `wells` bucket), `wells_tops`,
  `wells_checkshots`. First migration also creates the
  `is_org_member(org uuid)` helper (§6.1) that all policies call. RLS
  pentest before Active (the Seismolord live-pentest pattern), covering
  both the private and org-shared paths.
- App: workstation-lite UI — well list/map, LAS import (reuse and
  extend the WellImport column-mapping pattern), deviation/tops/
  checkshot import, unit handling, QC flags, bulk operations.
- **Migration**: `seismic_wells` data migrates in; Seismolord's
  `useWells` reads the shared registry (its import dialogs delegate
  here). No Seismolord behavior change — same shapes, new source.
- Engine validation: reuse the proven `wellPath`/mincurve goldens; LAS
  parser gets a fuzz suite + published-file goldens (LAS 1.2/2.0
  minimum; 3.0 read-only if cheap).
- Acceptance: a well imported once appears in Seismolord (sections/map/
  3D/well-tie) and in every later app with zero re-import; RLS pentest
  green; LAS goldens bit-accurate.

### Phase G2 — Petrophysics Studio *(large — the flagship build of this roadmap)*
- Replaces five tiles. Workstation shell: ribbon, well/curve explorer,
  multi-track log viewer (canvas; fill-height), crossplot windows
  (white chartTheme), status bar.
- Engines (each oracle-validated against published worked examples —
  e.g. Archie's original examples, chart-book picks, textbook
  Vsh/porosity cases): environmental-lite corrections, Vsh (GR linear /
  Larionov / Clavier), porosity (density, neutron-density, sonic), Rw
  (SP / Pickett), Sw (Archie, Simandoux, Indonesia), cutoffs + net
  pay/net-to-gross summaries, multi-well batch runs.
- Facies tagging on crossplots (manual polygons first; the
  LogFaciesAnalysis ML ambition is OUT of v1).
- Log digitizer folded in as an import wizard (raster → curve), clearly
  labeled utility-grade.
- Outputs write back to the shared registry (computed curves, net-pay
  flags, zone averages) so correlation/mapping/volumetrics consume them.
- Acceptance: a published worked example reproduces end-to-end (logs in
  → Sw/net pay out) within reference tolerance; every engine has jest
  goldens; e2e harness drives the track viewer.

### Phase G3 — Well Correlation *(medium)*
- Replaces the 98-line shell. Multi-well cross-section along a
  user-picked well path (map picker), tracks per well, datum flattening
  (structural / on a top), tops picking + drag-editing + propagation,
  zone fills between correlated tops.
- Tops are the shared `wells_tops` rows — picked here, instantly visible
  in Seismolord well-ties and Mapping Studio.
- Acceptance: pick tops across ≥3 wells, flatten on any top, tops appear
  in Seismolord section overlays without re-import; e2e harness with
  synthetic logs.

### Phase G4 — Mapping & Surface Studio *(medium-large)*
- Gridding/contouring of well tops and attributes (reuse Seismolord's
  validated TPS/fault-aware gridding engine — move it to a shared
  engine location rather than duplicating); import of Seismolord
  CPS-3/ZMAP/XYZ exports and third-party grids; surface math
  (isochores, +/-, depth conversion via the shared velocity
  conventions); polygons/leases; posted-well basemap (shared registry).
- Surface registry table (`geo_surfaces`) — this finally implements the
  cross-app surface exchange that `shared_data_registry` was supposed to
  be (that table still doesn't exist; DataExchangeHub silently fails —
  G4 either implements it properly or formally deletes the dead hub).
- Contour digitizer folded in as an import wizard.
- Acceptance: Seismolord horizon → mapped/edited surface → ReservoirCalc
  GRV without touching the filesystem; grid writers stay byte-identical
  to the existing goldens.

### Phase G5 — Integration pass + prospect risking *(small-medium)*
- ReservoirCalc Pro reads surfaces from the G4 registry and wells/net
  pay from G1/G2 directly (file import remains as fallback).
- Prospect risking module inside ReservoirCalc Pro: Pg decomposition
  (trap/reservoir/charge/seal), risked volumes, simple prospect
  inventory + portfolio roll-up.
- Seismolord "future scope" items that now have homes: org sharing of
  interpretations (rides the G1 org model), LAS-driven synthetics
  (needs G1 sonic/density curves → build full synthetic seismogram +
  wavelet extraction in Seismolord here).
- **Membership consolidation** (suite-level, §6.1 convergence path) runs
  alongside this phase: pick the canonical membership table, backfill,
  separate grants, drop the stragglers, shrink `is_org_member()` to one
  query. Shared-table change → second-engineer review.
- Acceptance: the full loop demo — logs → tops → correlation → seismic
  tie → surface → risked volumes — runs on one shared dataset with zero
  file exports.

### Phase G6 — Rock Physics / QI *(medium; after core)*
- Gassmann fluid substitution, AVO classes + intercept/gradient from
  well logs, wedge modeling, synthetic gathers (reuses G5 synthetics).
  Oracle-validated against published rock-physics worked examples.

### Phase G7 — Basin upgrade + geoscience pore-pressure *(sized by G0 audits)*
- Execute the audit verdicts: **BasinFlowGenesis UPGRADE** per
  BasinFlowGenesis-AUDIT.md (Sweeney-Burnham Ro, TOC-mass generation,
  erosion/heat-flow-history wiring, engine-backed analysis tabs, drop
  TFJS, validation goldens). The **MEM rebuild happens in the Drilling
  module** (decision locked 2026-07-12; not geoscience scope); Geoscience
  adds seismic-velocity-driven pore-pressure prediction here or later,
  fed by Seismolord velocity models.

### Phase G8 — Earth Modeling v1 *(large; last, and only after G1–G5 are live)*
- One tile. Scope v1 HARD: structural framework from G4 surfaces +
  fault polygons, layer-cake zonation from correlated tops, per-zone
  property population from G2 petrophysics (constant/trend/simple
  kriging — no full geostatistics), export to volumetrics and (future)
  simulation. Delete the leftover EarthModel shell it replaces.

## 5. Sequencing logic (why this order)

G1 unlocks everything — logs, tops and checkshots feed G2/G3/G5 and
Seismolord synthetics. G2 before G3 because correlation displays the
curves petrophysics cleans up. G4 needs G3's tops to have something to
grid. G5 is where the module stops being apps and starts being a
platform. Advanced apps only after the loop closes: they add depth, not
coverage. Earth Modeling last because it consumes every other output
and is the biggest build risk in the domain.

## 6. Locked decisions (owner sign-off, 2026-07-12)

1. **Org sharing model (G1)** — designed to converge on ONE membership
   table without blocking on that consolidation:
   - Wells (and every later geoscience registry row) carry `user_id`
     (owner) + nullable `organization_id`. **Private by default**
     (`organization_id IS NULL`); an explicit "Share with organization"
     action stamps the owner's org id. Sharing is keyed to the
     *organization*, never to a membership table, so rows stay correct
     whichever membership table eventually wins.
   - RLS never references a membership table directly. One SQL helper —
     `is_org_member(org uuid)` (SECURITY DEFINER, stable) — answers
     membership; today it checks all three existing tables
     (`organization_users`, `organization_members`, `org_members` — the
     same trio `src/lib/orgContext.js` already resolves with fallbacks).
     The debt lives in exactly one function; every geoscience policy
     calls it.
   - **Convergence path**: a suite-level "membership consolidation" work
     item (shared-table change → second-engineer review) is scheduled
     alongside Phase G5. *G1.1 finding:* the consolidation has already
     STARTED — `organization_users` and `org_members` are frozen by
     deprecation triggers ("use organization_members +
     organization_apps"), so the canonical table is decided; what
     remains is backfilling/retiring the legacy rows, after which
     `is_org_member()` shrinks to one query with zero policy changes.
     G1.1 also upgraded the pre-existing single-table `is_org_member`
     (EPE/econ policies, ~55 of them) to the consistent three-table
     read in one step.
   - **Never again**: no new per-app member tables (the
     `petrophysics_team_members` / `bf_team_members` pattern is banned
     for new work); app code resolves org context through
     `src/lib/orgContext.js`, not direct table reads.
2. **App names** — functional names, no "-lord" branding: **Well Data
   Manager** (`well-data-manager`), **Petrophysics Studio**
   (`petrophysics-studio`), **Well Correlation** (`well-correlation`;
   legacy `well-correlation-tool` slug becomes an alias), **Mapping &
   Surface Studio** (`mapping-surface-studio`), **Rock Physics Studio**
   (`rock-physics-studio`). Existing app names (Seismolord,
   ReservoirCalc Pro, BasinFlow Genesis) are unchanged.
3. **MEM module placement** — LOCKED 2026-07-12 after the G0 audit:
   rebuild under **Drilling** on the salvaged ~440-loc engine core;
   `1d-mechanical-earth-model` tile archived until the rebuild ships
   (migration `20260712220000_archive_mem_tile.sql`).
4. **Pricing** — unchanged (flat 899) for now; revisit tiering once ≥3
   core apps fly.
5. **Archive list** — confirmed in full; nothing on the §4 G0 list stays
   alive.

## 7. Risks

- **Scope gravity**: petrophysics and earth modeling both expand
  infinitely. Defense: v1 scopes above are contracts; growth happens in
  later phases against acceptance tests, the Seismolord way.
- **Shared-table coupling**: G1 tables become load-bearing for five
  apps. Defense: second-engineer review on schema, RLS pentests, and
  versioned migration discipline (staging-first, MIGRATIONS.md).
- **CRS/units debt**: wells, seismic and maps must agree on coordinates
  and units. G1 records CRS + units explicitly per well/survey from day
  one; no silent assumptions (the SEG-Y lesson).
- **Audit surprises** (BasinFlowGenesis/MEM): sized as unknowns on
  purpose; no roadmap phase depends on them.
