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

## 2026-10-03: intake of a Risked Reserves valuation (RRV U2-009)

A saved Risked Reserves valuation becomes a candidate project, sent by link
(`?rrvValuation=<id>` opens Add Project filled) or picked in the form ("Take
a Risked Reserves valuation", own and shared). Mapping in
`src/components/capitalportfoliostudio/rrvIntake.js`, owner decisions
2026-10-03:

- `npv_p50` holds the SUCCESS-CASE MEAN value after the well, labelled as a
  mean everywhere: the form ("Success-case mean value ($MM)", "neither a median
  nor a P50"), the inventory cell ("success-case mean"), a footnote under
  the inventory, the funded table tag and a note under the Success-case NPV
  card.
- `capex` and `fail_cost` are the well cost; the development cost is shown
  as information only. `pos` is Pg (one decimal kept).
- `risk_score` is blank, shown as "not provided by Risked Reserves
  Valuation" with Pg and Pc beside it. P90, P10 and the spread are blank
  ("not provided"); the risk summary treats the success case at its mean.
- Provenance (valuation, values, economics source with any Petroleum
  Economics Studio run, volumes source, dates, builds, fingerprint) shows in
  the form; the received contract is kept as JSON in `source_label`.
- Each Risked Reserves project's valuation is read again by id on load:
  "Source changed since: ..." with Refresh (typed values kept), "gone or no
  longer shared", or "can no longer be valued". A slot typed over after
  intake is marked in the row and in the form with the received value.
- The optimizer is unchanged: it never read `risk_score`. Existing projects
  compute exactly as before (saved fixture against main fb9da7ccd,
  `__tests__/rrvIntake.test.js`; on the page, `rrvIntakePage.test.jsx`).
  A typed project still asks for its risk score.
- Harness: `/dev/capital-portfolio-studio` holds the two valuations the
  Risked Reserves harness saves. e2e `e2e/rrv-capital-portfolio.spec.js`.
- Owner check: if the live `portfolio_projects.risk_score`, `npv_p90` or
  `npv_p10` is NOT NULL, the intake save fails with the database message
  and says nothing was filled in.

