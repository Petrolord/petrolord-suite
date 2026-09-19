# Terminal & Depot Studio (DS5) — status

Phase: DS5 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds5)

Doctrine 4's application, and the first of Track B.

## The case it is built for

Terminal automation packages assume a meter on every arm, automatic tank
gauging, and a historian behind both. Most terminals in these markets
have a dip tape, a strapping table and a spreadsheet.

This app is built **for that terminal**, not for a lesser version of a
terminal waiting to be upgraded into the real product. Everything starts
from a dip.

## Stock, from a dip

- **Strapping tables interpolate but never extrapolate.** A dip above the
  last table entry returns nothing and says why. Extrapolating a
  strapping table invents capacity the tank does not have, and the tank
  is the one physical thing in the whole calculation that is certain.
- **Free water is subtracted**, because it is not product and nobody is
  paid for it.
- **The volume correction factor is refused, not guessed.** API MPMS
  Chapter 11.1 is a published coefficient table, and this package does
  not reproduce published tables from memory. So the *form* is
  implemented with the coefficient row as a **required input with no
  default**, and a terminal that has its own tables can type the VCF
  directly instead. Given neither, the app reports **gross observed
  volume and says that is what it is** — which is exactly what the dip
  measured.

Reporting an uncorrected volume as if it were standard volume is the
error that makes a terminal look short in summer and long in winter.

## The reconciliation names the gap

Opening stock plus receipts minus deliveries gives book stock; the dip
gives physical stock; the difference is **unaccounted for**. The app
reports it rather than balancing itself, because gain and loss is what
the operator is judged on and it is the number that tells you a meter is
drifting or a valve is passing.

**Tolerance is applied to throughput, not to stock.** Measurement error
scales with what moved, so a fixed percentage of a stock figure flags a
busy month and excuses a quiet one — backwards in both directions.

**Trending** separates one day of noise from a run worth investigating:
a persistent one-sided bias is a different finding from scatter of the
same magnitude, and only the first is a leak or a meter.

## The rack is a queue, not a capacity

Loading bays are a queueing system, so utilisation alone is misleading:
**a rack at 85 percent utilisation does not have 15 percent spare, it
has a queue.** Erlang C is derived here from the Erlang B recursion
rather than read off a published chart, so the result is computed rather
than remembered.

When arrivals exceed service capacity the app says **the queue grows
without limit** rather than reporting a steady-state average that does
not exist. An average wait for an unstable queue is a number with no
referent, and it is the number a spreadsheet gives you.

Working capacity is reported **net of the heel**, since the heel is
never available.

## Money and carbon from the same volumes

Throughput economics and loading emissions are computed from one set of
volumes, so they cannot disagree. The **emission factor is an input**,
and where it is absent the carbon figure is absent and said to be,
rather than defaulting to zero.

## A real bug found and fixed across all six downstream engines

`Number(null)` is `0`. So is `Number('')`. The obvious numeric coercion
therefore turns a **missing** value into a real zero:

- a dip nobody read became an empty tank
- an emission factor nobody supplied became zero carbon
- a missing free-water reading became a confident "no water"

Every downstream engine now uses a strict coercion where **missing stays
missing** (`NaN` by default, so it propagates and is caught rather than
silently arithmetically valid), pinned by its own `describe` block.

This is the same class of error the Economics series spent phases
removing, and it crept back in through a one-line helper copied between
engines. It is recorded here because the fix is easy and noticing is
not.

## Verification

- Jest **407 suites / 5861 tests green** — 39 on the engine, 11 on the
  page.
- `npm run build` clean.
- `20260829940000` (persistence) **APPLIED**; probe confirms RLS enabled
  with one owner policy.
- `20260829950000` (tile to Active) **HELD** for the DS5 upload.

## MD3-0 validation and repairs (2026-09-19)

Before the NextGen course MD3 (engines #221, vendored at 60ee266; findings in
`packages/engines/tools/validation/downstream/FINDINGS-supply.md`).

- **The day could never show a gap.** This page had no opening-stock input.
  It set the opening stock to today's dip less today's net movement and
  handed that to the reconciliation, which then expected exactly the dip. The
  unaccounted figure was zero for every tank, every day and every input, and
  the terminal always read balanced. The page now takes the opening stock
  (yesterday's closing stock) as an input; blank, the day cannot be closed and
  the banner says so in amber. The sample opening stock (4,068 m3) makes the
  sample day close 3 m3 short, inside tolerance.
- The engine now refuses a dip below a strapping table that does not start at
  the empty tank, a water cut it cannot convert or that sits above the dip,
  and 0 or fractional bays; counts pumpable stock tank by tank; and gives no
  emissions for a loss with no density (the page also invented a density of
  800 kg/m3, now removed).
- Tests: page tests pin the -3.0 m3 loss and the refusal with no opening
  stock; both fail on the old page.
- MD3-1 (the NextGen course foundation's findings): days of cover are now
  counted on liftings (6.3 days at the sample, where receipts plus deliveries
  gave 2.8), and only a loss, never a gain, is counted towards emissions. The
  engine refuses a 0 minute load time and a blank throughput or fee.

## Next

DS6, the Fuel Pricing & Supply Chain Studio: import-parity landed cost
and the pump-price build-up, margin by product, depot-to-station
trucking economics and station throughput sizing — with duty and levy
rates as **user-supplied template data** rather than constants shipped in
the code, because they are set by regulation and they change.
