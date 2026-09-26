# Risked Reserves Valuation: status

Updated 2026-09-26 (Senior Testing Wave 1, #4).

- **State:** rebuilt as the valuation layer over the ReservoirCalc Pro prospect inventory. Report: `docs/testing/RiskedReservesValuation-T1.md`.
- **Engine:** `packages/engines/engines/prospect/valuation.js` (engines #265, vendored at 3061acc), shim `src/utils/prospectValuation.js`.
- **App:** `src/pages/apps/riskedreserves/` (RrvWorkstation, ExpectationChart, rrvStore); harness `/dev/risked-reserves`.
- **Data:** reads `rcp_prospects` through the RCP prospects backend; economics per browser (localStorage `rrv.prospects.v1`). No schema change.
- **Open (after NAPE):** dependent prospects in the portfolio; value per barrel by field size from EPE.
