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
