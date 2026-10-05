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

## Reservoir upgrade round, Step 2 (EOR-U2, 2026-10-04)

Branch `feat/eor-u2`; working doc `docs/upgrade/EorScreening-UPGRADE.md`
sections 8 and 9 (batch decision, build log, MMP source, deferred).

- U2-001: CO2 MMP check against reservoir pressure, `src/utils/eor/mmp.js`
  (Zhu et al. 2025, ACS Omega 10 (47) 57267-57276, Model 9; the classic
  papers could not be read). Gate `src/utils/eor/__tests__/eorMmp.test.js`
  reproduces the paper's MAE 0.4825 MPa, MAPE 2.53 %, RMSE 0.7494 on its
  Table 2, with negative controls. Miscible or immiscible with the margin,
  "within the error" under 2.05 MPa, inputs outside the data flagged.
  Never changes a Taber verdict.
- U2-002: Send to EOR Screening from Fluid, Well Test (saves first) and
  Material Balance, by id (`src/lib/eorScreeningLinks.js`).
- U2-003: `eor-screen-1` read-by-id contract, `src/lib/eorScreenSource.js`
  (inputs with sources, verdicts per criterion, edition, MMP, fingerprint);
  first reader is Recovery Factor, in its own Step 2.
- U2-007 distance to each limit; U2-006 range of current projects (Part 2,
  Tables 1 to 7); U2-008 C1 + N2 from a compositional Fluid project (C2 to
  C10 not separable from C7+, left to the user); U2-005 remaining oil from
  mbal-1 and pvt-1 with a stated Swi.
- Deferred: U2-004 (paper), U2-009 (after NAPE), Batch C.
- Migration `20261004220000` still NOT APPLIED; saving says so.
