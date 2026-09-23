# Data & AI: status

Plan of record: `docs/scope/NextGen-Remaining-Courses-PLAN.md` section 15
(owner decisions 2026-09-23).

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

Open: the engine's FINDINGS open questions stand (despikeHampel turns null
into 0 for other callers; solveDense's absolute pivot test). The shared
tabular reader does not unquote CSV cells, so a quoted cell with a comma
splits; the upload panel and help guide say so.

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

## Next

D1 `dataqc` NextGen course (slug `dataqc`, path_order 66) on the D1 engine and this app; then D2 `mlcore`.
