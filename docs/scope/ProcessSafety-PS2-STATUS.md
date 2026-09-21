# Consequence Modelling Studio (PS2) status

Phase: PS2 (ProcessSafety-ROADMAP.md)
Status: **BUILT 2026-09-19** (branch feat/ps2-consequence-studio). Code only:
both migrations are written and NOT APPLIED (owner-run), the tile is still
Coming Soon, and production gets the route with the next upload.

The Process Safety module's second application and the live counterpart of
NextGen course H4 `consequence` (NextGen-Remaining-Courses-PLAN.md section 14).

## What it answers

A loss of containment followed through five steps: how fast it comes out,
where the vapour goes and how strong it is downwind, how much heat a pool
fire puts on a target, how hard a blast pushes at a distance, and the
probability of fatality each dose carries.

## The engine

`packages/engines/engines/hse/consequence.js`, from petrolord-engines PR #223
(merged b43f1d9). 206 engine tests against an independent scipy oracle,
second routes (Gauss-Legendre view factor, isentropic nozzle, plume mass
flux) and published values (YB 6.6.3 benzene pool fire, YB 2.6.2.1 hydrogen
and 2.6.4.1 acrylonitrile, PB Appendix 6.B CO plume and probit, OSD/30
Tables 2, 17, 18 and Eq. 4, CBU Kinney-Graham column); 48 negative controls.
Record: `packages/engines/tools/validation/hse/FINDINGS-consequence.md`. The
app imports it through the one-line shim
`src/utils/processSafety/engine/consequence.js`.

| Engine | Used for |
|---|---|
| `liquidOrificeDischarge`, `gasOrificeDischarge` | source terms; the gas result carries `regime` CHOKED / SUBSONIC, the pressure and critical ratios and psi |
| `poolFromSpill`, `poolEvaporationMackayMatsugu` | pool area, depth and diameter (bund or stated thickness); evaporation rate |
| `gaussianPlume`, `plumeDistanceToConcentration`, `ppmToMgM3`, `mgM3ToPpm` | centreline and receptor concentration in mg/m3 and ppm, the Briggs range warning, the distance search with REACHED / NOT_REACHED / BEYOND_SEARCH_RANGE and near/far roots, and every chart point |
| `poolBurningRate`, `poolFireSolidFlame`, `atmosphericTransmissivityBagster`, `solidFlameDistanceForHeatFlux` | burning flux (Babrauskas with a Table 6.5 fuel or given coefficients, Burgess), flame length, tilt, SEP, Fv/Fh/Fmax, tau, heat flux, every chart point, distance to a heat flux |
| `tntEquivalentMass`, `scaledDistance`, `kinneyGrahamOverpressure`, `distanceForOverpressure` | TNT mass, Z, overpressure, every chart point, distance to an overpressure |
| `thermalProbit`, `toxicProbit`, `overpressureProbit` and the preset tables | probit, probability, dose, with the preset's source |

The app restates no formula. Its own arithmetic is (1) unit conversion at
the edge with named factors (bar, C, kW/m2, kPa, MJ/kg, mm, g/mol), (2) a
spill volume from the liquid release held for a duration (rate x duration /
density, labelled on screen), and (3) the distance grids the charts are
drawn on.

## Vendoring

File by file from canonical a1d8c9f to b43f1d9 (26 paths: 13 added, 13
modified), VENDOR.json pinned to b43f1d9, VENDOR.manifest regenerated from
`git ls-tree`. Guard `node tools/check-vendored-engines.mjs --canonical
/root/petrolord-engines`: manifest verified, 860 paths byte for byte, 0
deviations; drift test green.

The range brings four merged engine PRs, not only #223:

- **#223** consequence (new) and `spacing.js` exporting `thomasFlameHeightM`.
  `poolFireSetbackM` old vs new compared over 800 input sets: 0 differ. The
  facilities engine suites and the Facility Layout (`layoutSpacing*`) Suite
  tests pass, so FC1-related setbacks are unchanged.
- **#220, #222** HSE exposure and safetyStats message and rationale fixes; no
  figure moves.
- **#221 MD3-0** terminalDepot and fuelPricing repairs (merged meanwhile).
  They change behaviour (refusals of blank opening stock, trucking cost and
  others; insurance on CIF). The engine suites and the Terminal & Depot and
  Fuel Pricing smoke tests pass on this branch. The Suite page repairs that
  go with it live on the unpushed MD3-0 branch `fix/md3-0-supply-apps`
  (worktree /root/wt-md3-suite), which vendors the same #221 bytes; whichever
  PR merges second takes a VENDOR.json / manifest conflict that resolves to
  the later pin.

## The app

Route `/dashboard/apps/process-safety/consequence-studio` (ProtectedAppRoute
`consequence-studio`), help at `.../help`. LOPA studio shell: header with
saved-study selector and autosave, a scope notice, five tabs.

- **Source term.** Liquid and gas through a hole side by side (the gas
  regime shown as the engine names it, with Pa/P0, the critical ratio and
  psi); pool from a spill (bund with optional wall check, or a stated
  thickness; the spill typed or made from the liquid release); Mackay and
  Matsugu evaporation of the pool.
- **Dispersion.** Release rate from the evaporation, the gas release or
  typed; Briggs rural class A to F or given sigmas; centreline and receptor
  concentration in mg/m3 and ppm; distance to a concentration (target in
  ppm or mg/m3; needs a class); concentration vs distance on log axes with
  the target and x marked.
- **Fire.** Pool diameter from the spill or typed; burning rate; flame
  length (Thomas with wind or still air); tilt; SEP by named method; Fv, Fh
  and Fmax; Bagster or a given tau; heat flux at X; distance to a heat flux
  (fixed tau, with a separate field when Bagster is on); heat flux vs
  distance from just past the flame, with Bagster refusals left as counted
  gaps.
- **Explosion.** TNT equivalent of a fuel mass or a TNT mass; Z;
  overpressure; distance to an overpressure; overpressure vs distance over
  the fit's Z range.
- **Harm.** Thermal (eisenberg, tsao-perry, lees, purple-book), toxic (pb-
  and lees- presets) and overpressure (hsc) probits, each dose carried over
  from its tab or typed; probability, probit and dose; a note when P is
  below the CDF's 1.5e-7 accuracy.
- **Refusals by field.** A refusal is printed in the engine's words (which
  start with its field name) and the field it names is outlined. A linked
  input whose upstream step is refused says so and names the step.
- **Stated on screen:** not modelled (two-phase, puff, urban, dense gas,
  jet fire, multi-energy, Kingery-Bulmash, unconfined spreading); the
  Facilities point-source radiation is a separate screening model; the
  Kinney and Graham Z range is a judgement; the TNT energy band; the YB
  6.6.3 viscosity erratum beside the viscosity field.
- **The opening study** is a benzene release into a 1,415 m2 bund whose fire
  step IS the YB 6.6.3 worked example (4.58 kW/m2 on screen, printed 4,581
  W/m2) and whose gas release is the YB hydrogen case (15.3 kg/s). The hole,
  vapour pressure, charge and exposure times are illustrative and say so.
- **Charts** on the Suite standard (white chartTheme, ChartLogo).

## Persistence

`ps_consequence_studies` (migration 20260919234000), the ps_lopa_studies
pattern: one row per study, scoped to the ORGANIZATION, payload jsonb holds
the inputs only, results are recomputed on open. RLS through the live
helpers (is_org_member, has_org_role, is_super_admin; definitions re-read
2026-09-19). Rows are stamped and opened through `src/lib/stateVersion.js`
(kind `ps-consequence-study`).

Rollback-wrapped dry run against the linked project, 2026-09-19: PS0 seed,
this table and the tile activation in one transaction under real JWT
subjects, 17/17 checks, and the tile migration alone is a no-op without the
seed. Re-read afterwards: no module row, no Process Safety tile, no ps_*
table. Details in the MIGRATIONS.md rows.

Not done here (as at PS1): registration with the .pld portability families
and the org data export.

## Pricing

None. The module was priced at PS1 (1,999, migration 20260919230000), and a
module price includes its apps. The registration test pins that PS2 adds no
price.

## Tests

- `src/utils/processSafety/__tests__/consequenceStudy.test.js` (35): the shim
  is the vendored engine and exports no Facilities point-source function;
  published goldens through the studio's import path (YB 6.6.3 pool fire to
  1e-12 from the default study, PB CO plume and probit, YB hydrogen); blank
  is absent; unit factors; chaining; search states; refusals; save/restore.
- `src/utils/processSafety/__tests__/consequenceStudiesService.test.js` (6).
- `src/pages/apps/__tests__/consequenceModellingStudio.smoke.test.jsx` (17):
  every tab mounted, regime flip, refusals by field (hole, Bagster band,
  overhang, kJ/kg TNT energy, Z range), the published pool fire and CO
  probit on screen, carried over values, the help guide.
- `src/components/processsafety/__tests__/consequenceCopy.test.js`: owner
  copy rule over every PS2 user-facing file.
- Registration: `processSafetyRegistration.test.js` (route, table, tile,
  no pricing, two-app showcase, MIGRATIONS rows).

## Owner steps, in order

1. PS0 and PS1 steps first if not yet done (ProcessSafety-PS1-STATUS.md):
   the PS0 seed `20260919200000` with the upload that ships the hub.
2. Apply `20260919234000_ps2_consequence_studies.sql` (not deploy-gated).
3. Upload the build carrying
   `/dashboard/apps/process-safety/consequence-studio`, and serve that route
   on the deployed site.
4. Apply `20260919235000_ps2_activate_consequence_tile.sql`.
5. Then the NextGen H4 go-live, held until the route serves.

No function deploy and no pricing step.
