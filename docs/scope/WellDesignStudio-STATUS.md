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

## WD1 — data model and workspace shell

- Migration `20260825220000_create_wp_wellplanning_tables.sql` APPLIED
  live 2026-08-25 (dry-run first; probes: 7 tables, 17 policies, RLS
  on): wp_sites (share root, CRS trio, slots, lease lines),
  wp_wellbores (wellhead/slot, KB/GL/water datum, azimuth reference,
  cached grid convergence, geo_wells bridge FK, sidetrack parent),
  wp_designs (versioned; one definitive per wellbore enforced by
  partial unique index), wp_targets, wp_surveys, wp_survey_programs,
  wp_ac_runs.
- New workspace: EDM-style Site > Wellbore > Design tree
  (`tree/SiteTree.jsx`) with status/share badges and lifecycle actions
  (new/rename/duplicate-as-revision/set-definitive/delete, org share
  on sites). `services/wpApi.js` CRUD, `state/WellPlanningStore.jsx`
  selection + caches. Draft undo/redo context now keys on the design id.
- Site dialog with the suite CrsPicker, pad origin, north reference and
  slot template editor; wellbore dialog with datum block and live grid
  convergence via `convergenceAt` (declination arrives with WD3).
- DesignTab (was TrajectoryTab) saves segments + tie-on + a station
  cache (metres) to wp_designs; definitive/archived designs are
  read-only with a duplicate-as-revision path.
- TargetsTab ported to site-scoped wp_targets (point + circle now;
  ellipse/polygon and registry pickers in WD2); CSV export; map kept.
- One-time `LegacyImportDialog` imports the legacy wells/well_targets
  tables into an "Imported wells" site (legacy rows untouched;
  trajectory_plans ignored as stale).
- Old mock tabs deleted (AntiCollision, Reports, CasingCement, Costing,
  fake 3D view, mock target importer); Anti-Collision and Reports tabs
  show honest wave placeholders until WD4/WD6.
- Known WD1 leftovers: no /dev harness route yet (planned with WD2's
  solver UI), Apps tab launcher passes the wellbore id as ?wellId=
  (consumers adopt the trajectory contract in WD5).

## WD2 — design studio (profile solvers, chart pack, registry targets)

- Engines PR #33 (subtree-pulled): `engines/drilling/profileDesign.js`
  with six solvers on exact circular-arc geometry — slant/J
  (circle-tangent closed form, build and drop sides), S-profile
  (two-circle common tangent to a final inclination), continuous 3D
  build (single arc, exact toolface emission), horizontal landing
  (Sawaryn & Thorogood SPE 84246 curve-hold-curve vector iteration),
  nudge forward + closed-form inverse, and toolfaceForTarget. Every
  solver validated by round-trip (solve, compile, land on target)
  against forward-constructed independent numpy goldens
  (oracle_profiles.py); 16 gates, engines suite 575 green.
- DesignTab: "Design methods" launcher (SolverDialog) replaces the old
  single auto-solve; whole-well profiles replace the segment list,
  curve-to-target and horizontal landing append from the current design
  end; new ToolfaceArc segment kind editable in the segment grid.
- PlanViewChart: custom equal-aspect SVG plan view (targets with true
  geometry, slots, lease lines, north arrow) replacing the stretched
  Recharts panel.
- Targets: ellipse and polygon geometry in TargetDialog, plus the two
  registry pickers ("From top": geo_wells top position via the
  minimum-curvature engine; "From surface": bilinear sample of a
  geo_surfaces grid) with provenance stamped.
- Dev harness `/dev/well-design` (unauthenticated, seeded) + e2e spec
  `e2e/well-design-studio.spec.js`: expectations computed from the
  engines package in the spec itself; the browser-solved J-well must
  match the engine's endpoint digit for digit. 2 e2e green locally.
- Known polish for WD3: holds emit a single station, so strip charts
  interpolate linearly across long holds (chart artifact only; the
  math is exact) — subdivide holds in the compiler. [DONE in WD3]

## WD3 — north, magnetics, actual surveys

- Engines PR #34 (subtree-pulled): `engines/drilling/magnetics.js` —
  WMM2025 spherical-harmonic synthesis (WGS84 geodetic to geocentric,
  Schmidt semi-normalized Legendre recursion, main field + secular
  variation, D/I/H/F + rates, UPS grid variation) on the official
  NOAA public-domain coefficient set (`data/wmm2025.js`, generated
  from the distributed WMM.COF). HARD GATE ACTIVE from day 1: all 24
  official NOAA WMM2025 test points reproduce within table rounding
  (0.06 nT / 0.006 deg) — jest + validation runner gate A6. Hold
  segments now subdivide in the compiler (strip-chart density;
  endpoints regression-gated unchanged).
- WellboreDialog: declination auto-fill — wellhead XY inverse-projected
  through the site CRS (`toLonLat`), WMM2025 evaluated at today's
  date, declination + dip + total field shown live and
  `mag_declination_deg` cached on save (no DDL; column existed from
  WD1).
- Azimuth reference chain closed (per the validated `toGridAzimuths`
  convention: grid +0, true +convergence, magnetic +declination
  +convergence): DesignTab now interprets the KO azimuth in the
  wellbore's azimuth reference and compiles in grid, converts solver
  results back, labels the listing "Azi grid", and warns loudly when
  a non-grid reference has no cached angles.
- New Surveys tab (`tabs/SurveysTab.jsx` + `SurveyDialog.jsx` +
  `services/surveyUtils.js`): actual survey runs per wellbore into
  wp_surveys — manual paste, CSV file (shared wellImport mapping
  helpers) or wells-registry deviation import; per-run azimuth
  reference and MD unit; stations stored in metres with the
  grid-converted cache written alongside. Definitive composite by the
  industry rule (deeper run wins from its tie-on down) via
  is_in_definitive flags. Views: survey listing, plan-vs-actual
  (overlaid plan/section/inclination charts + delta table: dInc,
  dAzi, dTVD, dN, dE, 3D separation at every actual station via exact
  arc-slerp plan interpolation), and project-ahead (continuous-build
  solve from the last actual station to a target with a max-DLS
  guard).
- Tests: engines suite 610 (24-point NOAA gate + hold subdivision);
  Suite jest 2985 green incl. 14 new surveyUtils gates (chain deltas,
  composite rule, plan-vs-actual vs engine paths, project-ahead
  compile round trip); e2e 3/3 incl. a browser-bundle declination
  probe asserted against the engines package.

## WD4 — uncertainty and anti-collision (the trust wave)

- Engines PR #35 (subtree-pulled): three new validated modules.
  - `engines/drilling/errorModel.js` — ISCWSA/OWSG MWD Rev4
    positional-uncertainty engine: all 27 agreed error sources
    (`data/iscwsaMwdRev4.js`), weighting functions, the Williamson
    balanced-tangential position Jacobian, systematic/random/global
    propagation, near-vertical singularity substitutions, NEV<->HLA,
    EOU ellipse + section extraction. HARD GATE ACTIVE: the official
    iscwsa.net example Well #1 — all 112 full-precision per-source
    workbook covariances at the 4 checkpoint depths and welleng-oracle
    totals at all 268 stations within 1e-8 (jest + validation gate A7;
    the former ARMED L4, activated now that the official workbook data
    is secured at /root/wds-literature/).
  - `engines/drilling/antiCollision.js` — SPE-187073 separation rule
    with pedal-curve projected uncertainty: closed-form closest point
    on minimum-curvature arcs, KOP sidetrack slicing (per-source sigma
    restart), SF/MASD/EOU-separation, ladder + traveling-cylinder
    series, rule classification. HARD GATE ACTIVE: the official ISCWSA
    clearance example — 11 offset scenarios match the published
    per-station SFs at the standard criteria (rtol 1e-2/atol 1e-3) and
    the welleng oracle geometry at 1e-6 (jest + validation gate A8).
  - `engines/drilling/surveyProgram.js` — instrument library
    (validated tools only; Rev4 today) + multi-run compositing with
    the ISCWSA tie-on carry (covariance freezes at tool changes;
    single-run program == plain model exactly).
- Suite: new Anti-Collision tab (`tabs/AntiCollisionTab.jsx`) replaces
  the WD1 placeholder — reference picker (design plan or definitive
  actual composite), offset picker across the site's other wp
  wellbores (definitive/latest designs) and geo_wells registry
  deviations in the site CRS, SPE-187073 rules editor (k, sigma_pa,
  Sm, radii, no-go/review thresholds), scan + summary cards +
  SF/distance ladder (`charts/LadderChart.jsx`) + traveling cylinder
  (`charts/TravelingCylinderChart.jsx`, highside/north frames) +
  violation table, and immutable run history in wp_ac_runs
  (save/view/delete; stored runs re-render the full chart pack).
- Survey programs: `components/SurveyProgramEditor.jsx` edits
  wp_survey_programs intervals per design (tiling validated loudly);
  a saved program routes DesignTab uncertainty through per-tool
  compositing.
- EOU on the design charts: DesignTab computes Rev4 uncertainty over
  the compiled stations (`services/acUtils.js`) and overlays 2-sigma
  EOU ellipses on the plan view + a TVD band on the section view;
  toggle in Design Settings; loud warning when no geomagnetic
  reference exists.
- WellboreDialog now caches the full magnetic model (total field +
  dip + declination) in wp_wellbores.mag_model on save;
  `resolveMagReference` prefers the cache and falls back to a live
  WMM2025 lookup through the site CRS (never silently defaults).
- No new DDL: wp_survey_programs and wp_ac_runs existed from WD1.
- Tests: engines jest 763; Suite jest 3154 green incl. 16 new acUtils
  gates (mag-reference fallbacks incl. the Number(null)==0 guard,
  program tiling validation, program-vs-single-run compositing, EOU
  overlay geometry, synthetic-pad scan ordering, serialize round
  trip); validation runner A1-A8 all active and passing; e2e 4/4 incl.
  a browser-bundle Rev4+separation-rule probe asserted digit for digit
  against the engines package.

## Upcoming waves

- WD1 wp_* schema + Site>Wellbore>Design workspace shell [DONE]
- WD2 profile solvers (J/S/continuous/horizontal landing/nudge/toolface)
  + design studio + full chart pack + targets from geo registries [DONE]
- WD3 WMM2025 magnetics + actual surveys + plan-vs-actual +
  project-ahead [DONE]
- WD4 ISCWSA Rev4 error model + anti-collision (ladder, traveling
  cylinder) + survey programs [DONE]
- WD5 WebGL2 3D + geo_wells publish bridge (Seismolord co-render) +
  PPFG overlay + trajectory contract + DXF exports
- WD6 wall-plot report pack + literature gates + launch
