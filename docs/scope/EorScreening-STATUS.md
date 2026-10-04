# EOR Screening: status

Route `/dashboard/apps/reservoir/eor-screening` (+ `/help`), page
`src/pages/apps/EorScreeningTool.jsx`, engine
`src/utils/eorScreeningCalculations.js` (Taber, Martin & Seright 1997).
Background: docs/scope/Reservoir-ROADMAP.md (R4); senior test
docs/testing/EorScreening-T1.md.

## Design system rollout, batch 3E (2026-09-28)

The page and its help guide open on the Petrolord design system: light
grey panel by default, dark as a per-user choice from the header toggle.

- Scope: `ThemedApp` inside `EorScreeningTool.jsx` and
  `EorScreeningHelpGuide.jsx`; App.jsx unchanged. Cold-load prefix
  `/dashboard/apps/reservoir/eor-screening` in `src/design/rollout/w3e.js`
  (covers `/help`).
- Cards, fields and buttons use the adapted primitives without colour
  overrides; the header tile is the primary fill (the amber gradient is
  gone); verdict chips and the Qualified / Screened out badges use the
  status and neutral roles. The ranking chart stays white
  (`data-canvas="chart"`).
- Test: `src/pages/apps/__tests__/EorScreeningTool.theme.test.jsx` (the
  shared four checks, an expanded method, the chart in dark, the help
  guide). No calculation change.

## Reservoir upgrade round, Step 1 (EOR-U1, 2026-10-04)

Branch `feat/eor-u1`; working doc `docs/upgrade/EorScreening-UPGRADE.md`
(20 findings, 17 fixed, six S2 fixed, no S1; Step 2 ranked backlog).

- Engine held against Taber, Martin and Seright (1997) as printed, Parts 1
  and 2: CO2 miscible minimum depth by oil gravity (Part 2, Table 3);
  marginal for "sandstone preferred" (Part 2, Tables 4 and 5) and the
  carbonate fracture note b; transmissibility notes c and d; source per
  criterion. Gate `src/utils/eor/__tests__/eorValidation.test.js` probes
  every published limit through the engine, with a negative control.
- Results moved on purpose: the sample's micellar/ASP is Marginal (was
  Screened out); combustion 6/9 and steam 5/8; CO2 cases under 40 API in
  the gravity band fail where they passed.
- Report on the shared kit (`src/utils/eor/reportModel.js`,
  `eorReportExport.js`), goldens under `src/utils/eor/__tests__/__fixtures__`.
- Saved projects with record sharing (`src/contexts/EorScreeningContext.jsx`),
  `.pld` family; table `saved_eor_screening_projects` is migration
  `20261004220000` NOT APPLIED (saving says it is not switched on until then).
- Units: oilfield or SI on the Suite unit profile, criteria compared in
  oilfield; depth reference stated; `useDraftInput` in every converted field.
- Intakes by id: pvt-1 (gravity, viscosity at the stated reservoir pressure,
  temperature, bubble point), wta-1 (permeability, pressure), mbal-1 (OOIP,
  pressure) with their cards. No sender out yet (Step 2).
- e2e: `e2e/eor-screening-upgrade.spec.js`; T1 counts updated.
