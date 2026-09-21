# Flow Metering Designer — status

Phase: Facilities F12 (Facilities-ROADMAP.md §3 app 10, §5 F12)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f12)
Slug: `flow-metering-designer` — a fresh slug, seeded by
20260829750000 (HELD).

## The organising idea

The orifice flow equation is the easy half of a metering study and the
only half most tools compute. What a custody transfer argument is
actually about is **how well the number is known, and which term in the
budget is worth spending money to improve**. So the uncertainty budget
is a tab of its own, not a footnote.

## What it carries

- **The discharge coefficient computed from Reader-Harris/Gallagher**,
  not assumed at 0.61. Across the practical range of beta and Reynolds
  number it spans about seven percent, which is many times the
  uncertainty anybody disputes in a measurement argument. The studio
  plots it against Reynolds number so the reader sees it move.
- **Plate bore solved for a target flow** at a design differential by
  bisection on beta, with the expansibility factor for compressible
  service and the permanent pressure loss the plate costs for good.
- **The full uncertainty budget**: every input propagated with the
  sensitivity the flow equation gives it (bore squared and again
  through the beta term, differential and density as square roots,
  coefficient directly), root-sum-squared, ranked by share of
  variance, with **the dominant term named**. That naming is the
  actionable part: a more precisely bored plate buys nothing when the
  differential transmitter dominates.
- **The turndown effect**, which is the most misunderstood thing in
  gas measurement. A transmitter is accurate to a fixed fraction of
  its span, so as the reading falls that fixed absolute error becomes
  a larger fraction of the reading. At ten to one turndown a 0.075
  percent-of-span transmitter contributes 0.75 percent of reading and
  swamps the budget. This single fact is why an orifice run has a
  usable turndown of about three to one.
- **Straight-run requirements** by beta and upstream fitting, stated
  as the published table values they are, with two elbows in different
  planes correctly the worst case because of the swirl they induce.

## Validation

`@petrolord/engines` PR #88, vendored, shim at
`src/utils/facilities/engine/metering.js`. Oracle routes: the orifice
mass flow computed **entirely in SI** (kg/s from Pa and kg/m³) against
the module's field-unit form, so the `32.174` and `144` packagings are
checked rather than trusted, agreeing to 5e-7; the Reader-Harris/
Gallagher coefficient recomputed with the terms grouped differently;
and the root-sum-square uncertainty checked against a **200,000-sample
Monte Carlo propagation** — an entirely different way to propagate
error — agreeing within 0.2 percent, with the dominant term correctly
flipping from the discharge coefficient to the differential pressure as
the DP uncertainty rose. 22 gates across both F12 engines; engines
suite 2035 green.

## Honest limits (stated in-app)

- No AGA-8 compressibility: bring your own density.
- No ultrasonic or Coriolis meter models, no proving beyond applying a
  meter factor, no wet-gas correction.
- The flange-tap correlation is published for beta 0.1 to 0.75 and the
  studio says so rather than pretending outside it.

## Open

- Tile seed migration 20260829750000 HELD for the prod upload.
- ARMED literature gate: AGA Report No. 3 / ISO 5167 worked examples
  and the published uncertainty tables (owner PDFs).

## FC8-0 repair, 2026-09-16 (engines PRs #204 and #205)

**THE BUDGET AND THE TRANSMITTER WERE TWO ROUTES THAT NEVER MET.**
`transmitterUncertaintyPct` computed 0.15 percent from the reading and
the span; `orificeUncertainty` used a TYPED 0.5 percent and could not
accept a reading or a span at all. Both were displayed in adjacent cards
on this screen. Worse, the budget put the discharge coefficient at 64.7
percent of the variance while the engine header, the engine note and
this studio's own body copy all said the differential transmitter
dominates. The budget now takes the reading and the span and DERIVES its
differential term, and the three claims are corrected: which term leads
is a result and it depends on where the run sits in its span.

**AND A DIFFERENTIAL TURNDOWN WAS JUDGED AGAINST A FLOW TURNDOWN RULE.**
Flow goes as the square root of the differential, so the customary
three-to-one FLOW rule is a NINE-to-one differential turndown. The
warning fired about five times too early and the tile said "Turndown"
with no qualifier above a paragraph repeating the flow rule.

### What a user sees change, at this studio's own shipped defaults

| screen | before | after |
| --- | --- | --- |
| Total uncertainty | 0.6217 % | **0.5741 %** |
| Dominant term share | 64.69 % of variance | **75.85 %**, with a NEW runner-up tile (expansibility, 12.14 %) |
| Differential term | 0.5 % typed | **0.150 %**, from the transmitter, with the derivation shown |
| Turndown tile | "2.0 to 1" | **"Differential turndown 2.0 to 1"** and **"Flow turndown 1.41 to 1"** |
| The plate a target flow needs | bore 3.6841 in, no warning | bore 3.6841 in **with the "beta above 0.6" warning the engine attached to it**, plus a stock-bore note |
| Meter run, "Two elbows, different planes" | 75 diameters | **withheld**, with the reason |
| Coefficient chart caption | "across the full beta range it spans about seven percent" | the measured span at THIS beta, plus the published Reynolds floor named as not carried |
| Uncertainty budget inputs | a typed "Differential (%)" box | removed: it was a second answer to a question the transmitter answers |

Mass flow (31,696 lb/hr), the discharge coefficient (0.602409), the
permanent loss (73.87 in H2O), the sized bore and beta, and the
single-elbow straight run (18 diameters) are unchanged.

### Honest limits added

The published lower Reynolds limit of the Reader-Harris/Gallagher
correlation is named as NOT CARRIED, and it travels with every
coefficient, because this studio's chart sweeps from 10^3.5 which is
below it. The ISO 5167 / AGA 3 straight-run column for two elbows out of
plane is WITHHELD: it returned 34, 50, 75, 65, 60, 80 diameters across
its own breakpoints, falling by 15 as beta rose and then rising by 20,
which no published table does. Nothing is answered above beta 0.75 now
either: it used to fall through to the last row and return 44 diameters
at beta 0.95. `turbineVolume` states that its volume is gross and that
the API MPMS corrections are not carried, so it is not a custody
transfer quantity.
