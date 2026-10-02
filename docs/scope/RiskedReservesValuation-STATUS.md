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

## 2026-10-02: comprehensive upgrade, Step 1 (Reservoir round, app 4)

Doc: `docs/upgrade/RiskedReservesValuation-UPGRADE.md` (branch `feat/rrv-u1`).
23 findings, 19 fixed, no S1, no S2 open.

- **Saved state.** One valuation per prospect and user in `rrv_valuations`
  (migration `20261002151500_rrv_valuations.sql`, NOT APPLIED, owner-run;
  the approved record-sharing shape plus one reader policy on the change
  log). Until it is applied the valuations stay in the browser with a
  visible note, and the first Save after it moves them across. Sharing for
  viewing, "Shared with me", `.pld` (geoscience family).
- **Report.** The Risked Prospect Valuation Report on the shared Report Kit
  (`services/rrvReportModel.js`, `rrvReportExport.js`), with a Report tab
  that shows the same rows: identification, inputs with unit and source, the
  handoff, the chance of success as the product of its factors, unrisked
  and risked volumes, the EMV in its parts, outcomes, limits and flags,
  three plots and one stated absence.
- **Handoff.** What ReservoirCalc Pro sent is kept with the valuation
  (record, time, unit, basis, convention, methods, the run behind the
  volumes), read again by id on load, edits marked, a change upstream
  announced with Refresh.
- **Doors.** Suite unit profile (MMboe or 10^6 m3 oe), blanks never read
  as zero, CSV with a provenance header.
- **Open (Step 2 backlog, in the upgrade doc):** value per barrel and MEFS
  from the Petroleum Economics Studio, EMV sensitivity, "Re-run prospect"
  into ReservoirCalc Pro, play and prospect chance, portfolio distribution.
- **Tests:** `riskedreserves/__tests__/rrvU1*.test.*`, `rrvMigration.test.js`,
  `src/lib/portability/__tests__/rrvValuationFamily.test.js`,
  `e2e/risked-reserves-upgrade.spec.js`; pentest and scratch runner in
  `tools/validation/rrv-valuations/`.
