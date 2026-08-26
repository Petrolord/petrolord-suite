# Stimulation Designer — status

Drilling D9 (Drilling-ROADMAP.md §4). Fresh slug `stimulation-designer`,
route `/dashboard/apps/drilling/stimulation-designer` (gated
ProtectedAppRoute). Rebuild of the archived Math.random
`frac-completion-app` (route already redirects). SHIPPED 2026-08-28.

## What it is

Hydraulic frac + matrix acidizing planning on the wp data spine, with
closure stress (published gm-1.0.0 SHMIN) and reservoir pressure
(pp-1.0.0 PP) read at the treatment mid-point TVD on the definitive
trajectory.

- **Engines** (@petrolord/engines `engines/drilling/fracDesign.js` +
  `acidizing.js` + `data/proppants.js`, engines PR #49 stacked on #48):
  one consistent published formula set (Economides PPS /
  Valko-Economides / Nolte 1986 / Cinco-Ley & Samaniego):
  - PKN/KGD Newtonian 2D widths + net pressures (model-specific
    compliances), BHTP = closure + p_net (hydrostatic/friction
    explicitly out of scope).
  - Nolte material balance (KL(eta) approximation, fixed point in the
    quadratic of sqrt(t)), pad fraction = ramp exponent =
    (1-eta)/(1+eta), stepped blender schedule, closed-form proppant
    mass.
  - Proppant catalog (5 families, nominal pack permeability vs closure,
    log-interp, clamped + flagged; damage factor separate).
  - Cinco-Ley-Samaniego pseudo-skin (range-flagged 0.1-1000, UFD 1.6
    optimum marker), effective rw, FOI via the SAME radial identity the
    D8 designer uses (perforation.productivityRatio, app-side).
  - Acidizing: Hawkins skin, sandstone volumetric front (pore-volume
    rule, chemistry stays with the lab), carbonate wormhole via
    lab-calibrated PV_bt, Darcy matrix-rate ceiling below closure.
- **Data spine**: `wp_st_cases` + immutable `wp_st_runs` (migration
  20260828180000, applied live, RLS probed). Optional ps_case_id link.
- **Workstation** (StWorkstation on WorkspaceShell, injected backend):
  Frac Design (rock context cards w/ curve provenance, PKN/KGD toggle,
  width profile chart), Pump Schedule (balance + pad/ramp table +
  concentration chart + proppant pack), Productivity (C_fD vs 1.6,
  s_f, r'w, FOI, cross-links to Nodal + D8), Acidizing (sandstone/
  carbonate/matrix-ceiling cards + run history). White chartTheme +
  ChartLogo.

## Validation

- Independent oracle `oracle_stim.py` self-asserts hand arithmetic
  BEFORE writing `stim_cases.json` (E' algebra, PKN 6.392 mm hand case,
  CL=0 limit + balance residual, exact schedule mass integral,
  f(1.6)=1.3841 + ln 2 infinite-conductivity limit, Hawkins/Darcy
  closed forms); balance solved by BISECTION in the oracle vs the JS
  fixed point. Permeabilities stored in darcy units (golden 9-decimal
  rounding would destroy sub-1e-9 SI values — house gotcha).
- Runner gates **A28 + A29 ACTIVE (29/29 total)**; **L15/L16** (D8) and
  **L17** (PPS/Valko-Economides worked examples) + **L18** (vendor
  API RP 19D conductivity cells) **ARMED** on owner PDFs.
- Suite jest: stRun closed loop (6) + help gates (3); engines jest 15.
  Playwright `e2e/stimulation-designer.spec.js` (4 specs) recomputes
  expectations through stRun + vendored engines on `/dev/stimulation`.

## Honesty markers (also in the /help guide)

- 2D screening models, not a pseudo-3D simulator; PKN/KGD bracket, not
  arbitrate.
- Proppant pack data nominal; vendor RP 19D cells govern (L18).
- Acid chemistry (systems, preflush, PV_bt) belongs to the lab.
- BHTP excludes hydrostatic and friction (rig hydraulics scope).

## Held for the program launch (single-upload gate)

- Tile migration `20260828200000_seed_stimulation_designer_tile.sql`
  (seed Active Drilling tile + repoint the archived frac-completion-app
  description) — apply with the ONE prod upload that ships all 12 D&C
  apps. Dry-run proven 2026-08-28.

## Out of scope (v1, documented in help)

- P3D/height growth, tip screenout design, frac-pack pumping,
  non-Newtonian frac-fluid friction, perforation friction/tortuosity,
  acid frac, diversion staging, refrac selection.

## Staging E2E checklist (owner)

1. Open Drilling → Stimulation Designer on a wellbore with a definitive
   design and published SHMIN/PP; create a case and confirm the closure
   and reservoir pressure cards fill with the provenance line.
2. Toggle PKN/KGD and watch width and net pressure move; push the rate
   and see width grow on the fourth root.
3. Raise CL and watch efficiency fall and the pad grow; check the
   schedule table sums to the mass card.
4. Swap sand for ISP ceramic at a deep (high-closure) interval and
   watch C_fD and FOI recover.
5. Acidizing: push ra past rs and see the skin zero; drop PV_bt and see
   the carbonate skin deepen; confirm the matrix ceiling moves with
   closure.
6. Save, duplicate, reload round-trip; save a run into the immutable
   history.
