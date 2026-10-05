# Well Spacing Optimizer: status

App: `src/pages/apps/WellSpacingOptimizer.jsx` (Reservoir module). Engine
`src/utils/wellSpacingCalculations.js`; panels in
`src/components/wellspacing/`; help `src/pages/apps/WellSpacingHelpGuide.jsx`.
A capital and economics comparison of spacing cases at a stated recovery
factor, with no interference physics in the EUR, and drainage geometry,
timing and deliverability diagnostics beside each case (WS-U1). Projects
save to `saved_well_spacing_projects` once its migration is applied.
Senior test T1: `docs/testing/WellSpacingOptimizer-T1.md` (2026-09-27). Upgrade round: app 12 of the
Reservoir plan (`docs/scope/AppUpgrade-Reservoir-PLAN.md`).

## 2026-10-02: Reservoir Step 0e honesty sweep (H6, H7)

Doc: `docs/upgrade/Reservoir-Step0e-HonestySweep.md` (branch `fix/reservoir-honesty-sweep`).

- **H6:** the JSON export named an optimum the screen disclaims. The engine
  result and the JSON now name no case and carry the sentence the screen
  shows. A Bo that falls back to 1 (blank oil gravity, gas gravity or
  temperature) is called a fallback on the screen and in the JSON.
- **H7:** NPV comes from the canonical `calculateEconomics`. The convention
  is now mid-year (it was year-end with the well cost undiscounted), and it
  is stated above the table, on the NPV chart, in the CSV header, the JSON
  and the help. Example field, field NPV in $MM, before then after: 20
  acres 1,006.3 to 1,174.6; 40 acres 1,741.1 to 1,885.7; 80 acres 2,095.0
  to 2,226.8; 160 acres 2,278.8 to 2,404.9. The order of the cases is
  unchanged; volumes, capex and cost per barrel do not move.

## 2026-10-05: Reservoir round Step 1 (WS-U1) and Step 2 analysis

Doc: `docs/upgrade/WellSpacingOptimizer-UPGRADE.md` (branch `feat/wsp-u1`).

- 18 findings, 16 fixed, no S1. S2 fixed: "$M" headed values in US$
  million; no report; nothing saved; pressure and a flood pattern that
  entered no equation; the initial rate hidden while it grows with spacing;
  results stale after an edit; no intakes; oilfield only.
- New in `src/utils/wellspacing/`: drainage radius, distance between wells
  (square or staggered layout), interference and pseudosteady timing, the
  pseudosteady deliverable rate against the plan rate (diagnostics only);
  gates on Ahmed and McKinney (2005) Ex. 1.5, 1.18, 1.21 and Earlougher
  Table C.1, units pinned with negative controls.
- Economics: canonical `calculateEconomics`, unchanged numbers; printed by
  part, with incremental economics per added well.
- The report on the kit (7 pages on the chain case), Study and Report tabs,
  cases recomputed on every edit.
- Intakes by id: pvt-1, wta-1, mbal-1, dca-forecast-1, registry wells.
  Sender to the hub and EPE is Step 2 (U2-004).
- Units: Suite unit profile, oilfield or SI; record sharing with check-out;
  `.pld` family; migration `20261005010000_saved_well_spacing_projects.sql`
  NOT APPLIED (owner).
- Step 2: 15 items ranked, Batch A deliverability-limited profile, drilling
  schedule, `ws-case-1` sender, rf-1 intake, measurable interference.
