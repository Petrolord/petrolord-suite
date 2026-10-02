# Risked Reserves Valuation: status

Updated 2026-09-26 (Senior Testing Wave 1, #4).

- **State:** rebuilt as the valuation layer over the ReservoirCalc Pro prospect inventory. Report: `docs/testing/RiskedReservesValuation-T1.md`.
- **Engine:** `packages/engines/engines/prospect/valuation.js` (engines #265, vendored at 3061acc), shim `src/utils/prospectValuation.js`.
- **App:** `src/pages/apps/riskedreserves/` (RrvWorkstation, ExpectationChart, rrvStore); harness `/dev/risked-reserves`.
- **Data:** reads `rcp_prospects` through the RCP prospects backend; economics per browser (localStorage `rrv.prospects.v1`). No schema change.
- **Open (after NAPE):** dependent prospects in the portfolio; value per barrel by field size from EPE.

## Design system rollout, batch 3E (2026-09-28)

The workstation and its help guide open on the Petrolord design system:
light grey panel by default, dark as a per-user choice from the toolbar
toggle (beside Help).

- Scope: `ThemedApp` inside `riskedreserves/components/RrvWorkstation.jsx`
  (the route page and the `/dev/risked-reserves` harness share it) and
  `RiskedReservesHelpGuide.jsx`; App.jsx unchanged. Cold-load prefix
  `/dashboard/apps/reservoir/risked-reserves-valuation` in
  `src/design/rollout/w3e.js` (covers `/help`).
- Own classes moved to `pl-*` roles; EMV signs and the input problems use
  the status roles; numeric inputs, Pc, EMV and the readout values read
  in the mono face. The expectation curve stays white
  (`data-canvas="chart"`).
- Phone width: the prospect table keeps a 960 px minimum and scrolls
  sideways inside its card (the inputs were squeezed to one digit).
- Test: `riskedreserves/__tests__/RiskedReservesValuation.theme.test.jsx`
  (the shared four checks, an imported prospect with its chart and
  readout in light and dark, the help guide). No calculation change.

## 2026-10-02: Reservoir Step 0e honesty sweep (H8)

Doc: `docs/upgrade/Reservoir-Step0e-HonestySweep.md` (branch `fix/reservoir-honesty-sweep`).

The readout and the `$/bbl` tooltip said the value per barrel comes from
the Petroleum Economics Studio. No handoff from that app exists. The
readout now names the true source for the selected prospect (the starting
default of 8 $/bbl, a value sent with a prospect valued in ReservoirCalc
Pro, or a value typed here), through `unitValueSource` in `rrvStore.js`.
