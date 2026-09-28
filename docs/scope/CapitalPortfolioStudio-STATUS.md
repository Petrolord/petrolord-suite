# Capital Portfolio Studio: status

- Route: `/dashboard/apps/economics/capital-portfolio-studio`
- Engine: `src/utils/portfolioOptimizer.js` (`optimizePortfolio`: exact
  risked-EMV knapsack, efficient frontier, seeded Monte Carlo risk summary)
- Harness: `/dev/capital-portfolio-studio` (in-memory Supabase, dev user)
- Persistence: `portfolios`, `portfolio_projects` (EPE Monte Carlo links via
  `epe_mc_runs`)

## 2026-09-28: design system rollout, batch 2E (branch `feat/ds-w2e`)

The page opts in to the Petrolord design system. No engine, save or
behaviour change.

- `CapitalPortfolioStudio.jsx` wraps itself in `ThemedApp`
  (`data-testid="portfolio-theme-scope"`); the route is registered in
  `src/design/rollout/w2e.js`. The dev harness drops its slate wrapper.
- The bespoke header is now `AppHeader` (back to Economics, Full precision,
  the help guide, theme toggle).
- The portfolio rail (selected portfolio on a primary outline), workbench,
  refusal alert (danger status), project and portfolio forms, delete
  confirmations (danger action) and the comparison dialog use theme roles.
- Money in the project inventory and the funded projects table is
  right-aligned mono, with a negative NPV or risked EMV in danger text beside
  its minus sign. The KPI values in the optimal portfolio card are plain mono
  text; the loss-probability colour bands (colour with no word) were removed.
- The efficient frontier and the comparison chart sit in white `ChartPanel`
  cards; chart colours are unchanged.
- Test: `src/pages/apps/__tests__/CapitalPortfolioStudio.theme.test.jsx`
  (workbench and results in light and dark, the dialogs, comparison, help).
