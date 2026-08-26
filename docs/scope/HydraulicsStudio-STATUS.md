# Drilling Fluids & Hydraulics Studio — STATUS

App: Drilling module, slug `drilling-fluids-hydraulics` (Drilling-ROADMAP.md
§4 D2; the D0-archived mock slug REBUILT, roadmap-locked). Built 2026-08-26
(waves H0-H3, one Suite PR + engines PR #38).

## What shipped

- **Engines** (`@petrolord/engines` PR #38, subtree-pulled;
  `packages/engines/engines/drilling/`):
  - `rheology.js` — Fann dial fits (Bingham / power law / Herschel-Bulkley
    with the RP 13D 2θ3−θ6 yield), exact local n'/K' linearization.
  - `hydraulics.js` — element-walked circulating losses (string bore →
    nozzles → annulus) with **Metzner-Reed generalized viscosity** so
    laminar 16/Re (pipe) and 24/Re (slot annulus) reproduce the Newtonian
    and power-law closed forms EXACTLY; Bourgoyne a/Re^b turbulent;
    transitional blend over [Rec, Rec+800]; bit ΔP/jet/power/impact; ECD
    profile vs TVD. SI end to end.
  - `surgeSwab.js` — steady-state Burkhardt (Kc 0.45), closed/open ended,
    trip-speed sweep + max-safe-speed bisection against PP/FP EMW limits.
  - `holeCleaning.js` — Schiller-Naumann slip velocity (damped fixed
    point), transport ratio, cuttings concentration, min-flow-rate
    bisection; >35° inclination warning (vertical-well correlation basis,
    stated).
- **Validation**: independent numpy oracle
  (`tools/validation/drilling/oracle_hydraulics.py`, byte-identical
  reruns; rides the D1 golden wells) → `hydraulics_cases.json` (2 wells ×
  2 muds × 3 rates + surge sweeps + slip velocities). 35 engines jest
  gates; suite runner gates **A13-A15 ACTIVE (15/15 total pass)**;
  **L6 (ADE ch.4 hydraulics) + L7 (API RP 13D example) ARMED** pending
  owner PDFs. Method-defect caught by the closed-form gates during build:
  effective viscosity at the corrected wall rate understates laminar
  losses by (3n'+1)/4n'; fixed to the Metzner-Reed definition in both
  implementations before any golden was committed.
- **Data model** (migration `20260826170000`, applied live 2026-08-26,
  JWT RLS probes pass): `wp_hyd_cases` + `wp_hyd_runs` (immutable).
  Hole/casing geometry is NOT duplicated: D2 reads the shared
  `wp_wellbore_geometry` spine created at D1.
- **App** (`src/pages/apps/HydraulicsStudio/`): WorkspaceShell workstation
  on injected backends; tabs: Mud & Rheology (Fann inputs, fit table,
  rheogram; import string from a T&D case), Hydraulics (KPI band,
  per-element loss table, ECD vs TVD chart with PP/FP overlay via the
  Pore Pressure Studio pp-1.0.0 curves when the wellbore is bridged),
  Surge & Swab (sweep chart vs mud window, max safe trip speed), Hole
  Cleaning (transport table, min flow rate). Immutable run history,
  CSV/PDF export, help guide at `/help`. Shared drilling Explorer
  (parameterized from the D1 component). Route gated by
  `ProtectedAppRoute appId="drilling-fluids-hydraulics"`.
- **Harness + e2e**: `/dev/hydraulics` seeds the golden slant well;
  `e2e/hydraulics-studio.spec.js` recomputes expectations from the
  engines/services in the test process and asserts them off the UI. 3/3.

## Verification (2026-08-26)

- Engines jest 846 green; oracle reruns byte-identical.
- Suite jest green (10 new HydraulicsStudio tests), build green,
  `npx tsx tools/validation/drilling-validation.ts` 15/15 ACTIVE + 6 ARMED,
  Playwright green including the new spec.
- Migration: rollback-wrapped dry run, live apply, post-apply + RLS probes.

## Operator steps (owner)

1. **Tile migration `20260826190000` is HELD** under the program-wide
   single-upload gate (owner directive 2026-08-26: no prod zip until all
   12 D&C apps are ready). Apply it together with `20260826140000` (D1)
   and later D-phase tiles at the final launch upload.
2. Literature for the ARMED gates, whenever available: Mitchell & Miska
   (L2/L4), Amoco handbook (L3), SPE 11380 (L5), ADE ch.4 (L6),
   API RP 13D (L7) → /root/wds-literature/.
3. Staging E2E checklist: fit a mud, run hydraulics on a definitive
   design, verify the ECD overlay on a geo_wells-bridged wellbore, sweep
   trip speeds, save/reload a case and run.

## Out of scope / next

- Transient surge, tool-joint local losses, motor/MWD ΔP (surface
  allowance field only), high-angle cuttings-bed mechanics, pump library,
  temperature-dependent rheology.
- D3 (Well Control Studio) is next; it reuses the same geometry spine and
  kill-sheet-grade hydrostatics.
