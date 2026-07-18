# Waterflood Design Studio — status

App: `src/pages/apps/WaterfloodDesignStudio.jsx` (Reservoir module).
Routes: `apps/reservoir/waterflood-design-studio` + legacy aliases
`fractional-flow-calculator` (the tile slug) and
`relative-permeability-designer`.
Program: the first Reservoir "massive upgrade" (plan approved
2026-07-17), which also created the shared Studio UI shell
(`src/components/studio/`) that later Reservoir upgrades reuse.
Supersedes: the single-page Fractional Flow Analyzer (deleted in W3;
its displacement physics and charts live on in the Displacement tab).

## Phase status

- **W1 — Studio shell kit + savedProjects factory. DONE 2026-07-17
  (PR #95).** `src/components/studio/` (StudioLayout/Header/AutoSave/
  ProjectManager/Help/Notifications + useStudioNotifications +
  LoadingOverlay), copy-generalized from the DCA shell, props-only.
  `src/utils/savedProjects.js` `createSavedProjectsService` is the
  single implementation of the saved_<app>_projects convention; DCA
  persistence delegates to it (payload-shape locked by tests).
- **W2 — Validated engines. DONE 2026-07-17 (PR #96).**
  Displacement extensions (tabular kr + validation + endpoint
  scaling, field-unit gravity/dip fw term, polymer screening,
  generalized Welge, PV/time) in `fractionalFlowCalculations.js`;
  `layeredSweepCalculations.js` (Dykstra-Parsons V log-normal fit,
  DP frontal positions/coverage/WOR, Stiles coverage/water cut);
  `patternForecastCalculations.js` (five-spot EAbt Willhite/Craig
  regression + Dyes-Caudle-Erickson growth, material-balance-
  consistent rate forecast, fill-up, WOR limit). 45 new tests, all
  goldens cite sources with hand arithmetic in-file.
- **W3 — The studio app. DONE 2026-07-17 (PR #97).** Studio-shell workstation
  with tabs Displacement | Layered Sweep | Pattern Forecast |
  Scenarios; `WaterfloodDesignContext` (all results useMemo-derived,
  never persisted); Supabase projects with 10 s debounced autosave
  (`saved_waterflood_design_projects`, migration 20260717110000
  applied live); scenario snapshots compared through the live
  engines; annual-profile CSV export in the NPV Scenario Builder
  handoff format (year, production_bbl). Tests: wiring suite for
  buildDisplacementSpec and the annual CSV aggregation (caught a
  sparse-array hole that would have written NaN rows for zero-
  production years) plus a full-page four-tab render smoke test.
  Tile rename migration 20260717110500 authored but **deploy-gated**
  (apply with the prod upload that carries the studio).
- **W4 — Uncertainty tab. DONE 2026-07-18 (branch
  feat/waterflood-uncertainty).** Canonical MC extraction first:
  `src/lib/monteCarlo.js` (Gaussian-copula correlated sampler,
  distributions, basicStats, tie-averaged Spearman
  rankCorrelationSensitivity) extracted from ReservoirCalc Pro per the
  CLAUDE.md canon rule, ReservoirCalc delegates to it. Engine:
  `src/utils/waterfloodUncertainty.js` samples enabled displacement/
  pattern inputs and reruns `forecastPattern` per realization; config
  parsing with user-facing errors, deterministic-tab validity gates
  with rejection accounting (no silent clamping), petroleum percentile
  convention (P90 low), Spearman tornado vs Np, chunked async runner.
  UI: fifth tab (UncertaintyPanel with per-parameter distributions
  seeded plus/minus 20% from the working case, coreyOnly params gated
  off under tabular kr; UncertaintyResults with P90/P50/P10 KPIs,
  exceedance curve, tornado, rejection accounting; DiagnosticsRail MC
  section). Config persists with the project; results are transient
  and flagged stale on any input edit. Suite locks convergence to the
  deterministic forecast as spreads collapse and physics-known
  sensitivity signs (Sor/muO/Bo negative, h_ft positive) with a seeded
  rng.
- **W5 — DCA adopts the Studio kit. DONE 2026-07-18 (branch
  feat/dca-studio-kit).** The DCA page now consumes
  StudioLayout/Header/AutoSave/Help/ProjectManager and
  useStudioNotifications; the six shell components the kit was
  originally generalized from (DCALayout, DCAAutoSave,
  DCANotifications, DCAProjectManager, DCAHelp chrome,
  DCALoadingStates) are deleted, DCA help content lives on as
  DCAHelpContent inside StudioHelp. Analysis panels untouched. New
  page smoke test walks both tabs on the shared shell. There is now
  a single shell implementation across DCA and this studio. Next:
  VRR Monitor → Recovery Factor Estimator → Aquifer Influx
  Calculator get the same one-app-at-a-time upgrade treatment.
- **W6 — Surveillance tab (Waterflood Dashboard absorbed). DONE
  2026-07-18 (branch feat/waterflood-surveillance-tab; owner decision:
  one waterflood app in Reservoir).** The dashboard's real, jest-tested
  analytics (reservoir-barrel VRR via computePeriodVoidage, Hall plot
  from measured whp_psi, Chan SPE 30775 diagnostics, injector-producer
  cross-correlation, VRR-balanced recommendations; 27 engine tests)
  now run in a sixth studio tab: SurveillancePanel (CSV import,
  template download, engine config) + SurveillanceResults (the
  existing capability-gated components/waterflood panels).
  Surveillance rows + config persist in the studio project payload.
  Retired: WaterfloodDashboard page + its shell-only panels; route
  redirects to the studio with ?tab=surveillance (tab deep-link
  support added). Deploy-gated migration 20260718120000 archives the
  waterflood-dashboard tile, drops saved_waterflood_projects (0 rows
  live, checked 2026-07-18) and recreates get_all_my_projects without
  the arm; apply WITH the prod upload carrying this tab. The dead
  waterflood-engine edge function was already deleted from the
  Supabase project (verified: comment-only references in prod build
  and source).

## Deliberate scope choices

- Valuation stays out: the Pattern tab hands off the annual oil
  profile to NPV Scenario Builder (Economics owns valuation, the R5
  split).
- Rel-perm lab-data fitting and capillary pressure stay out: that is
  SCAL Studio scope (ReservoirEngineering-Module.md §4.2); this app
  consumes curves (Corey or pasted table). The rel-perm alias tile
  archives when SCAL Studio ships.
- Screening-level analytical methods, stated in-app: 1-D BL with Pc
  neglected, piston areal growth, non-communicating layers, constant
  injectivity, no pattern interference.
