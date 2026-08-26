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

## WD5 — 3D and the integration differentiators

- 3D window: `components/WellpathCubeView.jsx` on a lean raw-WebGL2
  line renderer (`viewer3d/WpCubeRenderer.js`, no three.js — house
  playbook) sharing the Seismolord orbit-camera math
  (Seismolord/viewer/cube3d.js, pure + jest-tested). Scene geometry is
  `services/wpMesh.js` (jest-gated): multi-well co-render (plan +
  definitive actual composite + the site's other definitive designs),
  2-sigma EOU rings from the WD4 covariances, targets with true
  geometry at TVDSS, registry tops on the bridged well, axes box with
  E/N/TVDSS ticks, north arrow, vexag 1/2/5, layer toggles, PNG
  snapshot (preserveDrawingBuffer). Labels are camera-projected DOM
  (e2e cannot read WebGL pixels — house rule), so wellhead/TD/target/
  top labels are assertable.
- Publish bridge: `services/publishPlan.js` + `PublishDialog` — the
  design's saved trajectory becomes a geo_wells registry row (create
  on first publish + stamp wp_wellbores.geo_well_id; republish updates
  the SAME row so Seismolord/correlation/petrophysics references
  survive), with optional checkshot borrow from another registry well
  (provenance recorded in crs_provenance) and
  wp_designs.published_geo_well_id/published_at stamping. Deviation
  follows the registry contract (metres, grid azimuths, ascending MD)
  — the same shape Seismolord's cube lattice-path builder consumes, so
  a published plan co-renders there with no further wiring.
- Trajectory contract: `services/trajectoryContract.js` — versioned
  (`petrolord-trajectory` v1.0.0) self-describing shape with the full
  azimuth chain + geomagnetic context, stations in both wellhead-
  relative and absolute site-CRS frames. Four serializers: JSON, CSV
  (# header block), Excel (xlsx Header+Stations sheets), DXF 3D
  polyline in absolute coordinates with z up (dxf-writer). Export menu
  on the Design tab (quick user-unit CSV kept).
- PPFG mud window: `services/ppfg.js` reads the Pore Pressure Studio
  prognosis published to the bridged registry well (geo_wells_logs
  PP/FP/OBG, MPa vs MD, pipeline pp-1.0.0), hangs it on the design
  trajectory (MD→TVD via the engine path) and renders
  `charts/MudWindowPanel.jsx` beside the section view — MPa or EMW
  g/cc, safe-window band, tightest-window callout. Honest empty states
  when there is no bridge or no published prognosis.
- Compare polish: absorbed into the 3D window — plan, actual composite
  and offset wells co-render with EOU rings (the WD3 2D overlays
  remain on the Surveys tab).
- Tests: Suite jest 3179 green incl. 25 new WD5 gates (wpMesh frame/
  EOU/targets/tops/axes, contract build + all four serializers with
  xlsx re-read and DXF vertex counts, PPFG hydrostatic EMW identity +
  curve plumbing, publish payload/patch contracts); build green; e2e
  5/5 incl. a WD5 probe asserting contract exports digit-for-digit and
  the 3D window's projected labels + PNG snapshot.

## WD6 — reporting, launch

- Report pack (`services/reportPack.js` + `tabs/ReportsTab.jsx`,
  replacing the last placeholder): three client-side PDFs on the house
  jsPDF+autotable pattern (brand header with the transparent watermark
  logo, fitted text, page footers, jest-tested against the mocked-jsPDF
  exemplar). Charts are VECTORS drawn into the page (crisp at print
  scale, never rasterized DOM).
  - Wall plot: A4 landscape — well-header block, plan + section views
    with 2σ EOU overlays, key-station table, target table.
  - Survey listing: portrait, full station table + TD/QC summary line.
  - Anti-collision report: from a saved wp_ac_runs row — rule
    parameters, per-offset minimum SF, vector SF ladder, and every
    station below the review threshold (explicit "none" row when
    clean).
  All render from the design's SAVED station cache — nothing reports
  from unsaved drafts.
- `services/publishPayload.js` split out of publishPlan (pure, no
  Supabase import) so the e2e spec recomputes publish payloads in
  node; publishPlan re-exports, all consumers unchanged.
- Marketing rename sweep: every user-facing "Well Planning (Pro/App)"
  string now says Well Design Studio — Resources case study,
  Casing & Tubing Design Pro integration panel + quick start, Casing
  Wear Analyzer, FDP integration services, ecosystem integration list.
  (Solutions.jsx and ModulesShowcase already said Well Design Studio.)
  Legacy-importer copy intentionally still names the old app.
- Launch tile copy: migration `20260826000000_well_design_studio_tile_launch.sql`
  (update-only, idempotent) replaces WD0's "being rebuilt wave by
  wave" description with the real feature set. DEPLOY-GATED with
  20260825200000 — both apply at the WD6 prod upload (MIGRATIONS.md
  rows PENDING until then).
- Operator guide: docs/scope/WellDesignStudio-GUIDE.md (workspace,
  design/surveys/AC/reports workflows, the full trust chain A1–A8).
- e2e: 6/6 — new WD6 probe asserts the publish payload and a real
  survey-listing PDF whose page count matches the same generator run
  in node (jsPDF named-import fix makes reportPack node-importable).
- jsPDF note: `import { jsPDF }` (named) — the default export is not a
  constructor under node ESM.

## Post-launch follow-on (2026-08-25, same day)

- User manual v1.0 delivered:
  /root/WellDesignStudio-UserManual-20260825.docx (~7,000 words, 18
  chapters + 4 appendices, house docx style).
- In-app help guide: WellDesignHelpGuide.jsx (EPE help-guide pattern,
  16 sections incl. quick start, all workflows, validation basis,
  pitfalls, glossary) routed at apps/drilling/well-planning/help with
  a Help chip in the app header; 3 jest render/content gates.
- Literature gate L1 CLOSED: the ADE ch.8 survey-calculation example
  (due-north 3 deg/100ft build to 60 deg at 2,000 ft; published
  minimum-curvature TVD 1,653.99 ft / ND 954.93 ft) secured via the
  attributed open-access republication (Amorin & Broni-Bediako 2010,
  RJASET 2(7):679-686, archived at /root/wds-literature/) and
  cross-checked against the closed-form build-arc identity. Engines
  PR #36 (golden + jest gate) subtree-pulled; validation runner gate
  A9 ACTIVE. L2 (Mitchell & Miska) and L3 (Amoco BPA-D-004) remain
  armed: M&M needs the book (OnePetro/PennWell); the Amoco handbook is
  publicly viewable (Scribd/SlideShare/pdfcoffee) but blocked to
  scripted download — drop either PDF in /root/wds-literature/ to
  activate.

## Fix pack (2026-08-26)

- Section view rendered no plot: the chart-pack Panel had no height of
  its own, so in the single-panel Section mode (a flex parent, unlike
  the stretching grid cells of Plots mode) the ResponsiveContainer
  collapsed to 0. Panel is now h-full (TrajectoryCharts.jsx); all
  existing usages are grid/flex parents with resolved heights.
- Targets were only toggleable in the 3D view (layer chips). DesignTab
  now has a Targets toggle in the Section and Plots view header;
  targets are projected into the section frame (VS at the section's
  own azimuth, TVD below KB = tvdss_m + kb_elev_m) and drawn as
  labelled ReferenceDots (ifOverflow extendDomain), and the Plots-mode
  plan view honors the same toggle.
- Compass-style VS axis: the section view's X domain is padded both
  sides of the data (10% of VS span, floored at 5% of TVD span), so
  the axis carries negative and positive section and a vertical hold
  from surface sits mid-plot instead of hugging the TVD axis. Applies
  to every SectionViewPanel (dedicated Section view, Plots grid,
  Surveys tab, harness).

## Launch state

- All six waves DONE. Tabs: Design (solvers, charts, 3D, exports,
  publish), Targets, Surveys, Anti-Collision, Reports, Apps — no
  placeholders left.
- Validation: drilling runner gates A1–A8 ACTIVE and passing; L1–L3
  ARMED awaiting owner literature PDFs (non-blocking).
- Ship checklist: prod upload (slim source zip per the Hostinger
  procedure) → owner confirms live + purges CDN → apply the TWO
  deploy-gated tile migrations (20260825200000, 20260826000000) → flip
  their MIGRATIONS.md rows → verify chunk markers.
- Owner staging E2E checklist (from the program plan): design a J-well
  and an S-well, land a horizontal, import an actual survey, run AC
  vs a shared offset, publish and see the well in Seismolord's cube,
  print the wall plot.

## Upcoming waves

- WD1 wp_* schema + Site>Wellbore>Design workspace shell [DONE]
- WD2 profile solvers (J/S/continuous/horizontal landing/nudge/toolface)
  + design studio + full chart pack + targets from geo registries [DONE]
- WD3 WMM2025 magnetics + actual surveys + plan-vs-actual +
  project-ahead [DONE]
- WD4 ISCWSA Rev4 error model + anti-collision (ladder, traveling
  cylinder) + survey programs [DONE]
- WD5 WebGL2 3D + geo_wells publish bridge (Seismolord co-render) +
  PPFG overlay + trajectory contract + DXF exports [DONE]
- WD6 wall-plot report pack + literature gates + launch [DONE]
