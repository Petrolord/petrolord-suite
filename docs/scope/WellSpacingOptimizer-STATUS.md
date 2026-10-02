# Well Spacing Optimizer: status

App: `src/pages/apps/WellSpacingOptimizer.jsx` (Reservoir module). Engine
`src/utils/wellSpacingCalculations.js`; panels in
`src/components/wellspacing/`; help `src/pages/apps/WellSpacingHelpGuide.jsx`.
A capital and economics comparison of spacing cases at a stated recovery
factor, with no interference physics. Nothing is saved to the database.
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
