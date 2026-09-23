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

## Next

D1 `dataqc` engine: `engines/dataai/quality.js` with a stdlib Python
oracle, golden and negative control in petrolord-engines.
