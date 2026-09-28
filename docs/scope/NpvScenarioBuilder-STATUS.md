# NPV Scenario Builder: status

- Route: `/dashboard/apps/economics/npv-scenario-builder`
- Engine: `src/utils/npvCalculations.js` (deterministic cash flow, low, base
  and high scenarios, tornado and spider sweeps, seeded Monte Carlo)
- Harness: `/dev/studio/npv` (in-memory Supabase)
- Persistence: `saved_npv_projects` (mode and both input sets; results
  recomputed)

## 2026-09-28: design system rollout, batch 2E (branch `feat/ds-w2e`)

The page opts in to the Petrolord design system. No engine, save, export or
behaviour change.

- `NpvScenarioBuilder.jsx` wraps itself in `ThemedApp`
  (`data-testid="npv-theme-scope"`); the route is registered in
  `src/design/rollout/w2e.js`.
- The bespoke header is now `AppHeader` (back to Economics, Full precision,
  saved scenario, save, Help & Training, theme toggle). On phones the page
  scrolls as one column; the fixed-height split with inner scrolling applies
  from the `lg` breakpoint.
- KPI cards, inputs (Quick and Expert), Monte Carlo settings, risk case cards
  and the help centre dialog use theme roles. Colour is kept for status: a
  negative NPV or EMV reads in danger text beside its minus sign; the IRR,
  payback and exposure colours with no word were removed.
- The annual cash-flow ledger, the scenario matrix and the Full precision
  sensitivity sweep use `NumericTable` (sticky row labels, right-aligned mono
  figures, costs in danger text with their minus sign, cumulative NCF in
  success or danger). The scenario deltas keep success and danger because
  they carry a sign.
- Every chart card is a white `ChartPanel`; chart colours are unchanged.
- Test: `src/pages/apps/__tests__/NpvScenarioBuilder.theme.test.jsx` (every
  results tab in light and dark, Full precision, Expert mode, help centre).
