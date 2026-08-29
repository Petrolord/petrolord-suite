# Relief & Flare Studio — status

Phase: Facilities F2 (Facilities-ROADMAP.md §3 app 5, §5 F2)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f2)
Slug: `relief-blowdown-sizer` (kept — it carries entitlements; the
tile RENAMES via the HELD migration 20260829550000).

## What shipped

- **Engine** (`@petrolord/engines` PR #78, vendored, shim at
  `src/utils/facilities/engine/relief.js`): API 520 gas/vapor with
  both branches (critical C-form and subcritical F2, the switch
  decided by the critical ratio, the branches proven to meet at it);
  liquid with the published Kv equation iterated through Reynolds;
  steam with the Napier closed form and its range refusal; the API 521
  fire case (exact wetted-segment geometry, 21000/34500 heat input,
  relief load with the near-critical latent-heat warning) sized at the
  ACTUAL fire-case relieving pressure — the old engine hardcoded
  100 psig there; KO-drum droplet settling (C-Re iteration);
  point-source radiation forward AND inverted (the distance an
  allowable demands, which is what a stack height buys); adiabatic
  blowdown march. Oracle: first-principles isentropic-nozzle flux in
  absolute SI, so the 520/735 constants are CHECKED, not repeated.
  15 gates; engines suite 1851 green.
- **Chart factors typed by design**: balanced-bellows Kb/Kw, superheat
  KSH, insulation environment factor are published as charts/tables;
  they are inputs with references named and warnings where the default
  stops being safe. Literature gates stay ARMED.
- **Studio** on the kit (`src/components/reliefstudio/` +
  `src/contexts/ReliefStudioContext.jsx`), tabs: PSV Sizing
  (gas/liquid/steam/fire with the orifice ladder and honesty notes),
  KO Drum, Radiation, Blowdown (ChartFrame curve with the 15-minute
  marker). Help guide; smoke test.
- **Persistence**: kept table `saved_relief_projects`, brought onto
  the shared savedProjects service by migration 20260829540000
  (updated_at added, APPLIED live). Old ad-hoc save/results_data path
  retired; inputs-only convention.
- **Deleted**: `src/utils/reliefCalculations.js` (superseded: its
  Kb/Kc were hardcoded 1.0, its fire case sized at a hardcoded
  pressure, its radiation had no inverse).

## Open

- Tile rename migration 20260829550000 HELD for the prod upload.
- Armed literature gates: API 520 Kb/Kw charts, KSH table, API 521
  insulation credits and a published fire-case worked example (owner
  PDFs).
