# Fiscal truth completion (Economics E1) — status

Phase: Economics E1 (Economics-ROADMAP.md §6 E1)
Status: **SHIPPED 2026-08-29** (branch feat/economics-e1)

## What E1 was for

The D series declared `supabase/functions/_shared/epe-engine.ts` the
module's single fiscal source of truth and reconciled the client engines
it knew about. The 2026-08-29 re-audit found two it had missed: a fifth
fiscal engine inside the Probabilistic Breakeven Analyzer and a sixth
inside FDP. E1 retires both and reconciles the Fiscal Regime Designer,
which D1 had repaired but never checked against canonical semantics.

Every claim below is gated by a test, and the tests are written as
**ledger identities and parity relations** rather than as remembered
numbers, because a fiscal model that does not conserve money is wrong
whatever a golden value says.

## The defects found, in order of severity

### 1. The Fiscal Regime Designer was losing the cost oil entirely

Recovered cost was subtracted from profit oil and then credited to
nobody. It did not reach the contractor and it was not counted to the
government. Contractor take plus government take came to less than
revenue minus costs by exactly the amount recovered, every year.

On a routine case that is hundreds of millions of dollars a year simply
vanishing from the comparison the app exists to make, and it biased every
regime against the contractor. Cost oil is now paid to the contractor,
which is what a production sharing contract does and what both canonical
engines already did.

Gated by: contractor take plus government take equals revenue minus
costs, to eight decimal places, on a flat regime and again under a
sliding scale royalty with tiered R-factor splits, RRT and a minimum tax.

### 2. The Fiscal Regime Designer could never recover operating cost

The cost pool was seeded with capex and nothing was ever added to it.
Operating cost was charged as cash but was permanently unrecoverable.
Both canonical engines put the full cost outflow into the pool. This one
now does too, with the unrecovered balance carried forward.

### 3. Payback was reported one full year early, module-wide

The screening engine counted from the year *before* the crossing year.
A project spending 100 in its first period and earning 150 in its second
pays back 1.67 years in; it was reported as 0.67. The same off-by-one
appeared in both FDP copies. Fixed at source in `npvCalculations.js` and
gated with a hand-computable case.

### 4. FDP economics had no fiscal terms at all

Both FDP NPV implementations computed revenue minus operating cost and
called it NPV. No royalty, no tax. On ordinary Nigerian terms that
overstates project value by roughly forty percent, and it was the number
on a card labelled "NPV @ 10%". Both call sites now build their case in
`src/utils/fdp/economics.js` and run it through `calculateEconomics`.

FDP's IRR was also an unbracketed Newton-Raphson that returned whatever
it drifted to on a cash flow with no sign change. It is bisection now,
and an IRR that does not exist is reported as null rather than invented.

### 5. The Breakeven Analyzer was not reproducible, and mis-sampled

Three separate problems in a gated, sold app:

- It sampled with a bare `Math.random()`, so it gave a different answer
  every run and nobody could reproduce a number they had shown a board.
  Sampling is seeded now, the seed is a visible input, and it travels
  with the result and into the export.
- It treated the stated P10, P50 and P90 as a triangular distribution's
  minimum, mode and maximum. Those are percentiles, not endpoints.
  Doing that deletes the outer twenty percent of the distribution and
  understates every downside case. The percentiles are now fitted to a
  triangular whose CDF genuinely passes through all three points.
- Its tornado plotted one side of each swing, so symmetric uncertainty
  looked one-sided. Both sides are returned and drawn.

It also carried its own flat-royalty, flat-tax NPV with capex forced to
time zero. That is gone; it calls `calculateEconomics`.

## Parity results

- **Fiscal Regime Designer vs the screening engine**: on a regime both
  can express, the two produce **identical annual contractor cash flows**,
  and their NPVs differ by **exactly (1 + r)^0.5** — one half year of
  discounting, because this engine discounts year-end like EPE and the
  screening engine discounts mid-year. Gated, so the convention
  difference can never again be mistaken for a bug or drift into one.
- **FDP vs the screening engine**: NPV agrees to nine decimal places
  with a directly constructed `calculateEconomics` case.
- **Breakeven vs the screening engine**: the solved price, fed back in,
  zeroes the engine's NPV to six decimal places.

## New shared primitives

`src/lib/monteCarlo.js` gained two, both tested:

- `mulberry32(seed)` — the seeded generator. An economics result that
  cannot be reproduced cannot be defended in a review.
- `fitTriangularToPercentiles(p10, p50, p90)` — solves the triangular
  through three stated percentiles in shape-then-scale form. Only the
  mode position sets the shape, so the ratio (p50-p10)/(p90-p10) fixes
  it by one bisection; the range and origin then follow in closed form.
  The reachable ratio band is about 0.382 to 0.618, and a median outside
  it is clamped **and said so** rather than silently mis-fitted.

## Also removed

`src/utils/fdp/optimizationCalculations.js` and
`src/utils/fdp/analyticsCalculations.js`, both zero-importer. The first
carried a function called `calculateNPVObjective` whose comment claimed a
discounted sum and whose body computed one year of revenue minus twenty
years of opex, undiscounted. The second fabricated a correlation matrix
with `Math.random()`.

## Open

- `src/services/fdp/OptimizationService.js` still returns
  `Math.random()` well counts and a hardcoded "+15.4% NPV" behind a
  fake delay. It is reachable from the optimization module. **E3** owns
  it, along with the rest of the FDP slim rebuild.
- The FDP economics panel still runs on an illustrative production
  profile and price deck; the panel now says so in the UI. E3 replaces
  it with the plan's own profile.
