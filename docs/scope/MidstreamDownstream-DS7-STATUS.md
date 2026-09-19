# LPG & CNG Rollout Studio (DS7) — status

Phase: DS7 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds7)

Track B's third app, and the last before Track C.

## Two fuels, one set of models

LPG and CNG look like different businesses. They share more structure
than they appear to, and the app is built on that:

- **A cylinder in circulation and a CNG trailer shuttling to a daughter
  station are the same problem** — a fleet of assets in a cycle. There
  is one `assetFloat` here, not two.
- **A bottling carousel and a dispensing forecourt are both queues**, so
  this calls the rack model built for DS5 rather than writing a third
  Erlang C that could disagree with the other two.

## The fleet model names itself

It is **Little's Law**: the number of assets in a system equals the rate
they flow through it times the time each spends in it. The cylinder
float is `cylinders per day x days round the cycle`.

Operators usually guess this number and usually guess it **low**,
because the cylinders sitting at customers' houses are invisible and are
most of the fleet. So the cycle is broken down by stage with each
stage's share, the **dominant stage is named** — nearly always the time
at the customer, and the only term the operator can actually negotiate —
the fleet **rounds up**, and spares are added **on top of** the
circulating fleet rather than counted inside it.

## The fill limit this app refuses to supply

A pressure vessel in LPG service is never filled liquid-full: the liquid
expands and a vessel with no vapour space **ruptures hydraulically**.
The maximum fill ratio is set by the code in force for the product and
the vessel.

So the app implements the arithmetic and **requires the limit, with no
default**. A default here would be a number somebody trusted, on a
safety limit. The refusal says why, so it is actionable rather than
pedantic.

The **vapour space is then reported as a figure in its own right**
rather than left as a subtraction, because it is the reason the vessel
does not fail — it is not spare capacity.

## Every property says how it mixes

Liquid density on **volume**, latent heat per kilogram on **mass**,
molar mass on **moles**. Using the wrong basis is a quiet error of
several percent that looks entirely plausible, so each result carries
the basis it was computed on.

A property missing on **any** component is reported as missing for the
whole blend rather than averaged over the components that have it: a
confident number built from half the blend is worse than an honest gap.

Component properties ship as a **labelled reference with ranges**, read
by nothing unless a caller passes one in. Molar masses are definitional
and are asserted against the atomic masses rather than remembered.

## CNG at 250 bar is not an ideal gas

Z is about 0.82 at storage pressure, so a bank holds roughly **23
percent more** gas than the ideal gas law says, and a cascade sized on
ideal gas is wrong by about a fifth in a direction nobody notices until
the station is built.

This calls the **same Dranchuk and Abou-Kassem correlation the
Facilities compression app uses** rather than a second implementation,
returns the Z it used so it can be checked against the operator's own
data, and **says explicitly when the correlation is being asked to work
outside the range it was fitted over**.

The test asserts the *mechanism* — `m = PVM/(ZRT)`, so Z below one puts
more gas in the bottle — and the convergence to ideal as pressure falls,
rather than a remembered percentage.

## Why a cascade has banks

A bank can only push gas into a vehicle **while its pressure exceeds the
vehicle's**. Once they equalise the bank is finished for that vehicle no
matter how much gas it still holds, which is exactly why a station runs
several banks at different pressures instead of one large one.

Each fill draws from the lowest bank that can still deliver and works
upward, taking from as many banks as one fill needs. Gas sitting below
the vehicle's target is reported as **stranded**, not counted as
inventory: it is real gas and the cascade cannot deliver it. A **part
fill is not a fill**, because a vehicle that leaves under-filled did not
get one, so what is left over is reported separately.

## Compression is not reimplemented

Staging, polytropic head, real-gas Z at suction and discharge,
interstage cooling and the discharge-temperature limit that usually
governs the stage count all come from the Facilities F9 compression
engine. This studio converts the station's metric inputs into the field
units that engine speaks, calls it, and converts back.

The result lands at about **0.26 kWh/kg** from 4 bar to 250 bar, which
is where station compression actually sits.

## The customer's decision

Petrol is sold by the litre and CNG by the kilogram, so comparing prices
per unit sold is meaningless. The comparison is **per kilometre**.

Where the consumption on the new fuel has been measured, that is used.
Where it has not, it is derived from energy equivalence and an
**explicit efficiency ratio, on screen** rather than hidden as a
constant — a converted engine is not necessarily as efficient on the new
fuel, and that ratio moves the answer more than the fuel price does.
Given neither, the app refuses rather than inventing a consumption.

Simple payback is reported because it is the number this decision is
made on, and is **labelled undiscounted**; the cash flow is handed over
for the sanctioned economics engine rather than valued here. Where the
switch does not pay, **no payback is reported** rather than a negative
one.

**Cheaper and cleaner are separate questions.** The studio will happily
report a switch that saves money and adds carbon, because that is a real
result and hiding it would make this an advocacy tool rather than an
analysis one. Both emission factors are required; without them the
carbon figure is absent and says so.

## A real bug found and fixed in the cascade

The sequencing picked the lowest bank whose **pressure** was above the
vehicle target. Bisection lands a hair above the target, so a bank
drained to the target still tested as usable — and was picked forever at
**zero yield**, while the fill was quietly completed out of the next
bank up. The third bank was never reached.

The symptom: **7 fills reported where 10 were available.** Delivered
gas was under-reported by 30 percent, with no error and no warning.

Fixed by judging exhaustion on **deliverable mass rather than on
pressure**, and by letting one fill draw from as many banks as it needs
instead of a two-bank special case. Pinned by two tests:

- **Conservation** — delivered plus leftover equals exactly what the
  banks held above the target.
- **Leftover under one fill** — if a whole fill were still available the
  loop stopped too early, which is precisely the bug.

It was found by sanity-checking the numbers by hand before writing the
tests, not by a test. Both tests exist now.

## Verification

- Jest **412 suites / 6024 tests green** — 67 on the engine, 17 on the
  page.
- `npm run build` clean.
- `20260829980000` (persistence) **APPLIED** after a rollback-wrapped
  dry run; probe shows RLS enabled with one owner policy.
- `20260829990000` (tile to Active) **HELD** for the DS7 upload.

## MD4-0 validation and repairs (2026-09-19)

Before the NextGen course MD4 (engines #227, vendored at f0aef14; findings in
`packages/engines/tools/validation/downstream/FINDINGS-gasvalue.md`).

- **The cascade counted only the gas above the vehicle's target.** A real
  cascade equalises the vehicle with the lowest bank first, so a bank below
  the target still does work. At the defaults: 33 fills (was 10), efficiency
  45.8 percent (was 13.9). "Stranded below target" is replaced by what is
  left in the banks, and the page says how far the next vehicle would get.
- **The vaporizer's warming term was negative at the defaults.** The page
  passed n-butane's atmospheric boiling point (-0.5 C) against a 25 C inlet,
  cutting the duty to 50.3 kW, below the 55.5 kW the boil alone needs. The
  page now asks for the boiling point at the vaporizer pressure (no
  default; blank, the duty is a floor), and the engine refuses a liquid
  entering above it.
- The fill limit has a stated basis (share of liquid volume, or a filling
  density on water capacity by weight; read as a volume, 0.42 halves the
  stock). A blank lead time or safety stock leaves the reorder point
  unstated (it was an empty vessel).
- Pressures are labelled bar(a): the engine always read them absolute.
- The bottling queue runs on the positions wholly working (it rounded to
  the nearest). The conversion case needs an efficiency ratio when it
  derives consumption (it defaulted to 1). A blank cycle stage, gas SG,
  temperature, shift, availability or k is refused rather than read as a
  default.
- Tests: page tests pin the 33 fills, the fill basis and the vaporizer
  floor and refusal.

## Next

DS8, the Energy & Utilities Efficiency Studio, and the first of Track C:
fired-heater and boiler efficiency by the indirect stack-loss method,
excess-air optimisation with the fuel saving quantified, steam-system
screening, energy-intensity benchmarking per unit, and heat-integration
targeting from the user's own stream table — with every recommendation
priced in both money and tonnes of CO2.

## MD45-1 (2026-09-19): the vaporizer outlet opens blank

- **P1, at defaults:** the vaporizer opened with inlet 25 C and outlet 15 C
  and the boiling point blank. The engine refuses a boiling point below the
  inlet and an outlet below the boiling point, so no boiling point a user
  typed could complete the duty. The outlet now opens blank beside the
  boiling point ("above the boiling point"); the duty is a floor until both
  are given. No default is invented.
- Engines #228 rewords the blend and vaporizer floor notes to the copy rule.

Gate: 1 new page test (the smoke suite is 20).
