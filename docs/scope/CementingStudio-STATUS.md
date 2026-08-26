# Cementing Studio — STATUS

App: Drilling module, slug `cementing-studio` (Drilling-ROADMAP.md §4 D4;
fresh slug — the archived cementing-simulation-app stub stays archived).
Built 2026-08-27 (waves C0-C3, one Suite PR + engines PR #40). Replaces
the D0-archived mock whose displacement efficiency, pressures and ECD were
literally Math.random(); absorbs the casing-centralization stub.

## What shipped

- **Engine** (`@petrolord/engines` PR #40, subtree-pulled;
  `packages/engines/engines/drilling/cementing.js`):
  - `jobVolumes` — annulus capacity rows (casing OD vs the shared hole
    sections, open-hole excess as a washout model), slurry with shoe track,
    lead/tail split, displacement, sacks and job time.
  - `simulatePlacement` — PLUG-FLOW volume-interval bookkeeping (fronts
    partition the flow path in volume coordinates), exact-TVD hydrostatics,
    D2 loss-kernel friction per constant-fluid sub-interval; pump pressure,
    U-tube with a 1 Pa free-fall deadband, ECD at the previous shoe and TD
    per step; end state (achieved TOC, float differential, final annulus);
    density-hierarchy and frac-EMW warnings.
  - `standoffProfile` + `requiredSpacing` — API 10D convention (bow-spring
    linear stiffness from the quoted restoring force at 67% standoff,
    fixed-end beam sag, rigid blades); bisection for the widest spacing
    holding 67%.
  - `placementChecklist` — an HONEST pass/review checklist (density and
    velocity hierarchy, standoff, free fall, float check) instead of a
    fake efficiency percentage.
  - v1 scope: FULL string from surface (liner jobs with a running string
    guarded out with a clear error, later phase).
- **Validation**: independent oracle
  (`tools/validation/drilling/oracle_cementing.py`, byte-identical
  reruns) with a self-asserting VERTICAL fixture (cylinder volumes, exact
  TOC, U-tube differential = closed-form density integrals asserted before
  writing). 11 engines jest gates; suite runner **A18-A19 ACTIVE (19/19
  total pass)**; **L10 (API RP 10B-2/10D example) + L11 (Nelson &
  Guillot, Well Cementing example) ARMED** pending owner PDFs.
- **Data model** (migration `20260827010000`, applied live 2026-08-27,
  JWT RLS probes pass): `wp_cmt_cases` + `wp_cmt_runs` (immutable).
  Geometry from the shared `wp_wellbore_geometry` D1 spine.
- **App** (`src/pages/apps/CementingStudio/`): WorkspaceShell workstation
  on injected backends; tabs: Job Design (casing catalog picker, depths,
  TOC/excess, fluid program with auto lead/tail volumes, volume summary
  cards), Placement (pump-pressure chart with free-fall shading, ECD
  chart vs the frac EMW line, final-annulus table, quality checklist,
  **cement job report PDF**, CSV, immutable run history), Centralization
  (standoff-vs-MD chart with the API 67% line, required-spacing
  readout). Help guide with the plug-flow honesty markers. Route gated by
  `ProtectedAppRoute appId="cementing-studio"`.
- **Harness + e2e**: `/dev/cementing` seeds the golden slant-well 7" job;
  `e2e/cementing-studio.spec.js` recomputes slurry/sacks, end pump
  pressure, max ECD, min standoff and required spacing from the services
  and asserts them off the UI. 3/3.

## Verification (2026-08-27)

- Engines jest 867 green; oracle reruns byte-identical; vertical fixture
  self-asserts.
- Suite jest green (9 new CementingStudio tests), build green, runner
  19/19 ACTIVE + 10 ARMED, Playwright green including the new spec.
- Migration: rollback-wrapped dry run, live apply, RLS probes.

## Operator steps (owner)

1. **Tile migration `20260827030000` is HELD** under the program-wide
   single-upload gate; applies with the D1-D3 tiles at the 12-app launch
   upload.
2. Literature for the ARMED gates when available: API RP 10B-2/10D worked
   example (L10) and a Well Cementing (Nelson & Guillot) worked example
   (L11) → /root/wds-literature/.
3. Staging E2E: design a 7" job on a definitive design, simulate, check
   free-fall shading and the ECD line against the frac EMW, compute
   standoff, export the job report PDF, save/reload the job and run.

## Out of scope / next

- Liner jobs and stage tools, fluid intermixing/contamination, thickening
  time and temperature schedules (lab data), foamed cement, transient
  free-fall rates, CBL prediction, the tension x dogleg centralizer load
  term.
- D5 (Geomechanics & Wellbore Stability Studio, the owner-locked MEM
  rebuild) is next in the roadmap order.
