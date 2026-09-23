# Data & AI module roadmap

The Suite's tenth module. It hosts the applications behind the NextGen
Data & AI courses (docs/scope/NextGen-Remaining-Courses-PLAN.md §15, owner
decisions 2026-09-23). This run builds D1 to D4; D5 (AI Evaluation Studio,
course `appliedai`) is scheduled after it and has no tile yet.

| Identifier | Value |
|---|---|
| Display name (`master_apps.module`, hub filter) | `Data & AI` |
| Slug (`modules.slug`, routes, entitlements) | `data-ai` |
| Hub route | `/dashboard/data-ai` |
| App routes | `/dashboard/apps/data-ai/<app-slug>` (`appRoutePath` slugifies `Data & AI` to `data-ai`) |
| Future app tables | `dai_*` |
| Wave migrations | `<timestamp>_d<N>_*`, N = 1 to 4 (sorted after the DA0 seed) |
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
decision 2). The marketing surfaces (ModulesShowcase, Home and Solutions
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

## Order

D1, D2, D3, D4, each end to end (engine, Suite app, NextGen course) before
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
| D1 | not started | |
| D2 | not started | |
| D3 | not started | |
| D4 | not started | |
