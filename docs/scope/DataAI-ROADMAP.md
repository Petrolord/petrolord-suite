# Data & AI module roadmap

The Suite's tenth module. It hosts the applications behind the NextGen
Data & AI courses (docs/scope/NextGen-Remaining-Courses-PLAN.md §15, owner
decisions 2026-09-23). The first run built D1 to D4; D5 (AI Evaluation
Studio, course `appliedai`) followed on the owner's 2026-09-25 instruction
and seeds its own tile (DA0 did not).

| Identifier | Value |
|---|---|
| Display name (`master_apps.module`, hub filter) | `Data & AI` |
| Slug (`modules.slug`, routes, entitlements) | `data-ai` |
| Hub route | `/dashboard/data-ai` |
| App routes | `/dashboard/apps/data-ai/<app-slug>` (`appRoutePath` slugifies `Data & AI` to `data-ai`) |
| Future app tables | `dai_*` |
| Wave migrations | `<timestamp>_d<N>_*`, N = 1 to 5 (sorted after the DA0 seed) |
| Academy module value (NextGen) | `data_ai` |

`normalizeModuleName` matches this module on its exact names only
(`Data & AI`, `Data and AI`, `data-ai`), because "data" and "ai" occur
inside many other names.

## Phases

### DA0: scaffold (this phase)

Registration in every place PS0 (Suite PR #533, on the DS0 recipe
41f86e031) registered Process Safety: `allModules` and the four app slugs
in SupabaseAuthContext, the dashboard card, the sidebar item, `DataAiHub`
on the ApplicationsGrid pattern (filtering on the display name), the lazy
hub route in App.jsx, the adminHelpers name mapping and module list, the
SuperAdminConsole fallback, and `MODULE_LABELS` in appLinks.js. The catalog
seed `20260923120000_da0_seed_data_ai_module.sql` writes the `modules` row
and four tiles at Coming Soon, setting both `module` and `module_id`.
Test: `src/__tests__/dataAiRegistration.test.js`.

Held, as at PS0: pricing and marketing copy (see D1).

Every engine below lives in petrolord-engines under `engines/dataai/`, is
built validation-first (goldens from published reference results, a
stdlib-only Python oracle written from the published equations, a
negative control, a FINDINGS record; for the learning methods also a
pinned scikit-learn or statsmodels reference as a second witness), and is
vendored into the Suite file by file. Seeded randomness only through the
canonical `mulberry32` in `lib/stats`; no Monte Carlo or NPV of its own.

### D1: Data Quality Studio (`data-quality-studio`), course `dataqc`

Engine `engines/dataai/quality.js`. Completeness (null fraction, gap runs,
coverage), validity (range rules with stated default limits, units,
monotonic and regular index, duplicates, negative rates, rate while shut
in), consistency (non-decreasing cumulatives, water cut in [0, 1], phase
sums, frozen values), uniqueness (exact and near-duplicate identifiers by
Levenshtein after stated normalisation), outliers (z-score, modified z by
MAD at Iglewicz-Hoaglin 0.6745 and 3.5, Tukey IQR fences with the quantile
definition stated, Hampel, Mahalanobis with a chi-square cutoff), and
Shewhart individuals, EWMA and tabular CUSUM charts (NIST/SEMATECH
e-Handbook examples as goldens). A dimension scorecard with stated weights;
every flag carries its reason.

**Pricing lands here.** With the first working app the module joins
`pricing_config.module_pricing` (a migration), `MODULE_PRICING` and
`MODULE_META` in `src/data/pricingModels.js`, and the generate-quote
fallback, which must match the shared table exactly
(`modulePricing.test.js`). The price is the owner's to set (plan §15
decision 2); D1 proposes 2,999 by the PS1 method (3.3x the 899 Geoscience
per-app price the tiles copy, rounded to the house ending; 3.34x, inside
the tested band and below the four apps a la carte), in migration
20260923150000, owner-overridable without a deploy. The marketing surfaces (ModulesShowcase, Home and Solutions
module counts) move from nine to ten modules at the same time, counting
built apps only.

### D2: ML Workbench (`ml-workbench`), course `mlcore`

Engine `engines/dataai/ml.js`. Standardisation and min-max scaling fitted
on the training set only; group-aware split and k-fold that hold out whole
wells, deterministic; ordinary least squares (NIST StRD Longley and Norris
certified values as goldens), ridge (closed form), logistic regression by
IRLS with a stated convergence rule; RMSE, MAE, R squared, confusion
matrix, precision, recall and F1 (macro and weighted), ROC AUC with ties,
log-loss; seeded permutation importance and learning curves. Leakage shown
side by side (random-row split against well split on the same data).

### D3: Electrofacies Studio (`electrofacies-studio`), course `facies`

Engine `engines/dataai/cluster.js`. PCA (symmetric eigensolver, fixed sign
convention, explained variance), seeded k-means++ and Lloyd, inertia,
elbow, silhouette, agglomerative clustering (Ward, complete, average;
deterministic ties), kNN with a stated tie rule, and a CART classification
tree (Gini, stated split tie-break, depth and minimum leaf), with a
confusion matrix against core facies. Reads the wells registry. Salvage
source `src/utils/logFaciesCalculations.js` is rebuilt, never vendored.
Reuses D2's validation and metrics.

### D4: Production Forecasting ML Workbench (`forecasting-ml-workbench`), course `forecastml`

Engine `engines/dataai/forecast.js`. Simple exponential smoothing, Holt
linear and damped trend (Gardner-McKenzie), parameters fitted by SSE with a
deterministic optimiser; rolling-origin backtests; MAPE, sMAPE and MASE
with the scaling stated; residual bootstrap intervals drawn through
`lib/stats`; the Arps baseline imported from `engines/dca`, never
re-implemented. statsmodels as the second witness.

### D5: AI Evaluation Studio (`ai-evaluation-studio`), course `appliedai`

Engine `engines/dataai/evaluate.js` (engines #257). Deterministic
evaluation of search and question-answering systems: the stated tokeniser,
BM25 (Lucene idf) and TF-IDF (scikit-learn defaults) with a 12-digit tie
rule; precision, recall, hit, reciprocal rank, average precision and nDCG
at k with the relevance threshold and the no-relevant-query rule stated;
SQuAD answer match; extraction outcomes; claim-level groundedness; Cohen's
kappa; calibration with the exact Murphy decomposition; seeded bootstrap
and paired bootstrap through `lib/stats`. Fixtures: the synthetic Ekene
documents (`test-data/dataai/ekene-docs/`), read by the engine gate, the
Suite app and the course. No language model runs in the engine or is
graded; the app adds an optional metered helper (edge function
`ai-eval-assist`, metering table `dai_llm_calls`, 50 calls per organization
per UTC day) whose answers are scored by the same deterministic checks.

## Order

D1, D2, D3, D4, then D5, each end to end (engine, Suite app, NextGen course) before
the next starts. D3 and D4 reuse D2's validation split and metrics.

## Tile activation rule

A tile goes Active (status 'Active', is_built true, is_functional true)
only in the migration that ships its app's build, and that migration is
applied only after the production upload carrying the app's route is live
and the route has been served on the deployed site (the F12 rule, as for
the PS1 to PS3 tiles). The same holds for the DA0 seed itself: it is
deploy-gated on the upload that ships the hub route, or the dashboard card
links into a 404. The NextGen go-live for each course is held until the
app's route serves.

## Status

| Phase | Status | Landed |
|---|---|---|
| DA0 | **BUILT 2026-09-23** (branch feat/da0-data-ai-module) | Module registered end to end; seed written, NOT APPLIED (owner-run, deploy-gated); pricing and marketing held for D1 |
| D1 | **ENGINE MERGED** (engines #248, cc82bf3); **APP BUILT 2026-09-23** (branch feat/d1-data-quality-studio) | Engine vendored; Data Quality Studio at `/dashboard/apps/data-ai/data-quality-studio` + `/help`; `dai_qc_runs`, tile activation and pricing (2,999) written as HELD migrations 20260923130000 to 20260923150000, NOT APPLIED; marketing counts ten modules. NextGen course `dataqc` next |
| D2 | **ENGINE MERGED** (engines #252, 966bb9e); **APP BUILT 2026-09-24** (branch feat/d2-ml-workbench) | Engine vendored; ML Workbench at `/dashboard/apps/data-ai/ml-workbench` + `/help` (OLS, ridge, logistic; group split and k-fold; leakage, importance, learning curve; curve write-back with provenance; fits in a Web Worker, caps 150,000 rows per fit and 50,000 held-out rows for importance); `dai_ml_runs` and the tile activation written as HELD migrations 20260924120000 and 20260924130000, NOT APPLIED; no pricing change; showcase counts two Data & AI apps. NextGen course `mlcore` next |
| D3 | **ENGINE MERGED** (engines #253, 4dfbb29); **APP BUILT 2026-09-24** (branch feat/d3-electrofacies-studio) | Engine vendored; Electrofacies Studio at `/dashboard/apps/data-ai/electrofacies-studio` + `/help` (PCA; k-means, elbow on a seeded 10,000-row sample, silhouette; agglomerative with the 3,000-row refusal or a seeded sample; kNN and CART held out by whole cored wells; matching to core with the mode stated and ARI; depth tracks; facies log write-back with provenance; jobs in a Web Worker); `dai_facies_runs` and the tile activation written as HELD migrations 20260924140000 and 20260924150000, NOT APPLIED; no pricing change; showcase counts three Data & AI apps. NextGen course `facies` next |
| D4 | **ENGINE MERGED** (engines #255, ec89b6b); **APP BUILT 2026-09-24** (branch feat/d4-forecasting-ml-workbench) | Engine vendored; Production Forecasting ML Workbench at `/dashboard/apps/data-ai/forecasting-ml-workbench` + `/help` (upload or Production data spine; simple exponential smoothing, Holt, damped trend fitted or held with the optimiser record; Arps decline baseline; seeded residual bootstrap P90/P50/P10; rolling-origin backtest ranked by MASE with m stated; field-wide comparison in a Web Worker with progress; runs saved with spec, seed and engine commit; full-precision CSV); `dai_forecast_runs` and the tile activation written as HELD migrations 20260924160000 and 20260924170000, NOT APPLIED; no pricing change; showcase counts four Data & AI apps. NextGen course `forecastml` next |
| D5 | **ENGINE MERGED** (engines #257, 1906182; wording fix engines #258, f50251d, re-vendored 2026-09-26); **APP BUILT 2026-09-25** (branch feat/d5-ai-evaluation-studio) | Engine and the Ekene documents fixture vendored; AI Evaluation Studio at `/dashboard/apps/data-ai/ai-evaluation-studio` + `/help` (corpus and queries, BM25 and TF-IDF retrieval with term contributions and ties, retrieval metrics with the threshold visible, seeded paired bootstrap A minus B, claim-level groundedness, extraction scoring, three kappas, calibration with the reliability chart; jobs in a Web Worker; runs saved with spec, seed and engine commit; full-precision CSV); optional metered language-model helper through the held edge function `ai-eval-assist`; tile seed, `dai_eval_runs`, `dai_llm_calls` and the tile activation written as HELD migrations 20260925180000 to 20260925210000, NOT APPLIED; edge deploy held; no pricing change; showcase counts five Data & AI apps. NextGen course `appliedai` next |
