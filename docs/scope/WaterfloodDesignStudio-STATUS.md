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
- **W4 — Uncertainty tab. PENDING.** P90/P50/P10 via the canonical
  ReservoirCalc Pro Monte Carlo engine (sanctioned extraction to
  `src/lib/`), honest rank-correlation sensitivity.
- **W5 — DCA adopts the Studio kit. PENDING.** Then VRR Monitor →
  Recovery Factor Estimator → Aquifer Influx Calculator get the same
  one-app-at-a-time upgrade treatment.

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
