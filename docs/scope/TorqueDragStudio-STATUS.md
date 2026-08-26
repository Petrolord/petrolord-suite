# Torque & Drag Studio — STATUS

App: Drilling module, slug `torque-drag-studio` (Drilling-ROADMAP.md §4 D1).
Supersedes the D0-archived Torque & Drag Predictor and Casing Wear Analyzer.
Built 2026-08-26 (waves TD0-TD3, one Suite PR + engines PR #37).

## What shipped

- **Engines** (`@petrolord/engines` PR #37, subtree-pulled;
  `packages/engines/engines/drilling/`):
  - `torqueDrag.js` — soft-string Johancsik (SPE 11380) / Sheppard (SPE
    15463) model: velocity-partitioned Coulomb friction over 6 operations
    (trip in/out, rotate on/off bottom, slide drill, backream), WOB/bit
    torque boundary at the bit, midpoint-predictor marching, Paslay-Dawson
    sinusoidal + Chen-Cheatham helical buckling flags, tension/torsion
    utilization vs grade capacity. SI units end to end, no silent
    conversion.
  - `casingWear.js` — energy wear model (V = WF·N·L) with EXACT crescent
    groove geometry (circle-circle lens inversion by bisection; the legacy
    full-circumference smear is gone), Barlow burst derate. Collapse derate
    deliberately absent until the D6 API 5C3 work.
  - `data/tubulars.js` — API 5DP/RP 7G/5CT drill pipe, HWDP, drill collar,
    casing and grade tables in SI with provenance.
- **Validation**: independent numpy RK4 oracle
  (`tools/validation/drilling/oracle_torquedrag.py`, byte-identical
  reruns) + goldens `torquedrag_cases.json` (5 synthetic wells × 4-5
  operations) and `casingwear_cases.json`. 44 engines jest gates including
  closed forms (vertical buoyed weight exact, slant `wL(cosθ ± μ sinθ)`
  exact, horizontal `μwL`/`μwLr` exact, capstan `e^{μβ}` convergence,
  rotating `M = μ·WOB·β·r` exact). Suite runner
  `tools/validation/drilling-validation.ts`: **A10-A12 ACTIVE** (12/12
  gates pass), **L4 (Mitchell & Miska T&D example) + L5 (SPE 11380 field
  cases) ARMED** pending owner PDFs in /root/wds-literature/.
  Physics note: the oracle originally added the curvature term to the
  gravity term; the vector force balance proves they oppose in a build
  under tension (tension lifts to the high side). Derivation recorded in
  the oracle docstring.
- **Data model** (migration `20260826120000`, applied live 2026-08-26,
  RLS probed): `wp_wellbore_geometry` (ONE row per wellbore, the
  module-wide hole/casing spine that D2 hydraulics and D6 reuse),
  `wp_td_cases`, `wp_td_runs` (immutable, wp_ac_runs shape). wp_* privacy
  model: private by default, org read-only via the site, writes owner-only.
- **App** (`src/pages/apps/TorqueDragStudio/`): WorkspaceShell workstation
  on an injected backend (`wpBackend` live / `inMemoryBackend` harness):
  explorer (wp sites → wellbores → cases), String & Geometry tab
  (catalog-driven drillstring builder, hole/casing sections, mud/friction/
  operations), Analysis tab (KPI band, broomstick + torque + side-force
  charts on the white chartTheme standard, warnings, immutable run
  history, CSV + PDF export), Casing Wear tab, friction Sensitivity sweep.
  Trajectory source: the wellbore's definitive design station cache
  (`getDefinitiveTrajectory` in services/tdApi.js). Help guide at
  `/dashboard/apps/drilling/torque-drag-studio/help` (EPE pattern, no em
  dashes). Route gated by `ProtectedAppRoute appId="torque-drag-studio"`.
- **Harness + e2e**: `/dev/torque-drag` mounts the real workstation on the
  golden horizontal well; `e2e/torque-drag-studio.spec.js` recomputes
  expectations from the engines package in the test process and asserts
  them off the UI (hookload, torque, buckling onset, wear depth). 3/3 pass.

## Verification (2026-08-26)

- Engines repo jest 807 green; goldens byte-identical on oracle rerun.
- Suite jest green including `TorqueDragStudio` suites (tdRun closed loop
  vs goldens, help guide); `npm run build` green;
  `npx tsx tools/validation/drilling-validation.ts` 12/12 ACTIVE PASS;
  Playwright including the new spec.

## Operator steps (owner)

1. PROGRAM-WIDE HOLD (owner directive 2026-08-26): no prod zip until all
   12 D&C apps are ready. The tile migration `20260826140000` stays HELD
   and applies together with every other D-phase tile at the single
   launch upload (dry-run first). Update MIGRATIONS.md then.
3. Staging E2E checklist: pick a wellbore with a definitive design, build
   a string, run, save a run, export PDF; share the site to an org member
   and confirm read-only visibility of cases/runs.
4. Literature: drop Mitchell & Miska (T&D chapter) and SPE 11380 PDFs in
   /root/wds-literature/ to activate the ARMED L4/L5 gates.

## Out of scope / next

- Stiff-string model, casing-wear collapse derate (API 5C3 at D6), dynamic
  T&D, jar placement, stuck pipe (unassigned phase), hole cleaning (D2).
- D2 (Drilling Fluids & Hydraulics Studio) consumes `wp_wellbore_geometry`
  and the same case pattern.
