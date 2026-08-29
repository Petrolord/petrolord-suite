# Carbon Footprint & Abatement Studio (DS9) — status

Phase: DS9 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds9)

Track C's second app, and the roll-up the module's carbon doctrine was
always heading toward.

## A roll-up, not a new silo

Every other app in Midstream & Downstream computes carbon beside money
from the same volumes. This one assembles those figures into an
inventory, an intensity, and a ranking of what to do about it.

It is deliberately **not** a separate ESG system fed by its own
spreadsheets once a year, because that is exactly the arrangement that
makes the carbon number disagree with the operating number.

It is also **not a compliance register**. A register tracks obligations,
evidence and deadlines, and Assurance owns that. This is the
quantitative engine that feeds one. A second register here would be two
records of the same obligation that could disagree.

## Computed and reportable are different questions

This is the app's central distinction.

An inventory can be **complete arithmetic** and still not be something
to file — a factor with no source, a line missing its activity data, a
global warming potential set that was never declared. Merging those two
questions is how a working number ends up in a regulatory return.

So the app computes what it can, states the total, and **separately**
reports whether the result is reportable and exactly which lines are the
reason it is not.

## Factors are registered, not shipped

The API Compendium and the IPCC guidelines are published documents that
get revised, and a factor without its source and version is not an
auditable number. A factor here is a **record** — value, unit, gas,
source, version, vintage.

An unsourced factor is **accepted**, because refusing outright would
make a first pass impossible. It is flagged, it is carried forward onto
the line that used it, and it blocks reportability until it is fixed.

## The potential set is the user's to declare

Global warming potentials differ between IPCC assessment reports by
enough to move a methane-heavy inventory by a fifth. An inventory on one
report is not comparable with one on another, and they are compared
constantly.

**No values are shipped.** The set carries its own label, every result
states which set produced it, and an inventory with no declared set is
not reportable whatever else is right about it. The test proves the
point directly: identical measurements through AR4 and AR5 differ by
exactly the ratio of the two methane potentials.

## Where the atom balance beats the factor

Combustion CO2 is **not an empirical factor at all**. Every carbon atom
that goes into a burner comes out as CO2. A published fuel-based factor
is a proxy for exactly that arithmetic, carrying whatever assumptions
its author made about the fuel.

So where the fuel analysis is known this computes CO2 from the carbon,
**says it did**, and gives the line a source reading "atom balance
(conservation of mass)". Factors are reserved for the things that really
are empirical.

Carbon that escapes combustion is counted as **methane**, which per atom
is a far worse greenhouse gas — the test shows that 2 percent unburned
carbon is much more than 2 percent of the impact. That is why a **flare's
destruction efficiency is required rather than assumed**: for a flare it
is the whole answer, and it is contested.

## An intensity without a boundary means nothing

Tonnes of CO2e per tonne of crude charged and per tonne of saleable
product are different numbers for the same plant, and quoting one
against another plant's other is how benchmarks get made up.

The **boundary is required**, and the result states what it may
legitimately be compared with: the same boundary and the same potential
set.

## What most abatement curves get wrong

- **Capital is annualised** over each measure's life with a capital
  recovery factor. Comparing a one-off capital cost against a recurring
  saving is the error that makes every measure look expensive, and the
  engine refuses a capital cost with no life to spread it over.
- **Measures that pay for themselves sit on the left** with a negative
  cost per tonne. They abate carbon as a side effect of saving money,
  and they are usually the ones nobody has done.
- **Measures acting on the same source are flagged as NOT additive.**
  Insulating a line and then shutting it down do not abate twice, and
  the usual spreadsheet adds them anyway. The cumulative curve is
  labelled an **upper bound** where overlaps exist, and claims that
  exceed what a source actually emits are caught separately.
- **The overlap is not resolved automatically.** Resolving it needs an
  engineering judgement about sequencing that a solver would only guess
  at, so it is surfaced for a person to make.

## The gap is named, not drawn as a wedge

Each measure counts only from the year it starts, so the trajectory is
what the **identified** measures deliver. Where that falls short, the
difference is reported as **unabated with no measure identified**, and
the first year of shortfall is named.

It is deliberately not drawn as a wedge labelled "further measures". A
wedge with nothing behind it is not a plan, and treating it as one is
how decarbonisation roadmaps stop meaning anything.

## Verification

- Jest **416 suites / 6168 tests green** — 47 on the engine (green on
  the first run), 15 on the page.
- `npm run build` clean.
- `20260830020000` (persistence) **APPLIED** after a rollback-wrapped
  dry run; probe shows RLS enabled with one owner policy.
- `20260830030000` (tile to Active) **HELD** for the DS9 upload.

## Next

DS10, the Flare Gas to Value Studio, and the last app of the module:
flared and associated gas volume and composition screened against CNG,
mini-LNG, LPG extraction and gas-to-power, with capex and opex,
economics through the sanctioned engine, and the emissions abated with
carbon-credit sensitivity. It is the upstream-to-downstream bridge, and
it consumes the abatement figures this app ranks.
