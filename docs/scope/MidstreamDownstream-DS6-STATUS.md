# Fuel Pricing & Supply Chain Studio (DS6) — status

Phase: DS6 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds6)

Track B's second app, and the one with no analogue anywhere in the
incumbent stack.

## What it does

A litre of petrol at a forecourt began as a cargo priced off a marker in
dollars per tonne. Between the two sit a freight rate, an ocean loss, a
duty, a fistful of statutory charges, an exchange rate, a truck, and
several margins set by regulation. The whole trade turns on whether the
sum of them clears the price the market or the regulator allows.

That build-up is done today in a spreadsheet per importer, rebuilt from
scratch whenever a rate changes, with no audit trail and no way to ask
what happens at a different exchange rate. This makes it a model.

## The rates are not shipped, and that is the design

Duties, levies, statutory charges and regulated margins are set by
regulation, they differ by market, and they change. A number baked into
the app would be read as authority and would go stale in silence, which
is worse than no number at all.

So the templates ship the **line items**, which are stable, with the
rates **absent and required**. A build-up missing a rate is reported as
incomplete and its total is labelled a **floor, not a cost**. An
understated landed cost is not a small error in this business; it is the
error that loses the cargo.

The disclaimer is carried **as data** rather than as UI copy, so it
travels with any template that is copied, exported or screenshotted.

## The order of the build-up is part of the answer

A charge levied as a percentage of CIF depends on what CIF already is,
so the stages are walked in sequence — FOB, C&F, CIF, landed — and every
line declares the base it bites on. Charges at the same stage cannot
inflate each other's base, which is asserted directly: adding a fixed
per-cargo charge must not move the duty.

Reordering the lines changes the number. That is exactly why the order
is data here rather than an accident of how a spreadsheet grew.

## Ocean loss divides, it does not add

You pay for the bill-of-lading quantity and you sell the outturn
quantity. If half a percent evaporates in transit, the cost of what you
can actually sell rises by `1 / (1 - 0.005)`, not by `1.005`.

The two differ by a hair on one cargo and by real money over a year, and
the wrong one is the one usually written down. The test asserts the
right identity **and asserts against the wrong one**, so the mistake
cannot creep back. The same logic runs on the truck: cost per litre is
divided by what is delivered, not by what was loaded.

## What it reports

- **The margin waterfall by recipient** — how much of the litre is the
  product, how much is government, how much is the chain. That is the
  question actually being asked whenever a pump price is argued about in
  public. Elements with no recipient named are grouped as
  **unattributed** rather than assigned to anybody.
- **A cap named as a shortfall.** A regulated cap below the build-up
  does not make the cost disappear; it creates a gap somebody in the
  chain is absorbing, and naming that number is the point.
- **The exchange rate at which the cap breaks**, solved by bisection on
  a chain that is **re-priced at each rate rather than scaled**, because
  only part of the build-up is in dollars. Where the price never crosses
  the cap in the range searched, the app says **no crossing** rather
  than returning an endpoint dressed up as a breakeven.
- **Lane economics with trips per truck derived from the cycle**, not
  assumed. It is the cycle, not the distance, that decides how the fixed
  costs spread — so a slow lane correctly carries more capital cost per
  trip than a fast one of the same length. A model taking trips per year
  as an input can be tuned to produce any answer wanted.
- **Fleet size that rounds up**, because a fraction of a truck does not
  exist, with the spare that rounding bought reported rather than
  buried: it is the argument for whether the last truck is owned or
  hired.
- **Station sizing that calls DS5's rack queue** rather than writing a
  second Erlang C that could disagree with the first — a forecourt and a
  loading rack are the same system in different units — and that checks
  the **ullage at the reorder level against the delivery payload**. That
  is the arithmetic nobody does until a full truck has been turned away
  from the forecourt twice.
- **Carbon from the same diesel burn that priced the trip.** The
  emission factor is an input; absent it, the carbon figure is absent
  and said to be.

The lane's own cost per litre is **offered** for the transport line
behind a button rather than written into it, because silently
overwriting a rate the user typed is how a build-up stops meaning what
its author thinks it means.

## A real bug found and fixed

The route was wired at `fuel-pricing-studio`. The DS0 seed creates the
tile at `fuel-pricing-supply-chain`.

The dashboard builds every tile's URL as
`/dashboard/apps/${module}/${slug}` from the `master_apps` row, so this
would have shipped a **tile linking into a 404** — and nothing would
have caught it. The app mounts, its own fifteen tests pass, the build is
clean, and the only symptom appears after the tile migration is applied
in production.

Fixed, and a **new guard** (`src/pages/apps/__tests__/downstreamRoutes.test.js`)
now asserts that every routed slug under the module, and every `appId`
it is gated on, matches a slug the seed actually creates. The guard was
verified by reintroducing the real bug and watching it fail.

## Verification

- Jest **410 suites / 5939 tests green** — 58 on the engine, 15 on the
  page, 4 on the route guard.
- `npm run build` clean.
- `20260829960000` (persistence) **APPLIED** after a rollback-wrapped
  dry run; probe shows RLS enabled with one owner policy.
- `20260829970000` (tile to Active) **HELD** for the DS6 upload.

## Next

DS7, the LPG & CNG Rollout Studio: bottling-plant and storage sizing and
cylinder-fleet logistics for LPG; mother and daughter station design,
compression power, cascade storage and dispensing capacity for CNG; and
the conversion economics against petrol and diesel with the payback and
the emissions avoided.
