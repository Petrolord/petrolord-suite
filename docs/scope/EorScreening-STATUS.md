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
