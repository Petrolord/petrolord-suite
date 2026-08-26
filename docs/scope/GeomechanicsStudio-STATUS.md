# Geomechanics & Wellbore Stability Studio — STATUS

App: Drilling module, slug `geomechanics-studio` (Drilling-ROADMAP.md §4
D5). EXECUTES the owner-locked 2026-07-12 decision: the 1D MEM rebuilt
under Drilling; the 112-file legacy `src/pages/apps/MechanicalEarthModel/`
tree is DELETED (this makes docs/scope/MEM-AUDIT.md historical). Also
supersedes the D0-archived Wellbore Stability Analyzer. Built 2026-08-27
(waves G0-G3, one Suite PR + engines PR #41).

## What shipped

- **Engine** (`@petrolord/engines` PR #41, subtree-pulled;
  `packages/engines/engines/drilling/geomech.js`):
  - `horizontalStresses` — uniaxial poroelastic estimate with tectonic
    strain terms and k0 override, CLAMPED to the Andersonian frictional
    limits (bounds, not estimates — the legacy MEM's category error,
    fixed); clamps counted and warned.
  - `ucsFromDt` — Horsrud 2001 (shale) / McNally 1987 (sandstone) /
    constant, with provenance strings and applicability caveats.
  - `wellboreStability` — full stress-tensor rotation (principal →
    geographic → borehole frame) for arbitrary inc/azi, Kirsch wall
    stresses, Mohr-Coulomb COLLAPSE via first-crossing scan+bisection
    (the MC margin is NOT monotone in Pw: at high pressure the radial
    stress itself violates the criterion), hoop-tension-only FRACTURE
    INITIATION, breakout angle.
  - `mudWindowAlongWell` — the D5 differentiator: the stability window
    along the definitive trajectory (attitude per station, exact TVDs),
    tightest-window and closure detection.
  - `qualityScore` (regime-aware, the salvaged MEM idea fixed) +
    `LITHOLOGY_SEEDS` (the one useful legacy data table).
  - The engine takes PROFILE ARRAYS (tvd/Sv/Pp) — source-agnostic; no
    cross-domain engines import.
- **Validation**: independent numpy oracle
  (`tools/validation/drilling/oracle_geomech.py`, byte-identical reruns)
  with a self-asserted vertical Kirsch fixture: collapse
  `(3SHmax − Shmin − UCS + (q−1)Pp)/(1+q)` and frac init
  `3Shmin − SHmax − Pp + T0` exact, breakout at the Shmin direction.
  13 engines jest gates; suite runner **A20-A21 ACTIVE (21/21 total
  pass)**; **L12 (Zoback, Reservoir Geomechanics worked example) ARMED**.
- **Data model** (migration `20260827050000`, applied live 2026-08-27,
  JWT RLS probes pass): `wp_gm_cases` + `wp_gm_runs` (immutable). Log
  curves come from geo_wells_logs via the shared registry RLS.
- **App** (`src/pages/apps/GeomechanicsStudio/`): WorkspaceShell
  workstation on injected backends; tabs: Inputs & Logs (registry well
  picker, DEPT/DT/RHOB alias mapping status, PP source selector with the
  published pp-1.0.0 curves preferred → computed Eaton → hydrostatic,
  parameters with lithology seeds), MEM Profiles (stress + UCS tracks,
  quality score, **gm-1.0.0 PUBLISH of SHMIN/SHMAX/UCS** with the
  overwrite-own contract — published Shmin is D9 stimulation's input),
  Mud Window (window along the trajectory, tightest-window KPI, closure
  warnings, CSV + PDF). Route gated by
  `ProtectedAppRoute appId="geomechanics-studio"`.
- **Legacy MEM deletion (G3)**: 112 files removed (tree +
  chartConfigUtils.js), zero data loss (the mem_* tables and calculate-*
  edge fns never existed); 6 alias routes now redirect to
  `/dashboard/apps/drilling/geomechanics-studio` (`/expert`/`/analytics`
  dropped); `applicationRoutes.js` entry swapped (fullscreen chrome
  preserved for the successor); GeoscienceHub card removed; allApps
  swapped (also fixing the historic mismatch where allApps said
  'mechanical-earth-model' but routes guarded '1d-mechanical-earth-model');
  cosmetic strings updated. BasinFlowGenesis untouched.
- **Harness + e2e**: `/dev/geomechanics` serves the golden profile as
  published pp-1.0.0 curves; `e2e/geomechanics-studio.spec.js` recomputes
  quality/collapse/frac-init/tightest-window through the services
  (including the Float32 MPa round trip) and asserts them off the UI. 3/3.

## Verification (2026-08-27)

- Engines jest 881 green; oracle reruns byte-identical.
- Suite jest green (7 new GeomechanicsStudio tests), build green, runner
  21/21 ACTIVE + 12 ARMED, Playwright green including the new spec.
- Migration: rollback-wrapped dry run, live apply, RLS probes.
- Post-deletion grep: zero dangling MechanicalEarthModel references.

## Operator steps (owner)

1. **Tile migration `20260827060000` is HELD** under the program-wide
   single-upload gate; applies with the D1-D4 tiles at the 12-app launch
   upload. The archived 1d-mechanical-earth-model row stays archived.
2. Literature: a Zoback Reservoir Geomechanics worked example (L12) →
   /root/wds-literature/.
3. Staging E2E: pick a geo-bridged wellbore with published pp-1.0.0
   curves, load curves, build the MEM, publish gm-1.0.0, compute the mud
   window on the definitive design, export the PDF, save/reload.

## Out of scope / next

- Breakout-width-tolerant collapse, Mogi-Coulomb/modified Lade, thermal
  and poroelastic wall effects, anisotropy, image-log calibration, 3D
  MEM, salt creep.
- D6 (Casing & Tubing Design Studio upgrade) is next in roadmap order.
