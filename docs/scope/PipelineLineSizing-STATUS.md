# Pipeline & Line Sizing Studio — status

Phase: Facilities F1 (Facilities-ROADMAP.md §3 app 2, §5 F1)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f1)
Slug: `facility-network-hydraulics` (kept — it carries live
entitlements; the tile RENAMES via the HELD migration
20260829530000). Routes for the retired `pipeline-sizer` and
`pipeline-designer` redirect here.

## What shipped

- **Engine** (`@petrolord/engines` PR #77, vendored by subtree, shim at
  `src/utils/facilities/engine/lineHydraulics.js`): liquid
  Darcy-Weisbach + Colebrook-White (laminar branch, regime flag); the
  four published gas transmission forms (Weymouth, Panhandle A/B,
  General Flow with first-principles Reynolds) with the standard
  elevation adjustment and a bisection outlet-pressure inverse; Barlow
  wall thickness under the B31.4/B31.8 design-factor families with
  MAOP round-trip; pigging estimates (swept volume from a SUPPLIED
  holdup, run time, catcher-limited interval). Validated against an
  independent stdlib SI oracle implementing the published SI-form
  constants (two published routes meeting): 15 gates, engines suite
  1835 green.
- **Composition layer** `src/utils/facilities/lineSizing.js` (no new
  physics): wires the engine to the Suite's golden-tested Beggs &
  Brill (`nodal/correlations/beggsBrill`), the DAK z-factor
  (`gasProperties`), RP 14E (`chokePerformance`) and the checked pipe
  schedule. 33 jest gates, including a cross-implementation check
  (nodal Moody vs engine Colebrook within 2 percent on the same line),
  the dead-liquid single-phase collapse, and the FC2-0 repair gates
  below.
- **Studio** `src/pages/apps/PipelineLineSizingStudio.jsx` +
  `src/components/linesizing/` + `src/contexts/LineSizingContext.jsx`
  on the studio kit (StudioLayout/ProjectManager/AutoSave/Help). Tabs:
  Line Sizing (liquid/gas/multiphase with the every-bore sweep table +
  chart and per-row RP 14E verdicts), Profile (segment editor +
  hydraulic gradient chart, marched in the active mode's physics),
  Wall Thickness (Barlow + MAOP + adequacy verdict), Pigging (holdup
  fed straight from the Beggs & Brill answer or typed). ChartFrame +
  watermark standard; help guide; 2 smoke tests.
- **Persistence**: `saved_linesizing_projects` (migration
  20260829520000, APPLIED live, MIGRATIONS.md logged). Inputs only;
  results re-derived on load.
- **Fluid Studio hand-off restored** (removed at F0 because it fed the
  mock Pipeline Sizer): "Send to Line Sizing Studio" passes the
  backbone via location.state; the studio prefills oil gravity, gas
  gravity and temperature and lands on the multiphase mode.
- **Deleted**: `src/pages/apps/FacilityNetworkHydraulics.jsx`,
  `src/components/facilitynetworkhydraulics/` (its untested Beggs &
  Brill twin and engines superseded),
  `src/utils/facilityNetworkHydraulicsCalculations.js`, and the
  orphaned `src/utils/pipelineSizerCalculations.js` (its Colebrook
  role is now carried, validated, by the engine).

## FC2-0 composition-layer repair (2026-09-16)

Four defects in `src/utils/facilities/lineSizing.js`, found by the
NextGen FC2 course build and recorded in
`/root/fc-wip-linesizing/FINDINGS.md` section S. The vendored engine was
NOT touched; the engine defects in that file's sections A to E are
separate and still open.

- **S1, the sweep recommendation (user-visible).** It returned the first
  PASSING ROW IN TABLE ORDER and called it the smallest passing bore.
  The schedule table runs by nominal size then schedule, which is not
  monotonic in bore (a heavier schedule is a smaller bore, and it sits
  after the lighter one), so on a 12000 bpd 10000 ft duty 7 of 10
  velocity caps were recommending the wrong size, e.g. 6 in sch 40
  (6.065 in) where 6 in sch 80 (5.761 in) also passed. Now the smallest
  passing bore, ties on the thinner wall then the smaller OD. The rule
  is exported (`RECOMMENDATION_RULE`) and stated in the table note and
  the help guide.
- **S2, the invented density.** `gas.z || 1` and `gas.rhoLbFt3 || 1`
  made a zero or unreadable gas density into 1 lb/ft3 and reported an
  RP 14E verdict against it. Removed; the gas sweep asks for the density
  once up front and refuses by name.
- **S3, the discarded convergence flag.** The layer took
  `naturalGasZ`, which throws away DAK's `converged`. It now calls
  `dakZ` directly, refuses on non-convergence, AND refuses outside the
  correlation's published window (1.0 <= Tpr <= 3.0, Ppr <= 30), which
  is the check that matters: DAK reports converged at Tpr 0.711 with
  z = 0.293. Ppr below 0.2 stays allowed (near-ideal, z tends to 1).
- **S4, the inlet gradient over the whole line. MARCHED, deliberately.**
  The one-shot form under-reported a 50000 ft drop by 9 percent, which
  would have been disclosable, but it also reported a gassy 40000 ft
  line as arriving at 55 psia when marching shows its pressure reaching
  atmospheric 20659 ft in. A simplification that turns an undeliverable
  line into a deliverable-looking one cannot be fixed by stating it.
  Explicit Euler, steps sized to 0.25 percent of inlet pressure, about
  46 ms for a full 12-bore sweep, step residual under 0.1 percent.

Results that moved: sweep recommendations where a heavier schedule of
the same nominal size also passes; every multiphase drop, upward (under
1 percent short, several percent long and gassy); pigging swept volume,
which now reads the length-weighted `avgHoldup` rather than the inlet
holdup; and cold, very high pressure or zero-gravity gas cases, which
now refuse where they used to answer.

## FC2-0b RP 14E binding-point repair (2026-09-16)

The erosional check was made at the INLET mixture velocity while the
fastest point of a gas-carrying line is downstream, so a line that
erodes at its far end was reported as passing: a fail-open on an
integrity limit rather than on a number.

The check now runs where the limit binds. Because the limit is
Ve = C / sqrt(rho_m), the ratio is v * sqrt(rho_m) / C, so the binding
station is the one maximising v * sqrt(rho_m) and is the same station
for every C factor; `multiphaseLine` finds it while marching.

**The binding point is not simply the outlet.** On a descending line the
pressure recovers, the gas is compressed and the mixture slows, so the
limit binds at the INLET (ratio 0.1950 against 0.1814 at the outlet on a
20000 ft, -1500 ft line). Using the true maximum covers both, and a
profile that falls and then rises binds in the middle.

Blast radius over six representative sweeps (72 rows) at C = 100: one
row flips from pass to fail, 6 in sch 40 on a gassy 20000 ft duty, inlet
ratio 0.524 against 1.159 where it binds at 99 percent of the length
(29.8 ft/s at the inlet, 146.0 ft/s at the far end), and that sweep's
recommendation moves from 6 in sch 40 to 8 in sch 80. At C = 125 nothing
flips. Liquid lines and lines with no gas are unmoved by construction.

## FC2-0c gas-mode binding point (2026-09-16)

The gas sweep evaluated velocity and the RP 14E limit at the MEAN of
inlet and outlet pressure, so the app answered the same physical
question two different ways depending on the mode. Fixed the way FC2-0b
settled it, by applying the principle rather than re-deriving it.

For a gas line velocity goes as z / p and density as p / z, so the
severity v * sqrt(rho) goes as **sqrt(z / p)** and rises as the pressure
falls. Measured: severity divided by sqrt(z/p) is constant to the digit
across a line (858.3 at both ends of one bore), which is the derivation
confirmed rather than assumed. The mean understates the ratio by 19 to
39 percent on a 30 mi line and by 1.8 percent on a 5 mi one.

The binding station is searched for, not assumed. `gasErosionalAlongLine`
walks the line in 12 stations by applying the published transmission
equation to each sub-length, exactly as `gasLineTraverse` already does,
so no physics is added to the layer. In every gas line that could be
built here the binding station came out at the OUTLET, because friction
keeps the pressure falling even on a 4000 ft descent, unlike the
multiphase descending case where it binds at the inlet. The search costs
about 25 ms for a 12-bore sweep and its answer does not depend on the
station count (identical to six digits from 6 stations to 96).

Blast radius, measured before the change, over a 9 x 6 x 6 grid of rate,
length and inlet pressure crossed with all 12 bores: **13 (bore, duty, C)
combinations flip from pass to fail, 9 at C = 100 and 4 at C = 125**, and
**5 of 6 flipping duties move the recommended size**. The sharpest:
30 MMscfd, 10 mi, 900 psia, 6 in sch 40, ratio 0.620 at the mean against
1.199 where it binds, the gas going from 45.0 ft/s to 168.0 ft/s.

The CAVEAT that stood here, that the vendored `gasOutletPressure` still
bracketed at [14.7, p1], is CLEARED by the re-vendor below.

## FC2-0 engine re-vendor (2026-09-16)

The engine-side half of FC2-0 landed in the engines repo as PR #196, and
PR #195 landed behind it. `packages/engines` moves from canonical
`709172f` to **`fa53f7f`**, thirteen paths, verified byte for byte
against the canonical clone across all 740.

**`gasOutletPressure` no longer clamps to the inlet.** Every published
transmission form is driven by `p1^2 - es p2^2`, so the outlet a line
approaches as its rate falls to nothing is `p1 / sqrt(es)`, and not
`p1`. The old bracket was wrong in both directions, and the ASCENT half,
which is the commoner case and was not in the original findings, was the
worse one: the ceiling sits BELOW the inlet, the forms refuse a `p2`
above it, and the old loop read that refusal as "still too much flow"
and walked its LOWER bound up through it. Every rate a climbing line
could carry came back as the inlet with `dpPsi` exactly 0.

Measured on the studio's own 8 in, 25 mi, 800 psia, 0.65 sg line:

| elevation | 0.1 MMscfd | 1 MMscfd | 5 MMscfd | 20 MMscfd |
| --- | --- | --- | --- | --- |
| up 3000 ft | 0 to 60.1 | 0 to 60.5 | 0 to 69.4 | unchanged |
| up 1500 ft | 0 to 30.7 | 0 to 31.0 | 0 to 39.9 | unchanged |
| flat | unchanged | unchanged | unchanged | unchanged |
| down 3000 ft | 0 to -65.0 | 0 to -64.6 | 0 to -55.8 | unchanged |

(psi of reported drop, before to after, re-measured against canonical
`709172f` and `fa53f7f` for this branch.) The direction is one-way on a
climb: **the studio was under-reporting the pressure drop, and now
reports more of it.** On a descent the drop is now NEGATIVE, which is
the honest reading; the line arrives higher than it left. At 20 MMscfd
the true outlet already fell inside the old `[14.7, p1]` bracket, so
those answers are unchanged to the bit, which is the check that the
repair moved the bracket and not the arithmetic. Flat lines are
untouched by construction (`es` = 1 makes the ceiling the inlet).

Everything downstream of the solve inherits it: the gas result card's
outlet pressure, drop and gradient; every gas row in the sweep table and
therefore the recommended size; the Profile tab's gas traverse, which
marched the clamp at every station; and the FC2-0c binding-point walk,
which calls the solve once per station.

**Named refusals.** Twenty-one inputs that returned a NaN, an Infinity
or a confident wrong number now return `{ error }`. Every call site in
this app already branched on `.error`, so none of them started treating
a refusal as a number; the one change needed was in the sweep, which
collapsed every refusal to the fixed label "cannot carry the rate". Most
of the new refusals are facts about the LINE rather than the bore, so
the row now carries the engine's own words.

**One barrel.** `chokePerformance` carried the barrel truncated as
5.614583 while `lineHydraulics`, one import away in this same chain,
carried it exactly; both now import it from `lib/units/fieldUnits.js`.
RP 14E erosional rates move by 5.94e-8 relative, which is below display
precision everywhere in this app and flips no verdict.

Not one of the 37 pre-existing line-hydraulics goldens moved; the
goldens file only gained a new `outlet` group of 8 cases.

**Engines PR #195 comes with it** (a `nearFloor` flag on the separation
K value). It does not touch this app. Its effect on the Separator Sizing
Studio is recorded in SeparatorStudio-STATUS.md.

**Drift guard.** `tools/check-vendored-engines.mjs` plus
`packages/engines/VENDOR.json` and `VENDOR.manifest` now hash-join every
tracked path under `packages/engines` against canonical and fail on any
absent, extra or differing path. It is wired into CI as
`.github/workflows/vendored-engines.yml`, in `npm test` as
`tools/__tests__/vendoredEngines.drift.test.js`, and available as
`npm run check:engines`. This drift is why the repair took three weeks
to reach the app.

The comparison is against the PINNED commit in `VENDOR.json` and the
manifest committed beside it, never against engines HEAD. A guard
pointed at HEAD goes red the moment canonical moves, which it did within
the hour this branch was cut (engines #197), and it would then block
every unrelated pull request here until somebody vendored. "Canonical
has moved ahead" is reported instead by `--ahead <clone>`, which prints
the gap and never changes the exit code.

The jest suite carries the negative control, because a gate that has
never failed is not a gate: it plants a byte in a vendored file,
requires the guard to exit 1 naming that file, restores the byte and
requires green again. Proved by hand as well, on a differing file staged
and unstaged, a deleted file, an extra file, a stale ledger row, a
second drift on an already-listed row, and a ledger row that does not
say when it should be burned down.

## FC2-0d the gas card states its verdict (2026-09-16)

FC2-0c recorded that the gas result card carried no RP 14E verdict at
all, which mattered more once the gas sweep could fail a row: a user
looking at a gas result saw nothing to distinguish a line that now fails
the check from one that passes. Computing a verdict and not showing it
is close to not having one.

The gas card now carries the same verdict the multiphase card does,
from the same binding-station check the sweep uses: the ratio, the
velocity and limit at the station where it binds, how far along that
station sits, the mean-pressure velocity the old check would have shown,
and the number of stations walked, so a reader can tell it is a marched
result rather than a point check. Both cards now lead with the ratio, so
a reader does not have to know which branch they are in to read the
verdict.

The verdict is computed for the SELECTED bore in the context, so the
card and the sweep table answer with the same rule; a refusal from the
check is shown as its own message instead of an empty verdict.

## Honest limits (stated in-app)

- Single-line only: the gathering-network solve is Production Network
  Studio's (locked decision, Production-ROADMAP.md §6.2).
- Liquid rates at line conditions (dead liquid downstream of
  separation); live-oil lines belong in Flow Assurance Studio.
- Gas z is DAK at inlet (or typed); no per-segment recompute of z in
  the gas traverse yet. Outside the DAK window the studio refuses and
  says so rather than falling back silently.
- The multiphase line is marched and the step count is shown on the
  card; the multiphase pattern and holdup on the result cards are INLET
  values, with the outlet value shown alongside when it differs.
- The RP 14E check is made where the limit BINDS along the line, and
  the card names that station and its distance. This now holds in gas
  mode too (FC2-0c above); the bullet that said the gas check was still
  made at mean pressure was stale from before that repair.

## Open

- Tile rename migration 20260829530000 HELD for the prod upload.
- Literature gates for the gas-equation constants against a GPSA
  worked example remain ARMED (owner PDFs).
- ~~Engine-side defects behind this app (descending-line outlet
  pressure, unguarded roughness, efficiency and corrosion allowance, the
  two barrel constants) remain open in the engines repo.~~ **CLOSED
  2026-09-16** by engines PR #196, vendored here at `fa53f7f`. See the
  re-vendor section above; the climbing-line case was worse than the
  descending one this bullet named.
- Three pieces of live PD1 `nodal` course prose (two lessons and one
  applied migration) quote erosional rates that the one-barrel change
  makes stale at the eighth significant figure. Nothing graded moves.
  Recorded for a later recut, deliberately not touched here.
