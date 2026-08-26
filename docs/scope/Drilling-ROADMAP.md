# Petrolord Drilling & Completions Module — Roadmap

Status: **APPROVED — owner sign-off 2026-08-26** (decisions in §5)
Scope: the entire Drilling module (drilling engineering AND completions)
This file is the plan of record. Per-app plans (like the Well Design
Studio program) are written per phase against this roadmap.

---

## 1. The honest baseline

A drilling & completions engineer's loop is: **plan the trajectory →
build the geomechanical/pore-pressure model → design casing → design
the fluids & hydraulics program → verify well control margins → cement
each string → model torque & drag → design the completion (string,
perforation/sandface, stimulation) → estimate time & cost → maintain
integrity through life → abandon safely.** Landmark's EDT covers the
drilling half with COMPASS / WellPlan / StressCheck / CasingSeat /
WELLCAT / iCem / OpenWells; SLB treats completions (packers,
perforating, sand control, stimulation, lift) as one connected system.

Petrolord currently covers this loop with **45 catalog rows** (11
Active, 33 Coming Soon, 1 Archived) of which exactly **one flies**.

Audited state of every current Drilling app (full code audit
2026-08-26, two sweeps — routes, engines, persistence, mock density):

| App | State | Verdict |
|---|---|---|
| Well Design Studio (`well-planning`) | Launched 2026-08-25. Validated engines (ISCWSA Rev4, WMM2025, SPE-187073 AC), wp_* tables, report pack, help guide | **KEEP — flagship** |
| Casing & Tubing Design Pro | 45 files; real burst/collapse/tubing-load math (no Math.random) but self-declared "Mock Pressure Calculations (Simplified Physics)", reads legacy `public.wells` + hardcoded mock wells (`Adalu-1`/`Bravo-2`), **no save path at all**, no tests | **UPGRADE** (Phase D6; completion components split out at D7) |
| Casing Wear Analyzer | 35 files; genuine energy-dissipation wear model fed by `Math.random()` dogleg contact forces; localStorage only | **SUPERSEDE** by Torque & Drag + Drillstring Studio (D1) |
| Torque & Drag Predictor | 116-line shell: every input readOnly, Run button has **no onClick**, results permanently empty. A complete older T&D app (engine + UI + persistence) sits orphaned and unimported beside it | **SUPERSEDE** (D1) |
| Drilling Fluids & Hydraulics | 214-line single file; inline "simplified" annular velocity + invented ECD; Save button = `handleUnsupportedFeature` | **SUPERSEDE** (D2) |
| Cementing Simulation | Real volume/capacity math, but displacement efficiency, max pressure, free-fall, ECD and the whole pressure curve are `Math.random()` behind a 1.5 s fake setTimeout; writes `cementing_simulation_projects` (no repo DDL) | **SUPERSEDE** (D4) |
| Wellbore Stability Analyzer | Self-declared "placeholder for a complex backend geomechanical model"; truncated Kirsch, frac gradient passed through, no inclination dependence despite the input | **SUPERSEDE** by Geomechanics Studio (D5) |
| Frac Completion App | 28-line engine, 100% `Math.random()` (half-length, conductivity, IP30, sinusoidal treatment plot) | **SUPERSEDE** by Stimulation Designer (D9) |
| RTO Dashboard | Hardcoded canned results behind setTimeout; toasts "Connecting to Live Rig Data" with **no data connection of any kind** | **ARCHIVE** (owner-locked 2026-08-26; real-time drilling returns only if rig connectivity ever exists) |
| Offset Well Incident Finder | Invokes edge fn `incident-finder-engine` which **does not exist** — errors on every use, on an ungated route | **ARCHIVE** |
| Well Spacing Optimizer | Deterministic EUR + NPV-vs-spacing sweep. Real, but reservoir-economics math, not drilling engineering | **MOVE to Reservoir module** (owner-locked 2026-08-26) |
| Pore Pressure & Frac Gradient (legacy) | Already handled: tile archived 2026-07-14, route redirects to geoscience Pore Pressure Studio | done |
| 1D Mechanical Earth Model | Tile archived 2026-07-12 with owner lock "rebuilds under DRILLING"; rebuild never happened; 108-file shell still routed under geoscience aliases; salvage = `src/pages/apps/MechanicalEarthModel/services/{Stress,Pressure,Calculation,QualityAssessment}Engine.js` + `hooks/useFileParser.js` (~440 LOC real math) | **REBUILD** as Geomechanics Studio (D5) |

Other findings:

- **8 of the 11 Active routes are entitlement-ungated** (only
  well-planning, casing-tubing-design-pro, cementing-simulation carry
  `ProtectedAppRoute`). Mock or broken apps ship to any authenticated
  user.
- The Drilling catalog was **never migration-managed** (hand-seeded in
  the Horizons era). `docs/PETROLORD_APPLICATION_CATALOG.md` advertises
  "10 complete" — false.
- Referenced-but-unmigrated tables (`cementing_simulation_projects`,
  `frac_completion_projects`, `geomechanics_projects`, `rto_projects`,
  `torque_drag_projects`, plus legacy `wells`/`well_targets`/
  `trajectory_plans`): DDL exists only in the live DB, if at all. Drops
  are owner-gated, post-D-series, after live row-count checks.
- **Zero coverage anywhere in the suite** (grep-confirmed): well
  control, kick tolerance, kill sheet, sand control, gravel pack,
  perforating, coiled tubing, snubbing, acidizing, P&A engineering,
  well integrity/barriers, BOP.
- Orphaned drilling code with no importers: GeomechanicsApp.jsx (dead,
  reads legacy wells), CasingAndTubingDesign.jsx (redirects to a
  nonexistent slug), CasingDesignQuickCheck chain, DrillingProgramWriter
  (dummy PDF response), WellCostIQ/WellCostSnapPro chains (redirect to a
  route swallowed by the catch-all), the complete-but-unimported
  torquedrag tree, the drillingfluids tree, fractureGradientCalculator.

**Reusable real assets outside the module** (reuse, never rebuild):

- **Pore Pressure Studio** (geoscience): validated engines in
  `packages/engines/engines/porepressure/`, publishes PP/FP/OBG
  Float32 MPa curves to `geo_wells_logs` under the `pp-1.0.0` contract
  with provenance; WDS MudWindowPanel already consumes them
  (`src/pages/apps/well-planning/services/ppfg.js`).
- **Nodal Analysis Studio** (production): validated 1,842-LOC engine at
  `src/utils/nodal/` (IPR, VLP traverse, chokes, gas lift) with goldens
  + validation gate — the tubing-performance math for completions.
- **Artificial Lift Designer** (production): real ESP/gas-lift/rod-pump
  engines. Owner decision: lift and nodal STAY in Production; D&C apps
  cross-link.
- **Well Design Studio spine**: `wp_*` tables, `trajectoryContract.js`
  v1.0.0 (JSON/CSV/Excel/DXF), `packages/engines/engines/drilling/`
  (surveyMath, segmentCompiler, profileDesign, antiCollision,
  errorModel, magnetics), publish bridge to `geo_wells`.
- **Shared registries**: `src/lib/wellsRegistry.js` (geo_wells +
  geo_wells_logs), the canonical well/log store.

## 2. Target portfolio — 12 apps

Locked 2026-08-26. Functional names, no '-lord' brands (geoscience §6
precedent). User-facing copy follows the owner rule: no em dashes.

**Drilling six:**

1. **Well Design Studio** (`well-planning`) — trajectory, surveys,
   anti-collision, reports *(exists — flagship)*
2. **Torque & Drag + Drillstring Studio** (`torque-drag-studio`) —
   soft-string T&D (Johancsik, SPE 11380 oracle), drillstring loads,
   casing wear from real contact forces; consumes the WDS trajectory
   contract *(Phase D1)*
3. **Drilling Fluids & Hydraulics Studio** (`drilling-fluids-hydraulics`
   rebuilt) — rheology (Bingham/PL/Herschel-Bulkley), API RP 13D
   pressure losses, ECD, surge/swab, hole cleaning *(Phase D2)*
4. **Well Control Studio** (`well-control-studio`) — kick tolerance,
   kill sheets (driller's / wait-and-weight), MAASP; IWCF-style
   worked-example gates *(Phase D3)*
5. **Cementing Studio** (`cementing-studio`) — volumes, placement
   schedule, free-fall/U-tube, API 10D centralization/standoff, ECD
   during cementing *(Phase D4)*
6. **Geomechanics & Wellbore Stability Studio** (`geomechanics-studio`)
   — the owner-locked MEM-under-Drilling rebuild: 1D MEM from logs
   (salvaged Stress/Pressure engines), Kirsch breakout/mud-weight
   window, consumes pp-1.0.0 PP/FP/OBG *(Phase D5)*

**Completions four:**

7. **Casing & Tubing Design Studio** (`casing-tubing-design-pro`) —
   CTDP upgraded: math validated vs API TR 5C3, wellsRegistry/wp_*
   plumbing, real persistence *(Phase D6)*
8. **Completion Design Studio** (`completion-design-studio`) —
   completion string architecture, schematic canvas + BOM (absorbs
   Production's Well Schematic Designer + CTDP completion components),
   tubing sizing checks via the nodal VLP engine *(Phase D7)*
9. **Perforation & Sand Control Designer** (`perforation-sand-control`)
   — Karakas-Tariq perforation productivity, underbalance selection,
   Saucier gravel-pack sizing, screen selection, sanding-onset input
   from Geomechanics Studio *(Phase D8)*
10. **Stimulation Designer** (`stimulation-designer`) — hydraulic frac
    (PKN/KGD, P3D-lite later), proppant schedule, matrix acidizing skin
    *(Phase D9)*

**Life-of-well two:**

11. **Well Integrity & P&A Studio** (`well-integrity-pa`) — barrier
    envelopes (NORSOK D-010 style), MAASP, plug placement, abandonment
    program; links the Economics decommissioning template *(Phase D10)*
12. **Well Cost & Time Estimator** (`well-cost-time`) — probabilistic
    time-depth + AFE-grade cost; Monte Carlo via the canonical
    MonteCarloEngine.js (CLAUDE.md rule); links AFE Cost Control
    Manager; salvages WellCostIQ utils *(Phase D11)*

Out of module: Well Spacing Optimizer → Reservoir; RTO Dashboard and
Offset Well Incident Finder → Archived; Artificial Lift + Nodal stay in
Production. (Production-module note, not done here: Wellbore Flow
Simulator is a Math.random mock duplicating nodal VLP — retire it into
Nodal Analysis Studio in a Production cleanup.)

## 3. Architecture principles

Locked to the WDS/G-series precedents:

- **Data spine**: `wp_*` tables + the trajectory contract v1.0.0 +
  `geo_wells`/`geo_wells_logs` via `src/lib/wellsRegistry.js`. New apps
  key designs to `wp_wellbores` where they are per-wellbore; D6 removes
  the last real `public.wells` read (CTDP).
- **Validation-first**: every engine gates on published/known-truth
  references (oracle scripts + committed goldens) before tier
  promotion; engines promoted to `@petrolord/engines` subtree when a
  second consumer or a NextGen course needs them.
- **UI standard**: WorkspaceShell primitives, white chartTheme +
  ChartLogo for analytic charts, help guide per app (EPE pattern).
- **Catalog discipline**: tiles seed via idempotent migrations only, at
  ship time, with the route in the same deploy (the 2026-07-07 lesson);
  archived rows are never revived.
- **Routes**: every app route gated with `ProtectedAppRoute`.
- **Migrations**: staging-first, rollback-wrapped dry runs, logged in
  MIGRATIONS.md; shared-table changes need a second engineer.
- **Copy**: no em dashes or "X — not Y" contrastives in user-facing copy.

## 4. Phases

- **D0 — honest catalog + code hygiene** *(this PR)*: archive the 8
  non-real Active tiles + all 33 Coming Soon rows; move
  well-spacing-optimizer to Reservoir (tile + route); deroute the
  archived apps; delete mock pages + exclusive trees and the orphan
  chains (salvage pointer = parent commit of the D0 squash); docs
  updated. Drilling catalog after D0 = exactly 2 Active tiles
  (well-planning, casing-tubing-design-pro). MEM tree is left in place
  (tile already archived) and is deleted at D5 when its salvage is
  re-imported.
- **D1 — Torque & Drag + Drillstring Studio**: **SHIPPED 2026-08-26**
  (engines PR #37 + Suite waves TD0-TD3; see
  docs/scope/TorqueDragStudio-STATUS.md). Soft-string T&D with
  independent-oracle gates A10-A12, buckling flags, crescent-geometry
  casing wear, `wp_wellbore_geometry` spine (D2/D6 reuse), workstation +
  harness + e2e. Tile migration 20260826140000 HELD until the prod
  upload. ARMED: L4 Mitchell & Miska T&D example, L5 SPE 11380 field
  cases (owner PDFs).
- **D2 — Drilling Fluids & Hydraulics Studio**: **SHIPPED 2026-08-26**
  (engines PR #38 + Suite waves H0-H3; see
  docs/scope/HydraulicsStudio-STATUS.md). Rheology fits, Metzner-Reed
  loss chain with exact laminar closed forms, ECD with PP/FP overlay,
  Burkhardt surge/swab, hole cleaning; reuses the D1 geometry spine.
  Gates A13-A15 ACTIVE; L6/L7 ARMED. Tile migration 20260826190000
  HELD under the single-upload gate.

  **DEPLOY NOTE (owner directive 2026-08-26): no prod zip until all 12
  apps are ready. EVERY D-phase tile migration is HELD and they all
  apply together at the one launch upload (currently held:
  20260826140000 D1, 20260826190000 D2).**
- **D3 — Well Control Studio**: kick tolerance, kill sheets, MAASP;
  IWCF-style worked examples as gates.
- **D4 — Cementing Studio**: keeps the real volume math, replaces all
  random placement outputs with a real placement/free-fall/ECD model +
  API 10D standoff.
- **D5 — Geomechanics & Wellbore Stability Studio**: the locked MEM
  rebuild under Drilling on the salvaged ~440-LOC engine core;
  breakout/mud-window vs inclination/azimuth; consumes pp-1.0.0
  curves; deletes the MEM tree + re-homes its geoscience alias routes.
- **D6 — Casing & Tubing Design Studio upgrade**: validate/replace the
  simplified pressure math (API TR 5C3), migrate off legacy
  `public.wells` to the registries, add persistence + tests.
- **D7 — Completion Design Studio**: string architect + schematic + BOM
  (absorbs Well Schematic Designer and CTDP completion components).
- **D8 — Perforation & Sand Control Designer.**
- **D9 — Stimulation Designer**: rebuild of frac-completion.
- **D10 — Well Integrity & P&A Studio.**
- **D11 — Well Cost & Time Estimator**: salvages WellCostIQ utils;
  canonical MC + EPE cash-flow links.

Each of D1–D11 starts as its own planned program (WDS-style plan,
literature/validation needs surfaced up front, owner PDFs requested
early where SPE-copyrighted references are required).

## 5. Locked sign-off decisions (owner, 2026-08-26)

1. **12-app portfolio as listed in §2** (10 firm + flex slots resolved
   to Well Integrity & P&A and Well Cost & Time).
2. **Artificial Lift Designer and Nodal Analysis Studio stay in
   Production**; D&C reuses their engines and cross-links.
3. **RTO Dashboard archived** (not Coming Soon).
4. **Well Spacing Optimizer moves to the Reservoir module.**
5. Archive list of §4 D0 confirmed in full; nothing else kept alive.
