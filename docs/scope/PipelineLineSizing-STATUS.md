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
  schedule. 33 jest gates, including a cross-implementation check
  (nodal Moody vs engine Colebrook within 2 percent on the same line),
  the dead-liquid single-phase collapse, and the FC2-0 repair gates
  below.
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

## FC2-0 composition-layer repair (2026-09-16)

Four defects in `src/utils/facilities/lineSizing.js`, found by the
NextGen FC2 course build and recorded in
`/root/fc-wip-linesizing/FINDINGS.md` section S. The vendored engine was
NOT touched; the engine defects in that file's sections A to E are
separate and still open.

- **S1, the sweep recommendation (user-visible).** It returned the first
  PASSING ROW IN TABLE ORDER and called it the smallest passing bore.
  The schedule table runs by nominal size then schedule, which is not
  monotonic in bore (a heavier schedule is a smaller bore, and it sits
  after the lighter one), so on a 12000 bpd 10000 ft duty 7 of 10
  velocity caps were recommending the wrong size, e.g. 6 in sch 40
  (6.065 in) where 6 in sch 80 (5.761 in) also passed. Now the smallest
  passing bore, ties on the thinner wall then the smaller OD. The rule
  is exported (`RECOMMENDATION_RULE`) and stated in the table note and
  the help guide.
- **S2, the invented density.** `gas.z || 1` and `gas.rhoLbFt3 || 1`
  made a zero or unreadable gas density into 1 lb/ft3 and reported an
  RP 14E verdict against it. Removed; the gas sweep asks for the density
  once up front and refuses by name.
- **S3, the discarded convergence flag.** The layer took
  `naturalGasZ`, which throws away DAK's `converged`. It now calls
  `dakZ` directly, refuses on non-convergence, AND refuses outside the
  correlation's published window (1.0 <= Tpr <= 3.0, Ppr <= 30), which
  is the check that matters: DAK reports converged at Tpr 0.711 with
  z = 0.293. Ppr below 0.2 stays allowed (near-ideal, z tends to 1).
- **S4, the inlet gradient over the whole line. MARCHED, deliberately.**
  The one-shot form under-reported a 50000 ft drop by 9 percent, which
  would have been disclosable, but it also reported a gassy 40000 ft
  line as arriving at 55 psia when marching shows its pressure reaching
  atmospheric 20659 ft in. A simplification that turns an undeliverable
  line into a deliverable-looking one cannot be fixed by stating it.
  Explicit Euler, steps sized to 0.25 percent of inlet pressure, about
  46 ms for a full 12-bore sweep, step residual under 0.1 percent.

Results that moved: sweep recommendations where a heavier schedule of
the same nominal size also passes; every multiphase drop, upward (under
1 percent short, several percent long and gassy); pigging swept volume,
which now reads the length-weighted `avgHoldup` rather than the inlet
holdup; and cold, very high pressure or zero-gravity gas cases, which
now refuse where they used to answer.

## Honest limits (stated in-app)

- Single-line only: the gathering-network solve is Production Network
  Studio's (locked decision, Production-ROADMAP.md §6.2).
- Liquid rates at line conditions (dead liquid downstream of
  separation); live-oil lines belong in Flow Assurance Studio.
- Gas z is DAK at inlet (or typed); no per-segment recompute of z in
  the gas traverse yet. Outside the DAK window the studio refuses and
  says so rather than falling back silently.
- The multiphase line is marched and the step count is shown on the
  card; the multiphase pattern and holdup on the result cards are INLET
  values, with the outlet value shown alongside when it differs.

## Open

- Tile rename migration 20260829530000 HELD for the prod upload.
- Literature gates for the gas-equation constants against a GPSA
  worked example remain ARMED (owner PDFs).
- **The RP 14E check in the sweep uses the INLET mixture velocity, and
  the fastest point of a gas-carrying line is the outlet** (4.84 ft/s
  against 6.02 ft/s on the 50000 ft case). `maxVmFtS` and `outletVmFtS`
  are returned and ready; moving the pass logic onto them would move
  more results, so it was left out of a wave scoped to four defects.
- Engine-side defects behind this app (descending-line outlet pressure,
  unguarded roughness, efficiency and corrosion allowance, the two
  barrel constants) remain open in the engines repo.
