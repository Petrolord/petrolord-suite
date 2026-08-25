# Well Design Studio (slug `well-planning`) — STATUS

Program of record: Compass-class rebuild approved 2026-08-25
(waves WD0-WD6). App renamed from "Well Planning Pro" to
**Well Design Studio** (owner decision; slug and entitlement key
unchanged).

## Audit baseline (2026-08-25)

The pre-program app was an unfinished Horizons scaffold: trajectory
never persisted, anti-collision invoked a nonexistent edge function,
charts were "Chart removed" placeholders, the 3D view was a canvas-2D
projection, and the survey math carried at least six correctness bugs
(ft/m rate factor, mirrored solver azimuth, closure from the CRS
origin, fake vertical section, a QA guard that failed every deviated
well, unclamped acos). Legacy tables (`wells`, `well_targets`,
`trajectory_plans`, `anticollision_checks`, `projects`) have no repo
DDL. Full audit and program plan: session plan 2026-08-25.

## WD0 — true math, gating, honest tile (this wave)

- New engines domain `engines/drilling/` (engines PR #32):
  `surveyMath.js` (wraps the validated seismolord minimum-curvature
  kernel; adds arc-slerp attitude interpolation, TVD-plane crossings,
  true vertical section, wellhead-relative closure, dual-convention
  DLS, resampling, full survey table) and `segmentCompiler.js`
  (hold/build/turn/buildTurn/toolfaceArc under the strict unit rule:
  rates per 30 m or per 100 ft of the caller's own depth unit).
  50 jest gates vs an independent numpy oracle
  (tools/validation/drilling), including the 3 deg/100ft-over-1000ft
  = 30 deg regression class of the old app's ft/m bug.
- TrajectoryTab now compiles through the engine; the six math bugs are
  gone. Auto-solve uses the exact circle-tangent build-hold
  construction with the compass azimuth convention (engines
  profileDesign replaces the inline solve in WD2).
- Charts: "Chart removed" placeholders replaced with a chartTheme +
  ChartLogo pack (plan view, section view, inclination and DLS
  strips). The fake "3D" view no longer backs the Trajectory tab
  (real WebGL2 3D lands in WD5); survey CSV export works.
- Deleted: `src/lib/wellpath-kernel.js`, `src/utils/wellpath-kernel.js`
  (dead duplicate), `src/utils/trajectorySolver.js`, the dead
  `src/pages/apps/Drilling*` route tree, `IntegratedAnalysisTab.jsx`,
  `wellPlanningData.js`.
- Route now entitlement-gated (`ProtectedAppRoute appId="well-planning"`).
- Tile migration `20260825200000_well_design_studio_tile.sql`
  (idempotent update-or-seed + rename; HOLD until the WD0 prod upload).
- Validation runner skeleton `tools/validation/drilling-validation.ts`
  (active analytic gates; literature gates armed pending owner PDFs:
  Bourgoyne ADE ch.8, Mitchell & Miska survey example, Amoco/API
  MD-TVD table, ISCWSA MWD Rev4 test Well #1).

Known WD0 leftovers (by design, later waves): Anti-Collision tab still
non-functional pending WD4 (it no longer pretends otherwise), Reports
tab still reads legacy `trajectory_plans` (WD1 replaces persistence),
Casing/Costing tabs remain launcher mocks (reviewed in WD5/WD6),
`WellTrajectory3DView.jsx` retained only for the AC tab until WD4.

## Upcoming waves

- WD1 wp_* schema + Site>Wellbore>Design workspace shell
- WD2 profile solvers (J/S/continuous/horizontal landing/nudge/toolface)
  + design studio + full chart pack + targets from geo registries
- WD3 WMM2025 magnetics + actual surveys + plan-vs-actual + project-ahead
- WD4 ISCWSA Rev4 error model + anti-collision (ladder, traveling
  cylinder, spider) + survey programs
- WD5 WebGL2 3D + geo_wells publish bridge (Seismolord co-render) +
  PPFG overlay + trajectory contract + DXF exports
- WD6 wall-plot report pack + literature gates + launch
