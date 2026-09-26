# Data & AI: status

Plan of record: `docs/scope/NextGen-Remaining-Courses-PLAN.md` section 15
(owner decisions 2026-09-23).

## Deployment status (2026-09-26): all five waves live

Every migration marked HELD or NOT APPLIED in the wave sections below has
since been applied; MIGRATIONS.md is the record of each apply.

| wave | Suite app (module `data-ai`) | NextGen course | live since |
|---|---|---|---|
| D1 | Data Quality Studio | `dataqc` | 2026-09-25 |
| D2 | ML Workbench | `mlcore` | 2026-09-25 |
| D3 | Electrofacies Studio | `facies` | 2026-09-25 |
| D4 | Production Forecasting ML Workbench | `forecastml` | 2026-09-25 |
| D5 | AI Evaluation Studio | `appliedai` | 2026-09-26 |

- Module price: data-ai 2,999 per month (owner confirmed 2026-09-25); D5 made no pricing change.
- D5 deploy: Suite 8a6c9d838 and NextGen 2cb31554f uploaded and verified; Suite
  migrations 20260925180000 to 210000 applied with the `ai-eval-assist` edge
  function deployed before the tile went Active; NextGen 20261104_d5_appliedai_*
  applied after a clean production rolled-back dry run. Engines pinned at f50251d.
- The optional language-model helper (`ai-eval-assist`) is metered through
  `dai_llm_calls`. No graded figure in the app or the course depends on its
  output. Live today: 50 calls per organization per UTC day, gpt-4o-mini.
- **Pending apply (owner decision 2026-09-26, branch feat/eval-assist-luna-caps):**
  default model `gpt-6-luna` (a reasoning model: sent `reasoning_effort` low,
  overridable by the optional secret `OPENAI_REASONING_EFFORT` from none, low,
  medium, high, xhigh, max; no temperature; gpt-4o and gpt-4.1 models keep
  temperature 0; `OPENAI_MODEL` still overrides the model, so switching back
  needs no deploy); structured output (json_schema) for the reply; caps 200
  calls per organization and 40 per person per organization per UTC day,
  failed calls not counted, 429 naming the cap reached with both counts;
  model and reasoning effort recorded per call. Owner order:
  1. apply `20260926120000_d5_dai_llm_user_cap.sql` (new 6-argument
     `dai_llm_reserve_call` overload, the 5-argument one kept; nullable
     `dai_llm_calls.reasoning_effort`);
  2. then `supabase functions deploy ai-eval-assist`;
  3. then upload a Suite build from main carrying the studio and help-guide
     copy (the UI reads the caps from the function's reply, so steps 1 and 2
     alone already enforce the new caps).

## D0: honesty cleanup (2026-09-23)

Removes what claimed machine learning or AI without any behind it, so the
Data & AI apps start from a clean floor.

- **Analog Finder retired.** Its results were templated fields plus
  `Math.random()` behind an "AI-powered" label, and its route was still
  served without a guard after the G0 tile archive. Page, components and
  the three utils are deleted; `apps/geoscience/analog-finder` now
  redirects to `/dashboard/geoscience`. The one shared piece, the Leaflet
  `InteractiveMap`, moved to `src/components/wellspacing/` since Well
  Spacing uses it.
- **Mock and orphaned ML code deleted** (no importers anywhere):
  `src/services/ml/` (`mlService.js` predicted with `Math.random()`,
  `optimizationService.js` was a mock genetic algorithm),
  `src/utils/anomalyDetectionCalculations.js` (its `'ml'` method was a
  simulated Isolation Forest), `src/utils/wellCorrelationAI.js`,
  `src/config/llm-config.json` and the unused `tools/generate-llms.cjs`
  that wrote it, `src/config/earthmodel-phase4-config.js`, the
  `deploy:phase4` / `verify:phase4` scripts (they checked for EarthModel
  ML components deleted long ago), the unrouted `src/components/coreannotator/`
  and `src/pages/dashboard/RiskAnalysis.jsx` (both advertised AI
  features that do not exist), and the unused `@tensorflow/tfjs` entry in
  the stale nested `src/package.json`.
- **False copy corrected:** Contour Map Digitizer meta description (it is
  a real digitizer writing to the surface registry, with no AI in it);
  the Geoscience Hub "AI-powered facies classification" card now points
  to Petrophysics Studio, where the facies are rule-based cutoffs; the
  four AI items on the public Resources page are removed.
- **Kept on purpose:** `src/utils/logFaciesCalculations.js` (real but
  untested k-means, hierarchical and SOM code, the salvage source for the
  D3 engine) and `src/utils/bayesianUpdater.js` (correct, just unused).

Open for the owner: the rest of the Resources page is also invented (case
studies quoting 15%, 30% and $200M results, webinars and brochures that
do not exist). D0 only removed the AI items; the page as a whole is a
marketing decision. The legacy EarthModel Pro help-centre tree
(`src/data/helpCenter/`, `src/context/HelpCenterContext.jsx`) still
describes ML features but nothing renders it.

Verification: production build green; the wellspacing, digitizer and
contour suites pass (8 suites, 64 tests).

## DA0: the Data & AI module scaffold (2026-09-23)

Branch `feat/da0-data-ai-module`. The Suite's tenth module, scaffolded
exactly as Process Safety was at PS0 (Suite PR #533, on the DS0 recipe
41f86e031). Roadmap: `docs/scope/DataAI-ROADMAP.md`.

- **Collisions checked first.** Nothing in routes, modules, entitlements,
  pricing, master_apps migrations or the Supabase functions used `data-ai`,
  `dai_`, "Data & AI" or any of the four app slugs. `moduleSegment('Data &
  AI')` is `data-ai`, so the display name and the slug route to the same
  place. The only near miss is migration naming: an unrelated
  `20260826100000_d0_drilling_honest_catalog.sql` uses `_d0_`, so wave
  migrations are `_d1_` to `_d4_`.
- **Registration:** `allModules` (`data-ai`) and `allApps`
  (`data-quality-studio`, `ml-workbench`, `electrofacies-studio`,
  `forecasting-ml-workbench`) in SupabaseAuthContext; dashboard card and
  sidebar item (lucide `ScatterChart`, sky); `DataAiHub` at
  `/dashboard/data-ai` on the ApplicationsGrid pattern, filter = display
  name `Data & AI`; adminHelpers mapping (exact names only, since "data"
  and "ai" occur inside other names) and module list; SuperAdminConsole
  fallback; `MODULE_LABELS`. AI Evaluation Studio (D5) has no tile and no
  slug in this run.
- **Seed, HELD:** `20260923120000_da0_seed_data_ai_module.sql`, modules row
  plus four Coming Soon tiles (is_built and is_functional false), both
  `module` and `module_id` set, idempotent, %ROWTYPE copy of an Active
  Geoscience row (tiles inherit its a la carte `master_apps.price`, as the
  PS0 tiles inherited Facilities'). Logged in MIGRATIONS.md as NOT APPLIED.
  **Owner step:** apply it with the prod upload that ships this build:
  `supabase db query --linked -f supabase/migrations/20260923120000_da0_seed_data_ai_module.sql`.
- **Held for D1:** module pricing (the owner sets the price) and the
  marketing module counts (nine to ten).
- **Test:** `src/__tests__/dataAiRegistration.test.js`. The PS0 test pinned
  every migration after its seed to `ps*`, which any later module breaks;
  it now pins only the range up to the last PS3 migration.

## D1: Data Quality Studio (2026-09-23)

Engine: `engines/dataai/quality.js`, petrolord-engines PR #248 (merge
cc82bf3), with its stdlib oracle, NIST goldens, library pins, negative
control and `tools/validation/dataai/FINDINGS-quality.md`. App: branch
`feat/d1-data-quality-studio`, on the PS1 LOPA & SIL Studio pattern
(Suite PR #536).

- **Vendoring.** The nine canonical paths of 49d1e92..cc82bf3 copied file by
  file; the import closure (lib/stats, petrophysics/conditioning,
  hse/safetyStats, lib/linalg/solveDense) was already current. Manifest
  regenerated from the canonical clone, VENDOR.json pinned at cc82bf3;
  `check-vendored-engines.mjs --canonical` reports 944 paths byte for byte,
  0 deviations. One-line shim `src/utils/dataAi/engine/quality.js`.
- **Data sources, all existing.** Well log curves from the wells registry
  (`src/lib/wellsRegistry.js`: listWells, listLogs, downloadCurve; the
  stored depth curve is the index, float32 samples, NaN is missing);
  one well's rows from the Production data spine
  (`src/lib/productionSpine.js` getDailyProduction; oil, water, gas,
  injection and hours_on by date); or a CSV/TSV/Excel file read in the
  browser by `src/lib/tabularFile.js`, with index, identifier, row filter
  and number columns mapped by the user. No new ingestion. The Ekene kit
  reaches the first two through the Well Data Manager and Production
  Surveillance imports and can be uploaded directly.
- **The app.** `src/pages/apps/DataQualityStudio.jsx`, context
  `src/contexts/DataQualityStudioContext.jsx`, panels under
  `src/components/dataai/quality/`, logic in `src/utils/dataAi/`
  (`qcDatasets.js` sources to one dataset shape, `qcProfile.js` the
  profile and its run, `qcRun.js` the saved payload, `qcRunsService.js`
  persistence, `qcReport.js` CSV and PDF, `qcSources.js` the loaders). A
  QC profile holds every parameter as typed text; a blank is the engine
  default. Defaults name their source on screen, and the Petrolord
  choices (Hampel half window 5, frozen run 5, phase sum 0.5 percent of
  the total, Mahalanobis alpha 0.025, EWMA lambda 0.2, CUSUM h 5) say
  they are choices. Only definitional range limits are suggested (none
  for neutron porosity, which can read below zero). EWMA and CUSUM need
  an in-control target and sigma: typed, or filled from a baseline
  stretch by the engine's individuals chart; never estimated from the
  series being watched. Runs are made on request and the screen marks
  results stale when a parameter changes.
- **Scorecard.** The engine's `scorecard()` on dimension counts the app
  makes over DISTINCT cells (a value two rules flag counts once).
  Coverage holes, Mahalanobis rows and control chart signals are listed
  and not scored; a dimension nothing checked is left out rather than
  scored as perfect; no grade bands. The rule set is printed on screen,
  in the help guide and in `SCORE_BASIS`.
- **Flags and report.** Every engine flag with its rule and reason
  verbatim; refused checks shown with the engine's own message. CSV report
  (meta, parameter, score, flag and refused records under one header) and
  a branded PDF (`src/lib/pdfBrand.js` + jspdf-autotable).
- **Charts.** White chartTheme + ChartLogo: the channel with its flagged
  points, individuals and moving range, EWMA with its limits, tabular
  CUSUM, Mahalanobis d squared with the chi-square cutoff.
- **Persistence.** `dai_qc_runs`, organization-scoped with RLS through
  is_org_member / has_org_role like ps_lopa_studies. A run stores its
  inputs (source reference, profile, and for an upload the checked columns
  up to 60,000 numbers) and a summary of what it found (scorecard, flag
  counts, an FNV-1a fingerprint of the values). On open the data is read
  again and rerun, and a changed fingerprint is reported.
- **Held migrations (NOT APPLIED, owner-run), in order:**
  1. `20260923130000_d1_dai_qc_runs.sql` (not deploy-gated);
  2. `20260923140000_d1_activate_data_quality_studio_tile.sql` (DEPLOY GATE:
     after the DA0 seed, the table, and the prod upload serving the route);
  3. `20260923150000_d1_data_ai_module_pricing.sql` (with the tile).
  All three were applied twice on a local scratch Postgres 16 with stubbed
  helpers, and RLS probes passed (own-org read, other-org insert refused,
  unknown source refused, organization move refused, author kept on an
  admin update, anon refused).
- **Pricing (owner-overridable).** 2,999: 3.3 x 899 (the Geoscience per-app
  price the DA0 tiles copy) = 2,967, rounded to the house ending; 3.34x,
  inside the 2.8x to 4.0x band, below the four planned apps a la carte
  (3,596). 2,499 would be 2.78x, outside the band. In pricingModels.js,
  the generate-quote fallback (needs a function deploy to take effect as
  the fallback) and the migration; `modulePricing.test.js` holds them
  together.
- **Marketing.** ModulesShowcase gains Data & AI with a count of 1 (Data
  Quality Studio); Home and Solutions count ten modules.
- **Tests.** `src/utils/dataAi/__tests__/qcProfile.ekene.test.js`: every
  profile result compared whole with a direct engine call on the Ekene-3
  LAS excerpt (through the Well Data Manager parser and importer) with
  planted defects, and on the Ekene daily production ledger (upload and
  spine paths agree); scorecard equal to the engine's on hand counts;
  refusals verbatim. `qcRunsService.test.js` (mocked supabase),
  `qcReport.test.js`, `src/pages/apps/__tests__/dataQualityStudio.smoke.test.jsx`
  (mounted page: empty states, an uploaded ledger scored as the engine
  scores it, stale marking, help guide sources, copy rule),
  `dataAiRegistration.test.js` (route, table, tile, pricing, log). An
  app-layer negative control planted six defects in `qcProfile.js`; four
  went red at once, and the two that stayed green (cumulative checked
  count, ignored weights) got gates that now go red.

Open: solveDense's absolute pivot test (engine FINDINGS open question 2).

- **D1 follow-ups (2026-09-23, branch `fix/d1-followups`).**
  - Entry numbering: the flag table, CSV and PDF show an Entry column counted
    from 0, the numbering the engine's reasons use ("entry 57"); with no index
    the At and Previous labels read `entry N` (were a 1-based `row N`). The CSV
    `sample` column (1-based) is now `entry`. Lead decision 2026-09-23: the
    whole studio uses one numbering, so the chart axes and no-index x labels
    (`entry N`), the chart window From/To and the baseline inputs are 0-based
    and inclusive too, a chart gap refusal names its channel entry, and CUSUM
    signals read "at entry N". A run saved on staging before this with a
    chart window reads one entry later on re-run (the studio never shipped to
    production). Gates: the smoke test checks every Entry cell
    against the engine index and against the number a missing-run or
    frozen-run reason quotes; `qcReport.test.js` pins the CSV column and a
    no-index cumulative case; `qcProfile.ekene.test.js` pins the chart window
    (From 20 is engine window index 0, chart flags = engine index + 20), the
    baseline (3 to 14 = twelve values) and the gap refusal's entry; a 1-based
    window or baseline plant turns it red.
  - `despikeHampel` null to 0: audited, NOT LIVE. Every caller passes typed
    arrays with NaN for missing (Petrophysics Studio curves are Float32Array
    from storage or LAS import) or goes through `quality.hampel`. Engine code
    unchanged; recorded in engines FINDINGS-quality.md (engines PR #250).
  - `src/lib/tabularFile.js` reads comma, semicolon and tab files by RFC 4180:
    quoted cells keep the delimiter, doubled quotes, CR/LF/CRLF, line breaks
    inside quotes; delimiter detection counts outside quotes. Whitespace mode
    is unchanged. Gated in `tabularFile.test.js` including agreement with
    papaparse and SheetJS; every importer's suites stay green. The upload
    panel and help guide caveat is removed.

- **Engine re-vendored at a4e9592 (engines #249, 2026-09-23).** Population-SD
  z ceiling sqrt(n - 1); reasons print the shortest round-trip decimal; Hampel
  echoes halfWindow and nSigma; new value/previous fields. Exports and the
  engine result keep the full-precision reason; on screen `displayReason`
  (`src/utils/dataAi/qcDisplay.js`, tested with engine-produced reasons and a
  two-plant negative control) rounds to at most 6 decimals, leaves integers
  alone and shows a figure in full when rounding would tie it with a different
  figure in the same reason. The flag table gains Value and Previous columns,
  the CSV value column carries each flag's value unrounded, the checks list
  gives the Hampel n sigma and window and the z ceiling for the data, and the
  Mahalanobis caption reads the engine's level.

## D2: ML Workbench (2026-09-24)

Engine: `engines/dataai/ml.js`, petrolord-engines PR #252 (merge 966bb9e),
with its stdlib oracle, NIST StRD anchors, library pins, negative control
(41/41) and `tools/validation/dataai/FINDINGS-ml.md`. App: branch
`feat/d2-ml-workbench`, on the D1 Data Quality Studio pattern (#612 to #615).

- **Vendoring.** The 22 canonical paths of c7eba22..966bb9e copied file by
  file (ml.js, its gate, goldens, pins, the eleven NIST `.dat` files, oracle,
  pin script, negative control, synthetic wells, timing script, FINDINGS,
  README). Import closure (`lib/stats/stats.js`, `lib/lp/simplex.js`)
  already current. Manifest regenerated, VENDOR.json pinned at 966bb9e;
  `check-vendored-engines.mjs --canonical` reports 965 paths byte for byte,
  0 deviations; vendored gate 614/614. Shim `src/utils/dataAi/engine/ml.js`.
- **The app.** `/dashboard/apps/data-ai/ml-workbench` (+ `/help`):
  `src/pages/apps/MlWorkbench.jsx`, `src/contexts/MlWorkbenchContext.jsx`,
  panels under `src/components/dataai/ml/` (DataPanel, SpecPanel,
  ResultsPanel, DiagnosticsPanel, WriteBackPanel, charts), logic in
  `src/utils/dataAi/` (`mlData.js` table and design, `mlWorkflows.js` every
  engine call, `mlJobs.js` worker protocol, `mlStudy.js` saved payload,
  `mlRunsService.js` persistence, `mlReport.js` CSV and PDF, `mlSources.js`
  registry reads and writes, `mlWriteBack.js` predicted-curve builder).
  - **Data:** several wells from the wells registry (curves joined sample by
    sample; a curve on another depth grid is refused by name), or an upload
    with a well column. Depth window and keep-every-nth thinning (entries
    counted from 0 in each well). Rows missing the target or a feature, or
    non-positive in a logged feature, are dropped and counted.
  - **(a) Missing-log prediction:** OLS or ridge, group k-fold (default k 5,
    seed 42) or group split; per-fold and pooled RMSE/MAE/R², coefficients
    with SEs and t (OLS), crossplot of held-out rows, depth track of a
    held-out well. Write-back: the model on every row predicts the target
    in a chosen registry well from that well's own features and saves a NEW
    curve through `wellsRegistry.saveLog`; mnemonic `<target>_ML` by default,
    the target's own name and any existing name are refused; provenance
    carries method, features and transforms, scaler and coefficients,
    training wells and rows, validation scheme, seed, pooled scores and the
    engine version and commit.
  - **(b) Classification:** logistic regression for a label from a cutoff on
    a curve (`>`, `>=`, `<`, `<=`) or a 0/1 column; confusion matrix,
    per-class precision/recall/F1 with macro and weighted means, ROC with
    AUC, log loss with clipped count, converged flag and updates per fold;
    the engine's separation refusal shown verbatim, L2 > 0 fits and reports it.
  - **(c) Leakage:** the engine's `leakageDemo`, random row against group
    split side by side with the shared wells and the optimism. The verdict
    sentence follows the engine's sign; the copy never says random splits
    always flatter. On the Ekene fixtures (8 wells, 1450 to 1650 m, DT from
    GR, RHOB, NPHI and log10 RT) the random split did flatter: test R² 0.937
    against 0.710 (optimism 0.226), where the engine FINDINGS plain log data
    went the other way.
  - **(d)** Permutation importance on the held-out wells of one group split
    (scaler and fit on its training wells) and the engine learning curve by
    training wells; when the smallest sizes cannot be fitted (one well can
    hold one class) the curve starts at the first size the engine fits and
    shows the engine's refusal for each size left out.
- **Performance.** Fits run in a module Web Worker (`mlWorkerFactory.js`,
  `workers/ml.worker.js`, the PT10d Petrophysics pattern; jest maps the
  factory to null and jobs run inline). Row caps: **150,000 rows per fit**
  (engine timings: one OLS fit at 200k x 8 about 1 s, logistic about 2 s,
  5 to 6 s separated; k folds multiply that) and **50,000 held-out rows for
  permutation importance** (AUC re-sorts every re-scoring: 10 s at 200k x 8,
  2.3 s at 50k). Above a cap the app refuses and names a thinning. Charts
  plot at most 4,000 points (every nth row from row 0, stated). Features are
  standardised by default, scaler fitted on each fold's training rows only
  (engine `fitStandardScaler` + `applyScaler`, population SD), which keeps
  the logistic stopping rule (coefficient units) meaningful.
- **Display and exports.** White chartTheme + ChartLogo; on-screen figures
  through `qcDisplay.displayNumber`; CSV keeps every number at full
  precision (meta, fold, pooled, coefficient, scaler, confusion, roc and
  one prediction row per held-out sample); branded PDF via `pdfBrand`.
- **Persistence.** `dai_ml_runs`, organization-scoped with RLS like
  dai_qc_runs, plus a `task` column. Payload = inputs (well ids and curves,
  or the upload's columns up to 200,000 values) and the spec as typed;
  summary = pooled and per-fold scores, rows, wells, an FNV-1a fingerprint
  of the fitted X, y and groups, engine version. On open the wells are read
  again; a changed fingerprint is reported.
- **Held migrations (NOT APPLIED, owner-run), in order:**
  1. `20260924120000_d2_dai_ml_runs.sql` (not deploy-gated);
  2. `20260924130000_d2_activate_ml_workbench_tile.sql` (DEPLOY GATE: after
     the DA0 seed, the table, and the prod upload serving the route).
  Both applied twice on a local scratch Postgres 16 with stubbed auth and
  org helpers; RLS probes passed (own-org read, other-org insert refused,
  unknown source and task refused, organization move refused, other org
  sees and deletes nothing, author kept on an admin update, a member cannot
  delete another author's run, admin delete, anon refused); the tile gives
  a notice before the row exists and leaves the other Data & AI tiles and a
  same-slug row in another module untouched.
- **Pricing.** No change: the `data-ai` module price (2,999, D1) already
  covers the module's apps; `modulePricing.test.js` already counts four
  planned apps.
- **Marketing.** ModulesShowcase: Data & AI count 2 (Data Quality Studio,
  ML Workbench); module count stays ten.
- **Tests.** `mlWorkflows.ekene.test.js` (28): every fold scaler, fit,
  metric, held-out prediction and pooled score compared whole with direct
  engine calls on nine Ekene wells (fixtures `fixtures/ml/Ekene-N-ml.las`,
  kit ekene-demo-kit-20260923-359d56694, every 4th sample of 1450 to
  1650 m, through the Well Data Manager parser and importer), for OLS,
  ridge, group split, logistic (with the separation refusal and the L2
  fit), leakage, importance, learning curve, final fit, write-back log and
  provenance, row cap and boundary rules. `mlJobs.test.js` (9, worker
  protocol with a fake module worker), `mlRunsService.test.js` (12, mocked
  supabase), `mlReport.test.js` (4), `mlWorkbench.smoke.test.jsx` (7:
  mounted page driven through a mocked registry of the Ekene wells, engine
  scores on screen, RHOB_ML written to Ekene-9, separation refusal, leakage
  verdict, help guide conventions and copy rule), `dataAiRegistration.test.js`
  (D2 block). App-layer negative control
  `tools/validation/dataai/negcontrol_ml_workbench.sh`: 13/13 plants red
  (scaler on all rows, unscaled test rows, 1-based held-out rows, inverted
  standardise, importance on training wells, dropped learning-curve
  refusals, flipped leakage verdict, 1-based thinning, ln for log10, strict
  cutoff made inclusive, write-back not depth aligned, missing features
  predicted, pooled over untested rows); two were green at first and got
  boundary gates.

Open for D2: the logistic stopping rule stays in coefficient units (engine
FINDINGS open question 3); the app standardises by default so it holds, and
turning standardisation off on features in tiny units can end with
converged false. `maxCondition` is not exposed (default 1e8).

## D3: Electrofacies Studio (2026-09-24)

Engine: `engines/dataai/cluster.js`, petrolord-engines PR #253 (merge
4dfbb29), with its stdlib oracle (126 goldens, iris anchors), scikit-learn /
scipy pins (158), negative control (40/40) and
`tools/validation/dataai/FINDINGS-cluster.md`. App: branch
`feat/d3-electrofacies-studio`, on the D2 ML Workbench pattern (#616).

- **Vendoring.** The 12 canonical paths of 966bb9e..4dfbb29 copied file by
  file (cluster.js, its gate, goldens, pins, iris.csv, oracle, pin script,
  negative control, synthetic wells, timing script, FINDINGS, README).
  Import closure (`lib/stats/stats.js`, `engines/dataai/ml.js`) unchanged
  in the range. Manifest regenerated, VENDOR.json pinned at 4dfbb29;
  `check-vendored-engines.mjs --canonical` reports 975 paths byte for byte,
  0 deviations; vendored gate 316/316. Shims `src/utils/dataAi/engine/cluster.js`
  and `engine/stats.js` (mulberry32 only). The ML Workbench's
  `ENGINE_COMMIT` moves to the same pin (ml.js is byte-identical).
- **The app.** `/dashboard/apps/data-ai/electrofacies-studio` (+ `/help`):
  `src/pages/apps/ElectrofaciesStudio.jsx`, `src/contexts/ElectrofaciesContext.jsx`,
  panels under `src/components/dataai/facies/` (DataPanel, SpecPanel,
  PcaPanel, ClusterPanel, SupervisedPanel, TracksPanel, WriteBackPanel,
  common, charts), logic in `src/utils/dataAi/` (`faciesData.js` table,
  core facies and design, `faciesSources.js` registry reads,
  `faciesWorkflows.js` every engine call, `faciesJobs.js` worker protocol,
  `faciesStudy.js` saved payload, `faciesRunsService.js` persistence,
  `faciesWriteBack.js` facies log builder, `faciesReport.js` CSV).
  - **Data:** registry wells (curves joined sample by sample, as D2) with each
    well's interval logs (`stratRegistry.listIntervals`), or an upload with a
    well column and an optional core facies column. **Core facies** from a
    facies code curve, registry interval logs of one kind (a sample takes the
    interval with top <= depth < base), or the uploaded column (numbers when
    every filled cell is one, else text). Rows without core are clustered and
    classified but not compared or learned from. Depth window, keep every
    nth (entries from 0), log10 per log. Scaling: the engine's standard
    scaler by default, min-max or none.
  - **PCA:** correlation (default) or covariance; scree with cumulative
    ratio, eigen table, loadings, score crossplot coloured by core facies or
    any labelling.
  - **k-means:** seeded k-means++ (seed 42, nInit 10 by default), centres in
    log units, silhouette (a seeded 10,000-row sample above 10,000 rows,
    stated). **Elbow:** k 1 to 10 by default on a seeded sample of 10,000
    rows above that (stated), one engine call per k for a progress count,
    joined as the engine joins them (test: equal to the single engine call
    whole). **Agglomerative:** Ward, complete or average; above 3,000 rows
    the engine refusal is shown verbatim, or a seeded 3,000-row sample if
    ticked (labels on the sampled rows only, stated); merge heights chart
    and tied steps.
  - **Matching:** one-to-one when the clusters on the cored rows are no more
    than the facies, majority otherwise; the screen states which ran and why,
    with the mapping, confusion matrix, per-class report and the adjusted
    Rand index.
  - **kNN and CART:** cored wells held out whole (engine group split, seed and
    count, or wells chosen); held-out confusion, report and ARI; the final
    model trains on every cored row and classifies every row. kNN classifies
    in batches inside the engine's 1e8 pair limit (test: joined batches equal
    one call); at most 10,000 training rows. CART reads logs unscaled; the
    engine's printed tree (final and held-out) and feature importances.
  - **Depth tracks:** per well, a log curve and one facies column per
    labelling (core, k-means, agglomerative, kNN, CART), colours fixed per
    labelling across wells, white chart surface with the ChartLogo.
  - **Write-back:** one method's labels on one loaded registry well as a NEW
    curve through `wellsRegistry.saveLog` (EFAC_KM, EFAC_AGG, EFAC_KNN,
    EFAC_CART; existing names refused). Codes: cluster numbers, numeric facies
    as themselves, text facies by sorted position; legend, method, parameters,
    seed, scaling, logs, core source, scores against the core, rows, wells and
    engine version and commit in the provenance. Uploads cannot be written
    (no registry well) and say so.
- **Lead decisions applied.** No SOM (not in the engine; a registration test
  keeps it out). Elbow on a seeded sample capped at 10,000 rows, stated, with
  progress. Every engine refusal shown verbatim (EngineError). On-screen
  figures through `qcDisplay.displayNumber`; the CSV keeps full engine
  values. Copy rule gated in the smoke test over the page, help guide and
  every panel.
- **Persistence.** `dai_facies_runs`, organization-scoped with RLS like
  dai_ml_runs (no task column). Payload = inputs and the spec as typed with
  every seed; summary = per method settings and scores against the core,
  PCA explained ratios, rows, wells, an FNV-1a fingerprint of X, wells and
  core facies, engine version. On open the wells are read again and a
  changed fingerprint is reported.
- **Held migrations (NOT APPLIED, owner-run), in order:**
  1. `20260924140000_d3_dai_facies_runs.sql` (not deploy-gated);
  2. `20260924150000_d3_activate_electrofacies_studio_tile.sql` (DEPLOY GATE:
     after the DA0 seed, the table, and the prod upload serving the route).
  Both applied twice on a local scratch Postgres 16 with stubbed auth and
  org helpers; RLS probes passed (own-org read, other-org insert refused,
  unknown source, blank name and non-object payload refused, organization
  move refused, other org sees and deletes nothing, a member cannot delete
  another author's run, author kept on an admin update, admin delete, anon
  refused); the tile gives a notice before the row exists and leaves the
  other Data & AI tiles and a same-slug row in another module untouched.
- **Pricing.** No change: the `data-ai` module price (2,999, D1) covers it,
  as D2.
- **Marketing.** ModulesShowcase: Data & AI count 3 (adds Electrofacies
  Studio); module count stays ten.
- **Tests.** `faciesWorkflows.test.js` (28): the design, interval placement
  and upload facies; the seeded sample equals the engine silhouette's rows;
  PCA, k-means, silhouette (full and sampled), matching (both modes and the
  boundary), elbow (joined table equals one engine call; sampled; range
  refusal verbatim), agglomerative (refusal verbatim, seeded sample, 3,000
  boundary), hold-out, kNN and CART (held-out and final) all compared whole
  with direct engine calls on the engine's synthetic facies logs.
  `faciesAppLayer.test.js` (17): worker protocol, `dai_facies_runs` service,
  payload and summary, write-back alignment, codes and provenance, CSV.
  `electrofaciesStudio.smoke.test.jsx` (8): mounted page on a mocked registry
  of three synthetic wells (two cored by interval logs), k-means numbers and
  matching mode on screen, depth tracks, EFAC_KM written to the uncored
  well, CART tree and held-out scores, a refusal verbatim, PCA eigenvalues,
  help guide conventions and the copy rule. `dataAiRegistration.test.js`
  (D3 block, 7). App-layer negative control
  `tools/validation/dataai/negcontrol_facies_studio.sh`: 14/14 plants red (seeded sample off by one, matching boundary, silhouette not sampled, elbow drop sign, elbow sample seed, agglomerative sample labels misplaced, hold-out swapped, last kNN batch dropped, final kNN unscaled, final CART on training wells only, interval base inclusive, 1-based thinning, write-back one sample deep, text facies coded from 1); baseline and restored runs green.

Open for D3: the Ekene demonstration kit has no core facies, so the tests use
the engine's synthetic facies wells; an Ekene core facies interval set would
let the course and the smoke test share data. kNN is capped at 10,000
training rows (about 17 s worst case at the 100,000-row design cap).

- **Engine re-vendored at ef4058f (engines #254, 2026-09-24).** Ten canonical
  paths of 4dfbb29..ef4058f, file by file (cluster.js, ml.js, the cluster
  gate, goldens, pins, oracle, pin script, negative control, FINDINGS,
  README); guard 975 paths byte for byte, 0 deviations. ml.js scalers take
  `rowNoun` (default 'training rows', so the ML Workbench's messages are
  unchanged); a constant log refused by pca, k-means, silhouette, elbow or
  agglomerative now reads "on the N rows passed", kNN keeps "training rows".
  pca keeps both warnings, Jacobi non-convergence first, joined by '; '; the
  PCA panel shows each on its own line (render test on the engine's
  `pca-warning-both` golden, red when the split is removed). Help guide: the
  repeated-eigenvalue rule in the engine's new words ("differ by at most
  1e-10 times the largest eigenvalue"), the non-convergence warning, and the
  validation figures (145 cases, 68 refusals, 169 pins, 52 planted defects).
  Both apps' ENGINE_COMMIT and ENGINE_VERSION move to ef4058f. The studio
  does not call cutTree, so its new id-reuse refusal needs no app change.

## D4: Production Forecasting ML Workbench (2026-09-24)

Engine: `engines/dataai/forecast.js`, petrolord-engines PR #255 (squash
merge ec89b6b, tree identical to the reviewed head 26c11fe), with its stdlib
oracle (130 goldens, 56 refusals, NIST/SEMATECH 6.4.3 anchors), statsmodels /
scipy / scikit-learn pins (216, 8 documented skips), negative control
(51/51) and `tools/validation/dataai/FINDINGS-forecast.md`. App: branch
`feat/d4-forecasting-ml-workbench`, on the D3 Electrofacies Studio and D2 ML
Workbench patterns (#617, #616).

- **Vendoring.** The 11 canonical paths of ef4058f..ec89b6b copied file by
  file (forecast.js, its gate, goldens, pins, oracle, pin script, negative
  control, synthetic wells, timing script, FINDINGS, README). Import closure
  (`lib/stats/stats.js`, `lib/conventions/percentile.js`,
  `engines/dca/arps.js`) already vendored and unchanged in the range.
  Manifest regenerated, VENDOR.json pinned at ec89b6b;
  `check-vendored-engines.mjs --canonical` reports 984 paths byte for byte,
  0 deviations; vendored gate 432/432. Shim
  `src/utils/dataAi/engine/forecast.js`. The ML Workbench's and the
  Electrofacies Studio's `ENGINE_COMMIT` move to the same pin (ml.js and
  cluster.js are byte-identical since ef4058f).
- **The app.** `/dashboard/apps/data-ai/forecasting-ml-workbench` (+ `/help`):
  `src/pages/apps/ForecastingMlWorkbench.jsx`, `src/contexts/ForecastingContext.jsx`,
  panels under `src/components/dataai/forecast/` (DataPanel, FitPanel,
  BacktestPanel, FieldPanel, common, charts), logic in `src/utils/dataAi/`
  (`forecastData.js` series table, `forecastSources.js` spine reads,
  `forecastWorkflows.js` every engine call, `forecastJobs.js` worker
  protocol, `forecastStudy.js` saved payload, `forecastRunsService.js`
  persistence, `forecastReport.js` CSV).
  - **Data:** an upload (CSV, TSV, TXT or Excel through `tabularFile.js`, RFC
    4180) with an optional well column, an optional period column (labels
    only) and a production column, rows in file order within each well; or
    the Production data spine (`productionSpine.getDailyProduction`, paged
    past 1,000 rows; producers only, injectors and observation wells left
    out), as calendar-month totals (sum of the rows stored in the month) or
    one step per stored row. Shut-in zeros stay 0. A missing value (a blank
    cell, a month with no stored row) refuses the table with the rows named
    unless the user reads missing values as 0 (shut in), counted in the
    notes. No new shared table: the spine is read through its own service.
  - **Fit and forecast:** simple exponential smoothing, Holt's linear trend
    and the damped trend via `fitSmoothing`; a blank parameter is estimated,
    a typed one held; the fit table shows parameters (held marked), SSE,
    MSE, the first scored step and the optimiser record (converged, SSE
    evaluations, parameters on a bound); engine warnings shown. The Arps
    decline via `arpsForecast` (engines/dca/arps.js inside the engine):
    model, qi and Di per step, b, values used and dropped.
  - **Intervals:** `forecastIntervals` with method, nSims (1,000), seed (42),
    horizon h and the negative-to-0 option; P90 (low, the 10th percentile),
    P50, P10 (high) per the percentile convention, with the engine's
    exceedance definition and the clipped count.
  - **Backtest:** `compareWithArps` with first origin (blank: the length less
    three horizons, at least 3), horizon, step, refit toggle, MASE lag m
    (default 1, stated) and rank metric (MASE default and headline). MAPE is
    shown as undefined with the engine's reason when an actual is 0; sMAPE
    stated on 0 to 200. Origin view: chart and table of each method's
    forecasts, actuals and errors from a chosen origin, with the parameters
    at that origin.
  - **Field comparison:** `compareWithArps` on every well with the same
    settings, in the Web Worker with a count of wells done; per method the
    wells ranked first and the mean ranking metric over the wells where it
    is defined (with the count), and each well's metrics.
  - **Charts:** white chartTheme + ChartLogo, one value axis each: history,
    one-step fitted values (solid) and forecasts (dashed) per method and the
    Arps decline, the P90 to P10 band with P50; the origin view; wells
    ranked first. Method colours fixed per method, checked with the dataviz
    palette validator (CVD adjacent Delta E 17.2, all checks pass).
- **Lead decisions applied.** MASE headline and default ranking with m
  exposed and stated; MAPE only with its null reason on a zero actual;
  sMAPE scale stated; P90 = low with the exceedance definition shown; field
  runs in a worker with progress (all jobs use the worker; single-well jobs
  are fast either way); no new Monte Carlo or Arps (a registration test
  keeps `Math.random`, `mulberry32(`, `fitArpsModel(` and
  `calculateArpsHyperbolic(` out of the app layer). Engine refusals shown
  verbatim; on-screen figures through `qcDisplay.displayNumber`; the CSV
  keeps full engine values. Copy rule gated in the smoke test over the page,
  help guide and every panel.
- **Persistence.** `dai_forecast_runs`, organization-scoped with RLS like
  dai_facies_runs, source 'upload' or 'spine'. Payload = inputs (the upload's
  series up to 200,000 values, or the field, well ids, phase, step and
  missing rule), the spec as typed with seed and paths, and the engine
  commit; summary = fitted parameters with the optimiser record, Arps fit,
  interval seed and paths, backtest ranking and metrics, field counts, an
  FNV-1a fingerprint of the series, engine version and commit. On open the
  series is read again; a changed fingerprint or engine commit is reported.
- **CSV export:** one row per record with full-precision values: meta (run,
  data, unit, step, engine and commit, the spec as JSON), data notes, engine
  warnings, parameters (held or estimated), optimiser record, fitted value
  and residual per step, forecasts, Arps fit, interval percentiles with the
  definition and the bootstrap basis, backtest metrics, undefined-metric
  reasons, every origin's forecasts and errors, field summary and per-well
  metrics, engine refusals.
- **Held migrations (NOT APPLIED, owner-run), in order:**
  1. `20260924160000_d4_dai_forecast_runs.sql` (not deploy-gated);
  2. `20260924170000_d4_tile_activation.sql` (DEPLOY GATE: after the DA0
     seed, the table, and the prod upload serving the route).
  Both applied twice on a local scratch Postgres 16 with stubbed auth and
  org helpers; RLS probes passed (own-org insert and read, other org reads
  0, other-org insert refused, 'wells' source, blank name and non-object
  payload refused, 'spine' accepted, organization move refused, a member
  cannot delete another author's run, other org deletes nothing, author kept
  on an admin update, admin delete, anon refused); the tile gives a notice
  before the row exists and leaves the other three Data & AI tiles and a
  same-slug row in another module untouched.
- **Pricing.** No change: the `data-ai` module price (2,999, D1) covers it.
- **Marketing.** ModulesShowcase: Data & AI count 4 (all four apps of this
  run); the "being built" sentence is dropped. Module count stays ten.
- **Tests.** `forecastWorkflows.test.js` (18): the Ekene CSV reaches the
  engine as the golden series; missing and unreadable values refused by row;
  spine month sums, missing months, stored rows; spec to engine arguments
  (NaN passed on for the engine to refuse); call-through equal to direct
  engine calls and to the oracle goldens damped-ekene1-fit, NIST 6.4.3.1 at
  alpha 0.1, an intervals case, cmp-ekene1 (MASE ranking) and
  cmp-ekene2-rmse-refit-false (refit off, m 1 and 12); held parameters reach
  the bootstrap; the default first origin; the field run equals per-well
  calls with progress; the summary rule; warnings; the pin.
  `forecastJobs.test.js` (9): worker protocol with a fake structured-clone
  worker, progress per well, errors, ids, cancel, the one-line worker shell.
  `forecastRunsService.test.js` (9): `dai_forecast_runs` service, payload
  with seed and engine pin, snapshot round trip and cap, fingerprint, CSV
  (full precision, MAPE reason on the shut-in, refusals and warnings as
  rows). `forecastingMlWorkbench.smoke.test.jsx` (10): the mounted page on
  the Ekene upload and a mocked spine; fit table, Arps line, refusal
  verbatim, held phi, interval cells in order (P90 low left of P10 high) and
  the definition, backtest ranking and MASE per row, the MAPE reason, the
  origin view, the field summary, the spine producers and calendar months;
  help guide conventions and the copy rule. `dataAiRegistration.test.js`
  (D4 block, 7). App-layer negative control
  `tools/validation/dataai/negcontrol_forecast_workbench.sh`: 17/17 plants
  red (blank read as 0, held parameters dropped from the fit and from the
  bootstrap, seed shifted, default first origin, m not passed, refit not
  passed, ranked-first from the bottom, field mean over every well, progress
  from 0, missing zero-filled silently, upload rows reversed, spine month
  last row, spine months skipped, injectors offered, P90/P10 columns
  swapped, CSV rounded); baseline and restored runs green.

**Re-vendor at 1dfdd60 (engines #256, 2026-09-25).** Message wording only (the
training window named once, singular forms, and the bootstrap basis now says
residuals are drawn as fitted without centring); no number changed. The
`ENGINE_COMMIT` of the ML Workbench, the Electrofacies Studio and the
Forecasting ML Workbench moves to 1dfdd60 with the VENDOR.json pin (the
`forecastWorkflows` pin test caught the first cut leaving them at ec89b6b).
The help guide (the intervals callout and the bootstrap section) and the
FitPanel note now say the residuals are not centred, so a biased fit shifts
the band: on a declining well a flat method's paths can fall below its own
point forecast.

Open for D4: the spine stores daily volumes and a monthly import holds one
row a month as imported; the app sums the stored rows per calendar month
and says so, and a per-day rate convention (volume over days on, or over
calendar days) would be an owner choice. (The held-parameter backtest that
was open here is done: see App follow-ups below.)

## App follow-ups (2026-09-25, branch `fix/data-ai-app-followups`)

Closed, each its own commit; no engine change, no migration.

- **Electrofacies Studio: training-range check on the write-back (done).**
  Before a facies log is written, `faciesWriteBack.trainingRangeCheck`
  takes, per input log, the min and max over the rows the method was fitted
  on (every design row for k-means; the seeded sample or every row for
  agglomerative; every cored row for kNN and CART, the final model) and
  counts the labelled rows of the written well below the min or above the
  max (a value equal to a bound is inside; log-scaled logs checked as the
  log10 values the method read). The panel shows the counts per log and a
  warning with the number of rows with any log outside; the write is not
  blocked. The counts are stored in the provenance as `training_range`
  (basis, training row count, rows checked, rows outside any log, per log
  min, max, below, above). Tests: app layer on a planted well (GR above on 5
  rows, RHOB below on 4, a value on each bound inside, 7 rows outside) for
  kNN and CART with the training range counted from the raw columns, k-means
  0 outside, provenance; smoke test on the mounted page (CART to the uncored
  well, per-log counts and the warning against a count from the raw
  registry curves, provenance saved).
- **Electrofacies Studio: PCA warning in the CSV (done).** When pca returns
  a warning (its warnings joined by '; '), the CSV writes it verbatim as one
  meta row (method pca, name warning); none when there is no warning. Test
  on the engine's `pca-warning-both` golden.
- **Forecasting ML Workbench: backtest with typed parameters held (done).**
  With a typed parameter in the fit spec, the Backtest tab shows "Hold the
  typed parameters in the backtest" (default off, the old behaviour).
  `compareWithArps` takes no parameters, so with the toggle on each method
  with typed parameters is backtested by the engine's `backtest()` with them
  held (same origins, horizon, step, refit and m); its row replaces that
  method's compareWithArps row and the rows are ranked again by the rule
  compareWithArps states (`rankRows`, gated to give back the engine's
  ranking on all 7 non-refused comparison goldens). Other methods and the
  Arps row stay compareWithArps's own. The result line names the held
  parameters; the saved run keeps `backtest.holdTyped` in the spec (older
  saves open with it off) and `heldTyped` in the summary; the CSV adds a
  "backtest parameters held" meta row. The field comparison keeps
  estimating every parameter (typed parameters belong to one well's fit);
  its stale stamp ignores the toggle. Tests: oracle golden `bt-damped-fixed`
  through runCompare (held damped row equals the oracle's metrics and
  forecasts, other rows equal compareWithArps), a partial hold with refit
  off and m 12, a refused held value in its row, off by default, nothing
  typed; saved run and CSV; smoke test on the mounted page (toggle hidden
  until a parameter is typed, off then on, table and ranking).
- **Negative controls.** `negcontrol_facies_studio.sh` +4 plants
  (training range over every row for kNN and CART, a bound counted
  outside, training range left out of the provenance, PCA warning left out
  of the CSV). `negcontrol_forecast_workbench.sh` +5 plants (held
  parameters dropped from the backtest, toggle ignored, toggle on by
  default, held rows not ranked again, held parameters left out of the
  CSV). Results: facies 18/18 plants red, forecast 22/22 red, baselines green.
- **Plan amended.** `NextGen-Remaining-Courses-PLAN.md` section 15: the D4
  roster no longer lists feature regression (not built; D2 and the ML
  Workbench cover regression on features), with a dated note.
- **Help guides.** Electrofacies Studio (write-back training range, PCA
  warning in the CSV) and Forecasting ML Workbench (the hold toggle, CSV).

## D5: AI Evaluation Studio (2026-09-25)

Engine: `engines/dataai/evaluate.js`, petrolord-engines PR #257 (squash
merge 1906182, tree identical to the reviewed head 45c97c9), with its stdlib
oracle (282 goldens, 107 refusals), scikit-learn / numpy pins (2,382, 20
documented skips), negative control (68/68 engine plants red, 6/6 oracle
plants caught) and `tools/validation/dataai/FINDINGS-evaluate.md`. Fixtures:
`test-data/dataai/ekene-docs/` (60 passages, 24 queries with graded
judgments and a second grader, two fixed systems, 30 extraction records,
200 calibration rows; synthetic). App: branch `feat/d5-ai-evaluation-studio`,
on the D4 Forecasting ML Workbench pattern (#619 to #621).

- **Vendoring.** The 17 canonical paths of 1dfdd60..45c97c9 copied file by
  file, all additions (evaluate.js, its gate, goldens, pins, oracle, pin
  script, fixture writer, negative control, timing script, FINDINGS, the six
  ekene-docs files, README). Import closure (`lib/stats/stats.js`,
  `lib/conventions/percentile.js`, `engines/dataai/ml.js` logLoss) already
  vendored and unchanged. Re-pinned to the squash merge 1906182 (identical
  tree). `check-vendored-engines.mjs --canonical` reports 1,000 paths byte
  for byte, 0 deviations; vendored gate 2,707/2,707. Shim
  `src/utils/dataAi/engine/evaluate.js`. The ML Workbench's, Electrofacies
  Studio's and Forecasting ML Workbench's `ENGINE_COMMIT` move to 1906182
  (their engines are unchanged in the range).
- **The app.** `/dashboard/apps/data-ai/ai-evaluation-studio` (+ `/help`):
  `src/pages/apps/AiEvaluationStudio.jsx`, `src/contexts/EvaluationContext.jsx`,
  panels under `src/components/dataai/evaluate/` (CorpusPanel,
  RetrievalPanel, MetricsPanel, ComparePanel, AnswersPanel, ExtractionPanel,
  AgreementCalibrationPanels, common, charts), logic in `src/utils/dataAi/`
  (`evalData.js` dataset and uploads, `evalWorkflows.js` every engine call,
  `evalJobs.js` worker protocol, `evalStudy.js` saved payload and stamps,
  `evalRunsService.js` persistence, `evalReport.js` CSV, `evalAssist.js` the
  helper client).
  - **Data:** the Ekene synthetic documents by default, read from the
    vendored fixture (the files the engine gate and the course read); or an
    upload: one JSON file in the fixture shapes, or CSV (RFC 4180 through
    `tabularFile.js`, first row names the columns) for passages (id, text,
    title), queries (id, text, reference), judgments (query, passage, grade,
    grade2) and calibration (probability, outcome). App caps 2,000 passages
    and 200 queries (FINDINGS' proposal); unjudged queries are listed and
    left out of the metrics.
  - **Retrieval:** BM25 or TF-IDF over every query at k, k1, b (blank is the
    engine default), stop list and sublinear toggles; one query explained
    term by term (idf, tf, contribution or query x passage weights) with its
    judged grades, the ties the engine reports and the tie at the cutoff.
  - **Retrieval metrics:** P@k, R@k, hit, MRR, MAP and nDCG from the current
    retrieval settings or a system's retrieved lists; the relevance
    threshold is a visible box (default grade 1, the engine and trec_eval
    default); gain linear or exponential; no-relevant rule exclude (listed
    with the engine reason) or zero. On the Ekene set the current settings
    (BM25, top 5) reproduce system A's lists and its oracle means exactly.
  - **Compare systems:** the per-query values of one metric over the
    included queries; each system's bootstrap mean and the paired (or
    unpaired) bootstrap of A minus B from one seed (default 20260925, 2,000
    replicates, 10,000 at most in the app); interval ends labelled as
    parameter percentiles; the share at or below 0 described as a share of
    replicates, not a p-value.
  - **Answers and groundedness:** `checkAnswers` with each system's
    retrieved lists, every claim with its reason, citation statuses, and
    SQuAD exact match and token F1 of the short answers against the
    references (A 20 of 24, B 13 of 24).
  - **Extraction:** four outcomes per cell, per field and overall, micro and
    macro accuracy (equal by construction, said on screen) and F1 on filled
    cells; every non-correct cell with its reason.
  - **Agreement:** unweighted, linear and quadratic kappa on the 183 judged
    pairs, labels 0 to 3 (every whole grade from the lowest to the highest
    seen), with the confusion counts.
  - **Calibration:** reliability table with the edge rule and the last bin
    closed, ECE, MCE, Brier with REL, RES, UNC, WBV, WBC and the closure, log
    loss from ml.js with the clipped count; reliability and bin-count charts
    on the white chartTheme with ChartLogo.
  - **Worker, saving, export:** every job in a Web Worker
    (`evalWorkerFactory.js`, jest-mapped to the inline fallback); runs saved
    per organization in `dai_eval_runs` with the spec, seed, engine commit, a
    dataset fingerprint and a summary; the Ekene set referenced, an upload
    kept up to 1.5 million characters; stale results flagged by input
    stamps; CSV at full precision with refusals, excluded queries, every
    claim's reason, interval labels and bin edges.
- **Optional language-model helper (owner decision: engine first, optional
  metered model, never graded).** On the Answers tab: one query and the
  passages the current retrieval settings return (at most 10) go to the new
  edge function `supabase/functions/ai-eval-assist` (report-autopilot
  pattern: auth, OPENAI_API_KEY, OPENAI_MODEL default gpt-4o-mini; system
  prompt: answer only from the supplied passages, cite passage ids, JSON
  reply). Metering is new in the Suite: the caller must be an active member
  of the organization (`is_org_member` through their JWT); every call is
  reserved and logged in `dai_llm_calls` through `dai_llm_reserve_call`
  (service role, per-organization advisory lock) before the model runs;
  DAILY_CAP 50 calls per organization per UTC day (a constant in
  `logic.ts`, equal to the studio's `ASSIST_DAILY_CAP`, stated in the help
  guide), 429 with the count at the cap; a provider failure is logged as
  'error' and does not count. The answer is checked by `checkGroundedness`
  against the passages given, shown under "Model output, not graded", and
  never saved or exported. 503 (no key, no service role key, or the metering
  migration missing) and a missing function show "not configured"; the
  studio works fully without it. **Deploy held for the owner**
  (`supabase functions deploy ai-eval-assist`, after 20260925200000).
- **Migrations (HELD, files only, logged NOT APPLIED, owner-run):**
  1. `20260925180000_d5_seed_ai_evaluation_studio_tile.sql`: the Coming Soon
     tile on the DA0 insert branch (module and module_id, ScanSearch icon).
  2. `20260925190000_d5_dai_eval_runs.sql`: the dai_forecast_runs shape,
     source 'ekene' or 'upload'.
  3. `20260925200000_d5_dai_llm_calls.sql`: the metering log and
     `dai_llm_reserve_call`.
  4. `20260925210000_d5_activate_ai_evaluation_studio_tile.sql` (DEPLOY
     GATE: after 1 and 2 and the prod upload serving the route).
  All applied twice on a local scratch Postgres 16 with stubbed auth, roles
  and org helpers. Probes: seed and activation give notices before their
  prerequisites, the tile lands Coming Soon with module and module_id and
  a rerun after activation leaves it Active; activation leaves the D4 tile
  and a same-slug row in another module untouched; dai_eval_runs RLS as
  D4's (own-org insert and read, other org reads 0, other-org insert
  refused, 'spine' source, blank name and array payload refused, org move
  refused, member cannot delete another author's run, other org deletes
  nothing, author kept on an admin update, admin delete, anon refused);
  dai_llm_calls: reservations at cap 2 give 1, 2, then null; an 'error' row
  frees its slot; earlier days do not count; organizations counted apart;
  members read only their organization; member insert, update, delete and
  execute of the reserve function refused; anon refused.
- **Pricing.** No change: the `data-ai` module price (2,999) covers it. The
  pricing-rule test's Data & AI app count moves to 5.
- **Registration and marketing.** App.jsx routes, SupabaseAuthContext app
  list, ModulesShowcase count 5 with the app named, hub copy and module
  meta mention the evaluation of search and question-answering systems.
- **Tests.** `evalWorkflows.test.js` (57): the Ekene dataset whole and equal
  to the goldens' inputs; spec parsing; the workflows against the oracle
  goldens: six retrieve runs, twelve explained rankings, five
  evaluateRetrieval cases (and the retrieval settings reproducing system
  A), the bootstrap and paired bootstrap cases (paired, unpaired, MAP with
  another seed), answers A, B and B at 0.2 percent, 48 SQuAD matches,
  extraction A and B, three kappas, three calibration bin counts; the
  replicate cap and a missing seed; the helper context and check; uploads
  (RFC 4180, refusals by row and column, caps, the fixture JSON scored the
  same). `evalPersistence.test.js` (15): service, payload, snapshot and cap,
  stamps, CSV, worker protocol, helper client. `aiEvaluationStudio.smoke.test.jsx`
  (11): every tab on the mounted page against the goldens, the helper
  configured, 503 and 429, the help guide conventions and copy rule.
  `ai-eval-assist/__tests__/logic.test.ts` (14). `dataAiRegistration.test.js`
  D5 block (11). App-layer negative control
  `tools/validation/dataai/negcontrol_eval_studio.sh`: 30/30 plants red (blank read as 0, b dropped, stop list and sublinear not passed, threshold, gain and no-relevant rule dropped, citations as ranked lists, excluded queries kept, seed shifted, pairing ignored, B bootstrapped from A, replicate cap off by one, answers without retrieved lists, tolerance dropped, short answer and reference swapped, extraction always A, second grader replaced, bins not passed, more than ten helper passages, wrong CSV delimiter, passage cap off by one, unjudged queries scored, seed not in the stale stamp, CSV rounded, interval labels swapped, threshold box hidden, helper not labelled not graded, edge cap raised, membership check dropped); baseline and restored runs green.
- **Registration test repair.** PR #622 recorded DA0 to D4 as APPLIED
  2026-09-25 in MIGRATIONS.md, which turned the five "logged as not applied"
  assertions red on main; they now accept a held row or a dated apply
  record, and the D5 rows are asserted held.

Open for D5: the owner applies the four migrations (the activation only
after the upload serves the route) and deploys `ai-eval-assist` with
OPENAI_API_KEY set; the daily cap (50) and the model (gpt-4o-mini) are
owner choices. The claim grammar reads "the end of 2025" as the number
2025 (a known limit, taught in the course), and the calibration edge rule
differs from scikit-learn's calibration_curve at bin edges (stated in the
help guide).

## D5 engine wording re-vendor (2026-09-26, branch `chore/revendor-evaluate-f50251d`)

- **Vendoring.** The 7 canonical paths of 1906182..f50251d (engines PR #258)
  copied file by file: evaluate.js, its gate, goldens, oracle, negative
  control, FINDINGS-evaluate.md and README. Wording only, no number changed:
  the nDCG-undefined note states its exact condition (the query has no
  judged documents, or every judged grade is 0, singular for one judged
  document), and the Murphy basis anchors WBC to Stephenson, Coelho and
  Jolliffe (2008) eq. 7: the fifth term as the paper names it, so twice the
  pooled within-bin covariance. VENDOR.json pin and manifest moved to
  f50251d; `check-vendored-engines.mjs --canonical` reports 1,000 paths
  byte for byte, 0 deviations.
- **Engine pins.** `ENGINE_COMMIT` in the AI Evaluation Studio, ML
  Workbench, Electrofacies Studio and Forecasting ML Workbench moves to
  f50251d (only evaluate.js changed in the range).
- **App copy.** The calibration table labels WBC "twice the pooled
  within-bin covariance" and its caption cites eq. 7; the help guide says
  why WBC carries the factor 2 and states when nDCG is undefined; the
  metrics note says the Notes column names which case applies. The smoke
  test pins the WBC row label and value (red when the old label returns).
- **Gates.** D1 to D5 app suites and the five vendored dataai engine suites
  green (27 suites, 5,416 tests before the added assertion); app-layer
  negative control `negcontrol_eval_studio.sh` 30/30 plants red, baseline and restored runs green.

## Next

D1 `dataqc` NextGen course (slug `dataqc`, path_order 66) on the D1 engine and app; D2 `mlcore` course (path_order 67) on the D2 engine and the ML Workbench; D3 `facies` course (path_order 68) on the D3 engine and the Electrofacies Studio; D4 `forecastml` course (path_order 69) on the D4 engine and the Production Forecasting ML Workbench; D5 `appliedai` course (path_order 70, "Applied AI and Language Models") on the D5 engine and the AI Evaluation Studio, graded only on the deterministic half.
