# Pipeline & Line Sizing Studio — status

Phase: Facilities F1 (Facilities-ROADMAP.md §3 app 2, §5 F1)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f1)
Slug: `facility-network-hydraulics` (kept — it carries live
entitlements; the tile RENAMES via the HELD migration
20260829530000). Routes for the retired `pipeline-sizer` and
`pipeline-designer` redirect here.

## What shipped

- **Engine** (`@petrolord/engines` PR #77, vendored by subtree, shim at
  `src/utils/facilities/engine/lineHydraulics.js`): liquid
  Darcy-Weisbach + Colebrook-White (laminar branch, regime flag); the
  four published gas transmission forms (Weymouth, Panhandle A/B,
  General Flow with first-principles Reynolds) with the standard
  elevation adjustment and a bisection outlet-pressure inverse; Barlow
  wall thickness under the B31.4/B31.8 design-factor families with
  MAOP round-trip; pigging estimates (swept volume from a SUPPLIED
  holdup, run time, catcher-limited interval). Validated against an
  independent stdlib SI oracle implementing the published SI-form
  constants (two published routes meeting): 15 gates, engines suite
  1835 green.
- **Composition layer** `src/utils/facilities/lineSizing.js` (no new
  physics): wires the engine to the Suite's golden-tested Beggs &
  Brill (`nodal/correlations/beggsBrill`), the DAK z-factor
  (`gasProperties`), RP 14E (`chokePerformance`) and the checked pipe
  schedule. 13 jest gates, including a cross-implementation check
  (nodal Moody vs engine Colebrook within 2 percent on the same line)
  and the dead-liquid single-phase collapse.
- **Studio** `src/pages/apps/PipelineLineSizingStudio.jsx` +
  `src/components/linesizing/` + `src/contexts/LineSizingContext.jsx`
  on the studio kit (StudioLayout/ProjectManager/AutoSave/Help). Tabs:
  Line Sizing (liquid/gas/multiphase with the every-bore sweep table +
  chart and per-row RP 14E verdicts), Profile (segment editor +
  hydraulic gradient chart, marched in the active mode's physics),
  Wall Thickness (Barlow + MAOP + adequacy verdict), Pigging (holdup
  fed straight from the Beggs & Brill answer or typed). ChartFrame +
  watermark standard; help guide; 2 smoke tests.
- **Persistence**: `saved_linesizing_projects` (migration
  20260829520000, APPLIED live, MIGRATIONS.md logged). Inputs only;
  results re-derived on load.
- **Fluid Studio hand-off restored** (removed at F0 because it fed the
  mock Pipeline Sizer): "Send to Line Sizing Studio" passes the
  backbone via location.state; the studio prefills oil gravity, gas
  gravity and temperature and lands on the multiphase mode.
- **Deleted**: `src/pages/apps/FacilityNetworkHydraulics.jsx`,
  `src/components/facilitynetworkhydraulics/` (its untested Beggs &
  Brill twin and engines superseded),
  `src/utils/facilityNetworkHydraulicsCalculations.js`, and the
  orphaned `src/utils/pipelineSizerCalculations.js` (its Colebrook
  role is now carried, validated, by the engine).

## Honest limits (stated in-app)

- Single-line only: the gathering-network solve is Production Network
  Studio's (locked decision, Production-ROADMAP.md §6.2).
- Liquid rates at line conditions (dead liquid downstream of
  separation); live-oil lines belong in Flow Assurance Studio.
- Gas z is DAK at inlet (or typed); no per-segment recompute of z in
  the traverse yet.

## Open

- Tile rename migration 20260829530000 HELD for the prod upload.
- Literature gates for the gas-equation constants against a GPSA
  worked example remain ARMED (owner PDFs).
