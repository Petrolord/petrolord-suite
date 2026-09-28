# Fiscal Regime Designer: status

- Route: `/dashboard/apps/economics/fiscal-regime-designer`
- Engine: `src/utils/fiscalDesignerCalculations.js` (`runFiscalComparison`),
  names and definitions from `src/utils/fiscalConventions.js`
- Harness: `/dev/fiscal-regime-designer`
- Persistence: `fiscal_regime_projects` (project inputs and regimes)

## 2026-09-28: design system rollout, batch 2E (branch `feat/ds-w2e`)

The page opts in to the Petrolord design system. No engine, save, export or
behaviour change.

- `FiscalRegimeDesigner.jsx` wraps itself in `ThemedApp`
  (`data-testid="fiscal-theme-scope"`); the route is registered in
  `src/design/rollout/w2e.js`.
- The bespoke header is now `AppHeader` (back to Economics, Full precision,
  the help guide, theme toggle); Load, Save and Export Regime File sit in a
  wrapping row at the top of the body.
- The setup panel, regime editor (the regime picker is a `NativeSelect`; the
  add, duplicate and delete icon buttons gained accessible names), template,
  save and load dialogs, empty state and insights use theme roles.
- The regime summary is a `NumericTable`: regime names as sticky row labels,
  right-aligned mono figures, a negative NPV or government cash flow in
  danger text; government take stays first and larger than government share
  of net revenue, with the shared definitions on hover.
- The cash-flow, payout and sensitivity charts sit in white `ChartPanel`
  cards; series colours are unchanged.
- Test: `src/pages/apps/__tests__/FiscalRegimeDesigner.theme.test.jsx` (every
  results tab in light and dark, Full precision, the three dialogs, help).
