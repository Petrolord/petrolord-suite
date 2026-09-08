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

## Tester fix: hole sections resolved from one shared source (2026-09-08)

The Drilling tester reported that the Hydraulics, Surge & Swab and Hole
Cleaning tabs raised "No hole sections defined for this wellbore" on a
wellbore whose Mud & Rheology tab loaded fine (Plan A r1 definitive, 220
stations, TD 6,500 m, drillstring imported from the T&D case). Live data
for that wellbore ("Lad"): no `wp_wellbore_geometry` row at all, one
Casing & Tubing case ("BTU", 9-5/8" 47# L-80 0 to 6,500.01 m), one T&D
case, one Cementing job. Cause: the shared geometry spine is written ONLY
by the String & Geometry tab of Torque & Drag Studio; a casing programme
built in Casing & Tubing Design Studio never reached it, and the guard
named neither what it looked for nor where. (Well Design Studio stores no
casing at all; the tab query, status filter and load-order hypotheses were
checked and ruled out.)

Fix (this branch):
- `TorqueDragStudio/services/geometrySource.js` (pure, jest-covered):
  `resolveHoleSections` keeps the saved spine row as the plan of record,
  else derives sections from the latest Casing & Tubing case (innermost
  string governs each cased interval, API 5CT IDs, conventional hole size
  per casing OD, open hole through the deepest shoe to the trajectory's
  TD, clamped to TD), else returns an empty row whose `note` names the
  wellbore, the plan, and both places checked. `source` is one of
  `geometry | casing_programme | none`; `label` describes the sections.
- `tdApi.getGeometry(wellboreId, { trajectory })` now returns the resolved
  row (same columns plus `source`, `label`, `note`); `getGeometryRow` is
  the raw read. Every studio that imports it (T&D, Hydraulics, Cementing,
  Well Control, Well Cost & Time, Geomechanics) gets the fallback.
- The four run services (tdRun, hydRun, cmtRun, wcRun) throw
  `missingHoleSectionsMessage(geometryRow)` instead of the bare string.
- HydWorkstation: loads the trajectory first and hands it to the resolver;
  clears the run error whenever trajectory or geometry (re)loads; status
  bar shows the hole-section count and source; a banner on the three
  engine tabs carries the resolver note with links to Torque & Drag and
  Casing & Tubing. T&D's String & Geometry tab shows the same note, and
  Save case persists derived sections as the real spine row.

What the tester sees now on the same wellbore: the three tabs run on the
derived 9-5/8" cased section 0 to 6,500 m (amber banner: derived from
Casing & Tubing case 'BTU'; review on the String & Geometry tab and Save).
Nothing else is required of the tester. To take control of hole sizes or
add open hole below the shoe, edit the sections on that tab in Torque &
Drag Studio and Save.

### Same fix across the other Drilling and Completion apps (2026-09-08)

Checked every app that needs an annulus or casing programme:
- Read the geometry spine and carried the same bare error: Torque & Drag,
  Cementing, Well Control. All three now load trajectory-first, hand it to
  the resolver, clear the run error on data (re)load, show the hole-section
  count and source in the status bar, and carry the shared
  `TorqueDragStudio/components/GeometryNotice` banner (amber = derived from
  Casing & Tubing, red = nothing found, with links). Well Cost & Time and
  Geomechanics import the same `getGeometry` and get the fallback for free.
- Wellsite Studio read `wp_wellbore_geometry` directly for the rig config it
  bridges from the registry well; it now goes through the same resolver.
- Completion Design, Perforation & Sand Control, Stimulation and Well
  Integrity & P&A take their casing programme from Casing & Tubing cases
  (picker + manual sections), not from the spine, so a programme built in
  Casing & Tubing was already visible there and they never raised this
  message. No change.
