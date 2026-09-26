# Forecast Scenario Hub: status

- Route: `/dashboard/apps/reservoir/forecast-scenario-hub` (help at `/help`)
- Engine: shared Arps `generateForecast` (packages/engines dca/arps) through
  `src/utils/forecastScenarioCalculations.js`
- Harness: `/dev/forecast-scenario-hub` (in-memory Supabase)
- Persistence: `saved_scenario_hub_projects` (inputs only; results recomputed)
- Handoff: annual CSV per case; Petroleum Economics Studio imports saved sets

## 2026-09-26: senior test T1 (docs/testing/ForecastScenarioHub-T1.md)

- EUR is the cumulative to the economic limit, capped at a 50 year maximum
  life (`EUR_MAX_YEARS`); the horizon cumulative is a separate column and
  still drives the chart, the annual CSV, the NPV and the EPE import.
- Chart on a years axis keyed by case id; save by name updates; delete
  confirms.
- Open: modified hyperbolic (terminal decline) for the engines repo.
