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

## 2026-09-28: design system rollout, batch 2A (branch `feat/ds-w2a`)

The hub and its help guide opt in to the Petrolord design system. No engine,
save or export change.

- `ForecastScenarioHub.jsx` and `ForecastScenarioHubHelpGuide.jsx` wrap
  themselves in `ThemedApp`; the route prefix (help included) is registered
  in `src/design/rollout/w2a.js`.
- The bespoke header is now `AppHeader` (back, title, subtitle, help link,
  theme toggle). Case cards, economics, the comparison table (mono numbers)
  and the load dialog use theme roles; the rate chart sits in a white
  `ChartPanel`. Case colours are unchanged.
- Test: `src/pages/apps/__tests__/ForecastScenarioHub.theme.test.jsx`.

## 2026-10-03: Reservoir round app 3 with Decline Curve Analysis (HUB-U1, branch `feat/dca-u1`)

Doc: `docs/upgrade/DeclineCurveAnalysis-UPGRADE.md` (HUB-U1 findings).

- Decline labelled nominal at the case start, a year of 365.25 days (was
  365): saved sets show numbers about 0.1 percent different.
- A start date for the set and per case (was a fixed 2026-01-01 shown
  nowhere); the comparison table prints it.
- Typable fields (`DcaNumberField`); rates and volumes on the unit profile.
- Annual CSV with case, parameters, basis, units, start and source
  (`src/utils/forecastScenarioExport.js`).
- Intake from Decline Curve Analysis (`dca-forecast-1`,
  `src/utils/forecastScenarioIntake.js`): a case starting the day after the
  DCA cut-off that reproduces the DCA forecast day for day; source printed,
  "edited after the handoff", "source changed since" with Refresh; deep link
  `?dcaProject=&dcaWell=&dcaStream=`.
- Scenario sets under record sharing (own and shared, check-out, Save a
  copy) through `useSharedSavedProjects`; saving through
  `createSavedProjectsService`.
- Open: no report (U2-018); the hub to Petroleum Economics Studio import
  keeps no source (U2-013).

## 2026-10-03: Reservoir round app 3, Step 2 with Decline Curve Analysis (branch `feat/dca-u2`)

Doc: `docs/upgrade/DeclineCurveAnalysis-UPGRADE.md`.

- **Report on the kit** (U2-018, closes HUB-U1-009):
  `src/utils/forecastScenarioReport.js`, "Report (PDF)", field and analyst
  saved with the set; cases with their sources, edited-after-handoff marks,
  source state, three figures, limits. Golden `hub-three-cases`.
- **The import into Petroleum Economics Studio keeps its source** (U2-013,
  closes HUB-U1-010): contract `fsh-case-1`
  (`src/utils/forecastScenarioContract.js`), read by id, with the DCA
  forecast behind a received case; EPE prints it and says when it changed.
- **Typed decline basis** per case (U2-004): nominal, effective secant
  (with the case b) or effective tangent; the nominal it became is printed.
  Saved cases stay nominal.
- **Terminal decline Dmin** (U2-001) and **downtime** (U2-011) per case; a
  case from DCA brings both and reproduces the DCA forecast day for day.
- Still oil only before NAPE (owner default).
