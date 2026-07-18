# Well Test Analysis Studio — Program Plan (plan of record)

Status: APPROVED by owner 2026-07-18 (with recommendations accepted).
Locked decisions:
- Tile moves to the Reservoir module, keeping slug `well-test-analyzer`.
- Tile activation ships after WT3 (model library complete), with the prod
  upload that carries the app.
- Legacy `pta_projects` live-data check happens in WT2 (drop if empty).
- Horizontal wells, limited entry, variable wellbore storage, multiphase
  Perrine, RTA and SI units are named future scope, outside this program.

## 1. Context

Pressure transient analysis (PTA) is a core reservoir engineering discipline and
the biggest remaining gap in the Reservoir module
(ReservoirEngineering-Module.md §6). The existing "Well Test Analyzer"
(`src/pages/apps/WellTestDataAnalyzer.jsx`, slug `well-test-analyzer`) is a UI
mock: Run Analysis is a 1.5s setTimeout and every result is hardcoded
(kh=123.4 md, skin=5.6, Pi=3510). Its tile was archived in the honesty pass
(migration `20260717090000`); the roadmap says real PTA must be planned against
that app. This program replaces it with a professional, validated
**Well Test Analysis Studio**: the same class of tool as the DCA and Waterflood
Design studios, aiming at the everyday capability engineers use commercial PTA
software (Saphir-class core workflow) for.

Doctrine this plan follows (all established in the repo):
- **Validation-first / thin-real**: no engine reaches the UI until it reproduces
  reference truths in a harness; no tile activation until the app is real.
- **Studio shell kit** (`src/components/studio/`) + context provider pattern
  (`src/contexts/WaterfloodDesignContext.jsx` is the model).
- **Persist inputs only, recompute results on load**
  (`createSavedProjectsService`, `src/utils/savedProjects.js`).
- **White chart standard**: Recharts + `src/utils/chartTheme.js` +
  `ChartFrame`/`ChartLogo`.
- **Honest catalog**: tile migration ships with the prod build, never before.
- **No em dashes / AI contrastives in user-facing copy.**

## 2. Product scope — what the finished studio does

The full engineer workflow, end to end:

1. **Load test data**: upload gauge pressure CSV (papaparse) and enter/upload
   the rate history; optionally attach a well from the shared registry
   (`src/lib/wellsRegistry.js`) for name/context.
2. **QC and prepare**: gauge preview, log-cycle decimation of dense gauge data,
   outlier trimming, flow-period (breakpoint) identification from the rate
   history, selection of the analysis period (drawdown, buildup, injection,
   falloff, multi-rate).
3. **Diagnose**: log-log plot of Δp and the Bourdet derivative (computed against
   the correct superposition time function, with 0–0.5 log-cycle smoothing
   window), with automatic flow-regime flags (wellbore storage unit slope,
   radial stabilization, linear ½ slope, bilinear ¼ slope, boundary responses).
4. **Match a model**: pick from an analytical model catalog, adjust parameters
   with instant visual feedback (manual match), then auto-fit with
   Levenberg-Marquardt on pressure + derivative simultaneously. Tri-plot match
   view: log-log, semilog (superposition), and pressure-history overlay.
5. **Straight-line analysis**: Horner and MDH/superposition semilog (k, skin,
   p*), sqrt(t) for fractures, Cartesian for pseudo-steady state (pore volume).
6. **Results**: kh, k, skin, C, Pi/p*, ΔP_skin, flow efficiency, radius of
   investigation, boundary distances, xf/FcD, ω/λ, with confidence intervals
   from the fit covariance.
7. **Report and hand off**: parameter summary + PDF export; PVT intake from
   Fluid Systems Studio via the `navigate(state)` handoff pattern; send results
   (k, skin, p̄) onward to Reservoir Balance / Waterflood Design.

Model catalog at completion:
- **Wellbore**: constant wellbore storage + skin.
- **Reservoir**: homogeneous; dual porosity (Warren-Root PSS and transient
  slabs).
- **Well geometry**: vertical; infinite-conductivity vertical fracture
  (Gringarten); finite-conductivity fracture (Cinco-Ley bilinear).
- **Boundaries**: infinite acting; single sealing fault; parallel faults
  (channel); closed rectangle; constant-pressure boundary (via image wells /
  Laplace-space solutions).
- **Fluids**: single-phase oil (slightly compressible) first; real gas via
  pseudo-pressure m(p) and pseudo-time in WT4.

Units: oilfield units throughout (psi, STB/D or Mscf/D, md, ft, cp, hr).

## 3. App identity and catalog

- Slug stays `well-test-analyzer` (stable entitlement key, per the Waterflood
  precedent). Tile renamed to "Well Test Analysis Studio" with new description
  and `module='Reservoir'`.
- New route `apps/reservoir/well-test-analysis-studio`; old route
  `apps/production/well-test-analyzer` becomes a `<Navigate replace>` redirect.
- Tile activation after WT3, shipping with the prod upload that carries the app
  (deploy rule: a tile named Studio must never open the old mock).

## 4. Architecture

### 4.1 Engines — `src/utils/welltest/` (pure JS, named exports, no React)

| File | Contents |
|---|---|
| `numerics.js` | Bessel K0/K1/I0/I1 (Abramowitz-Stegun polynomial approximations, plus exp-scaled variants for overflow-free Laplace ratios), exponential integral E1, Stehfest algorithm (coefficient generation + inversion, N configurable, default 12) |
| `lmFit.js` | Levenberg-Marquardt nonlinear least squares: numerical Jacobian, damping schedule, optional bounds, covariance matrix → 95% CIs. Small dense linear solver (Gaussian elimination, partial pivoting) included |
| `derivative.js` | Bourdet derivative with respect to a log-time abscissa, L-window log smoothing, plus data prep: log-cycle decimation, outlier trim |
| `superposition.js` | Rate-step utilities (variable-rate superposition in time), Agarwal equivalent time, Horner time, flow-period/breakpoint detection |
| `models/` | Laplace-space dimensionless building blocks composed as wellbore × reservoir × boundary. Each exposes a `pwdLaplace(u, dimensionlessParams)`; a shared evaluator applies wellbore storage + skin in Laplace space, inverts via Stehfest, and dimensionalizes. WT1 ships `homogeneous.js`; WT3 adds fractures, dual porosity, boundaries |
| `models/modelCatalog.js` | Registry of model combinations with parameter metadata (name, symbol, unit, default, bounds, log-scale flag). Drives both the UI controls and the fitter, so adding a model is one entry + one solution file |
| `analysis.js` | Straight-line analyses: semilog MDH / Horner (k, s, p*), sqrt(t), Cartesian PSS (pore volume), radius of investigation, ΔP_skin, flow efficiency |
| `gas.js` (WT4) | Pseudo-pressure m(p) from PVT, normalized pseudo-time, gas deliverability (C-and-n and LIT/AOF) |

Performance: model evaluation is cheap (≈100 plot points × Stehfest N × Bessel
evals), fine for instant manual-match feedback via debounced `useMemo`. Auto-fit
runs through the async chunked-with-progress pattern already used by
`runWaterfloodUncertaintyAsync` (`src/utils/waterfloodUncertainty.js`).

### 4.2 Validation harness — `tools/validation/welltest/`

Python oracle (`oracle.py` + `genfixtures.py`, stdlib-only, integral-based
Bessel evaluation independent of the JS polynomial approximations, per the
basinflow convention) generating `goldens.json`, consumed by jest. Plus a
standalone labeled-CASE harness modeled on `tools/validation/mbal-validation.ts`
(exit 0 on full pass):

1. **Numerics gates**: Stehfest inverts known transform pairs; Bessel and E1
   versus oracle goldens; line-source solution matches the Ei solution in its
   validity window.
2. **Analytic identity gates** (exact literature truths): early-time wellbore
   storage unit slope pwD = tD/CD; radial semilog asymptote
   pwD = 0.5(ln tD + 0.80907) + s; dimensionless derivative plateau 0.5;
   oilfield constants 141.2 / 162.6 / 0.0002637 / 0.8936 consistency.
3. **Synthetic round trips**: data generated by the validated forward model
   (with noise) must be recovered by MDH, Horner and the LM auto-fit within
   stated tolerances. This is the app-level acceptance pattern, repeated for
   every new model in WT3/WT4.
4. **Published worked examples** (HARD GATE before WT2 merge): Dake
   Fundamentals Ch. 7 Horner buildup example and Lee (Well Testing, SPE
   Textbook 1) drawdown/buildup examples, with citations in-file. Fixture input
   data must be book-verified (typed from the reference, not recalled) before
   the case is armed.
5. WT3 adds: Gringarten ½-slope and Cinco-Ley ¼-slope anchors, Warren-Root
   dual-porosity example, boundary-model image-well truths (fault derivative
   doubling, channel ½ slope, closed-system late unit slope).

Rule (same as MBAL/SCAL): an engine merges only when its harness cases pass;
the corresponding UI ships only after the engine is merged.

### 4.3 UI — Studio shell kit (WT2)

- Page `src/pages/apps/WellTestAnalysisStudio.jsx` wrapping
  `src/contexts/WellTestStudioContext.jsx` (modeled on
  `WaterfloodDesignContext.jsx`: DEFAULT_* input shapes, useMemo-derived
  results, `useStudioNotifications`, 10s debounced autosave, `?tab=` deep link).
- Components `src/components/welltest/` using the shell kit
  (`StudioLayout/StudioHeader/StudioAutoSave/StudioHelp/StudioProjectManager`)
  and a local `primitives.jsx` (SectionLabel, ChartCard, Kpi, WarningBanner).
- **Tabs**: `data` (import, rate history editor, QC, flow-period picker) |
  `diagnostics` (log-log Δp + derivative, smoothing control, regime flags) |
  `match` (model catalog, manual sliders, auto-fit, tri-plot) |
  `specialized` (Horner / MDH / sqrt-t / Cartesian) |
  `report` (results table with CIs, PDF export, handoffs).
- Left rail per tab: project manager + reservoir/fluid/well inputs (h, φ, rw,
  Bo, μ, ct; PVT prefill from Fluid Studio handoff). Right rail:
  DiagnosticsRail with QC warnings, detected regimes, live parameter readout.
- Charts: Recharts with `scale='log'` axes (pattern:
  `src/components/declineCurve/DCATypeCurvePlot.jsx`), white `chartTheme`,
  wrapped in `ChartFrame` for the watermark.

### 4.4 Persistence and data (WT2)

- New table **`saved_well_test_projects`** via migration copied from
  `20260717110000_create_saved_waterflood_design_projects.sql` (uuid pk,
  user_id FK, project_name, inputs_data jsonb, RLS owner policy, updated_at
  index). Service: `createSavedProjectsService('saved_well_test_projects', …)`.
  Gauge data lives inside `inputs_data` (decimated series).
- Legacy `pta_projects`: query the live DB; if empty, drop it in the cleanup
  migration; if it has rows, keep read-only and decide with the owner.
- `src/database/functions/get_all_my_projects.sql`: point the well-test branch
  at the new table.

### 4.5 Cleanup of the mock (WT2)

Delete `src/pages/apps/WellTestDataAnalyzer.jsx`, `WellTestAnalyzerGuide.jsx`
(orphan), `src/components/welltestanalyzer/` (8 files), and
`src/utils/wellTestCalculations.js` (Bourdet smoothing reimplemented properly,
with tests, in `derivative.js`). Old route redirects to the studio.

## 5. Phasing — one PR per phase, conventional commits, branch off main

- **WT1 — Validated PTA core engine (no UI)**: numerics, LM fitter, Bourdet
  derivative, superposition, homogeneous model + catalog, straight-line
  analysis, Python oracle + goldens, harness cases 1–3 green, literature
  fixtures armed or explicitly flagged. Gate: hard-gate fixtures pass before
  WT2 merges.
- **WT2 — Studio app (core workflow live)**: shell-kit UI, all five tabs for
  the homogeneous family, CSV import + QC + flow periods, manual + auto match,
  persistence migration + service, mock deleted + redirect, `pta_projects`
  decision executed, Fluid Studio PVT intake, STATUS doc, smoke/wiring tests,
  MIGRATIONS.md rows. Tile stays archived.
- **WT3 — Model library**: fractures (infinite + finite conductivity), dual
  porosity, boundary family; harness case 5 green; regime flags extended;
  per-model guidance in StudioHelp. Tile activation migration (rename + module
  move + Active) staged for the next prod upload.
- **WT4 — Gas and multi-rate**: pseudo-pressure/pseudo-time, gas fixtures,
  full variable-rate superposition UX (multi-rate, injection/falloff), gas
  deliverability (AOF: C-and-n, LIT).
- **WT5 — Reporting and integration polish**: PDF report export, result
  handoffs (p̄/k/s to Reservoir Balance; k to Waterflood Design), Playwright
  e2e smoke, STATUS finalized.

## 6. Verification

- Per phase: full jest suite green; oracle harness exit 0; `npm run build`
  clean; staging exercised by hand (import an oracle-generated synthetic
  buildup CSV, confirm derivative shape, manual + auto match recover the known
  k/s/C within CI bounds).
- Update `docs/scope/WellTestAnalysisStudio-STATUS.md` at the end of each
  phase.

## 7. Program 2 (WT6–WT10) — remaining named scope (owner-directed 2026-07-18)

Owner direction: complete horizontal wells, RTA, SI units, the closed
rectangle and the pseudo-time abscissa. Limited entry, variable wellbore
storage and multiphase Perrine stay future scope. Same doctrine as WT1–WT5:
engine + oracle + harness gates before any UI exposure, one PR per phase,
stacked on main, no new tile (the studio absorbs everything, W6 precedent).

- **WT6 — Closed rectangle**: `models/rectangle.js`, homogeneous-only,
  well off-center via four boundary distances (L1/L2 in x, W1/W2 in y).
  Laplace-space image-lattice K0 sum with the WT3 cutoff (arg > 38) for
  early/mid u; for late u (image count past a cap) the exact PSS asymptote
  p̄D = 2π/(AD u²) + b/u, with the intercept b extracted once per parameter
  set at the crossover by Richardson extrapolation of u·p̄D − 2π/(AD u)
  (self-consistent; no shape-factor lookup at runtime). Gates: early-time
  identity with the homogeneous model; exact PSS slope 2π/AD; Dietz
  intercepts b = ½ln(2.2458·AD/CA) for the square (CA 30.8828) and 2:1
  (21.8369) literature constants plus closed-circle 31.62 consistency;
  thin-rectangle mid-time vs the channel model; oracle goldens from an
  independent real-time eigen/theta product-integration route (no Laplace,
  no Stehfest, no K0); auto-fit round trip.
- **WT7 — Horizontal well**: uniform-flux horizontal well in a slab,
  no-flow top/bottom, anisotropy kv/kh, observation at z = zw + rw′
  (Ozkan–Raghavan form). Mathematically a Gringarten-style F-sum
  (besselK0Integral) over anisotropy-scaled z-images (image form for
  large u, eigen form for small u). Gates: early vertical-radial plateau
  (√(kh·kv)·Lw), intermediate linear half slope, late pseudoradial
  plateau on kh·h; oracle real-time route; auto-fit round trip
  recovering Lw and kv/kh.
- **WT8 — Pseudo-time abscissa + SI units**: normalized pseudo-time
  (already in gas.js) becomes a selectable diagnostics/analysis abscissa
  for gas tests; SI unit system as a display-layer conversion registry
  (kPa, m, m³/d, µm²·mD conventions) with a studio-wide toggle persisted
  in the project payload — engines stay oilfield internally, conversions
  round-trip tested. No schema change.
- **WT9 — RTA**: engines `rta.js` — material-balance time, rate-normalized
  pressure + Bourdet derivative on te, flowing material balance
  (q/Δp vs Np/Δp regression → N and J; gas via normalized pseudo-pressure
  and pseudo-time → G), transient linear-flow analysis. Gates: exact
  synthetic BDF exponential-decline round trip recovering N and J;
  closed-system model-data consistency; literature anchor armed if a
  book-verified example is obtainable, else the exact-synthetic gates are
  documented as such. UI: RTA surface in the studio (production-data mode).
- **WT10 — Close-out**: PDF/report coverage for the new models, RTA and
  SI; e2e additions; STATUS/memory updates; stack merged; prod upload
  handoff. No migration expected (tile already Active; payload is jsonb).
