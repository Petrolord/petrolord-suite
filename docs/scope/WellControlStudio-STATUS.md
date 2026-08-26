# Well Control Studio — STATUS

App: Drilling module, slug `well-control-studio` (Drilling-ROADMAP.md §4 D3;
fresh slug — the archived well-control-simulator stub stays archived).
Built 2026-08-26 (waves W0-W3, one Suite PR + engines PR #39). First app of
its kind in the suite: no well-control coverage existed anywhere before D3.

## What shipped

- **Engine** (`@petrolord/engines` PR #39, subtree-pulled;
  `packages/engines/engines/drilling/wellControl.js`):
  - `wellVolumes` — string/annulus capacities and strokes over the shared
    flow-element walk (hydraulics.js `buildFlowElements`).
  - `killSheet` — IWCF-convention kill sheet: formation pressure, kill mud
    weight, ICP/FCP, linear step-down schedule, strokes, wait-and-weight
    AND driller's method framing, influx characterization (gradient from
    SIDPP/SICP over the influx height; gas/mixed/liquid).
  - `kickTolerance` + `maaspPa` + `boyle` — single-bubble isothermal
    planning convention: shut-in-at-bottom and circulated-to-shoe cases,
    Boyle back-conversion, min of both; sweep helper for charts.
  - `tvdAt` — EXACT partial minimum-curvature TVD (linear interpolation
    between stations misses by decimetres on arcs; fixed during W0 when
    the golden agreement caught it).
- **Validation**: independent oracle
  (`tools/validation/drilling/oracle_wellcontrol.py`, byte-identical
  reruns) with its own span-walk volumes + a hand-constructed IWCF-style
  vertical fixture whose closed-form identities are asserted inside the
  oracle before writing. 8 engines jest gates; suite runner **A16-A17
  ACTIVE (17/17 total pass)**; **L8 (IWCF/IADC kill sheet example) + L9
  (ADE kick/kill example) ARMED** pending owner PDFs.
- **Data model** (migration `20260826210000`, applied live 2026-08-26,
  JWT RLS probes pass): `wp_wc_cases` + `wp_wc_runs` (immutable).
  Geometry from the shared `wp_wellbore_geometry` D1 spine.
- **App** (`src/pages/apps/WellControlStudio/`): WorkspaceShell
  workstation on injected backends; tabs: Well & Volumes (string import
  from a T&D case, pump/SCR/shoe/mud config, capacities + strokes,
  published-frac-EMW hint near the shoe for geo-bridged wellbores), Kill
  Sheet (SIDPP/SICP/pit gain, KMW/ICP/FCP/Pf cards, influx label, method
  toggle, step-down table + standpipe-vs-strokes chart, **printable Kill
  Sheet PDF**, CSV, immutable run history), Kick Tolerance (MAASP, KT
  with both cases shown, KT-vs-mud-weight sweep chart, stated
  assumptions). Help guide with the planning-not-certification
  disclaimer. Route gated by `ProtectedAppRoute appId="well-control-studio"`.
- **Harness + e2e**: `/dev/well-control` seeds the golden slant well +
  moderate_gas kick; `e2e/well-control-studio.spec.js` recomputes
  KMW/ICP/FCP/MAASP/KT from the services and asserts them off the UI. 3/3.

## Verification (2026-08-26)

- Engines jest 855 green; oracle reruns byte-identical; the IWCF-style
  fixture self-asserts (KMW 1302.0 = 1200 + 3e6/(g·3000) exactly, the SI
  image of the classic 10 ppg + 500 psi at 10,000 ft = 10.96 ppg check).
- Suite jest green (8 new WellControlStudio tests), build green, runner
  17/17 ACTIVE + 8 ARMED, Playwright green including the new spec.
- Migration: rollback-wrapped dry run, live apply, RLS probes.

## Operator steps (owner)

1. **Tile migration `20260826230000` is HELD** under the program-wide
   single-upload gate; apply with the D1/D2 tiles at the 12-app launch
   upload.
2. Literature for the ARMED gates when available: an IWCF/IADC kill-sheet
   worked example (L8) and the ADE kick/kill chapter example (L9) →
   /root/wds-literature/.
3. Staging E2E: compute volumes on a definitive design, run a kill sheet,
   toggle methods, export the PDF, check MAASP/KT against a hand
   calculation, save/reload a case and run.

## Out of scope / next

- Transient multiphase kill simulation, gas solubility/OBM, choke-line
  friction and subsea adjustments (surface BOP assumed and stated),
  volumetric method worksheets, bullheading, training content. Subsea
  support and the volumetric method are named later-phase candidates.
- D4 (Cementing Studio) is next in the roadmap order.
