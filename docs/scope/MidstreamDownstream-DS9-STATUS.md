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
- **Measures acting on the same source are flagged as overlapping: their abatements do not add.**
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

A wedge is drawn only for an identified measure, because a plan needs a
named measure behind every wedge; a wedge labelled "further measures" is
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

## MD5-0 validation and repairs (2026-09-19)

Validated before the NextGen course MD5 Carbon & Energy Efficiency.
Engines PR #226 (squash `5c0cb97`), vendored here; findings in
`packages/engines/tools/validation/downstream/FINDINGS-carbon.md`.

- **C1, at defaults:** the flare's destruction efficiency, left blank as
  the page intends, was read as 100 percent (2,772.6 t CO2, no methane).
  The engine refuses a blank now, and the page shows the refusal. The
  burner's box is passed as it is too.
- **C7:** the default curve claimed 9,000 t from flare gas recovery
  against a smaller flare and still said the target was met. The target
  stat now reads "not assessed" while any claim exceeds its source, and
  "met, as an upper bound" where measures interact.
- **C11:** a source the page could not compute was given an emission of
  0, and a source's methane was left out. The page now passes CO2e with
  the methane at the declared potential, and leaves out a source it could
  not compute (or whose methane has no potential yet).
- **C12, at defaults:** the target and the path were built on a partial
  inventory (the methane and electricity lines blocked), from a baseline
  of 0 when nothing computed. The page now says so in a banner, and passes
  no baseline rather than 0; blank years or a blank target reduction are
  no longer read as 2026, 2032 or 0.
- **C13:** blank capital, savings, running cost and discount rate were
  read as 0 before the engine saw them. They pass through now: a blank
  capital or rate is refused, a blank saving or cost is taken as 0 and
  named on the page.
- The path names measures with no start year; the GWP note says to name
  the horizon and that the fossil methane value is the consistent one
  with this atom balance. HELD for the owner: whether to recommend AR5 or
  AR6.

Gate: 4 new page tests (the smoke suite is 19).

## MD45-1 (2026-09-19): what the carbon course foundation found

Engines #228 (df31f53) vendored; the page follows it.

- **F1, at defaults:** the page opened saying the target was "met, as an
  upper bound": the flare is refused (blank destruction efficiency) so only
  the heaters had an emission, and the flare gas recovery and steam trap
  claims were never checked. The engine now leaves the verdict unassessed
  while any claim cannot be checked against its source. The page reads
  "not assessed" with the engine's basis ("no computed emission to check the
  claims on steam, flare") and lists each unchecked claim. Only the heaters
  and the flare carry an emission on this page, so a measure acting on any
  other source keeps the verdict unassessed; a way to enter other sources'
  emissions is a possible follow-up.
- **F3:** a refused measure is named from the curve's own refused list with
  the engine's reason, and it is kept off the path (the path scheduled it
  from the raw inputs).
- **F8:** the inventory's atom-balance lines are built by the engine's
  `atomBalanceLines`. A refused flare (or heater) is now a blocked line with
  its reason, so the inventory stays not reportable; it used to vanish, and
  with every other box filled the inventory read reportable. Flaring left out
  of the boundary is excluded and adds nothing.
- The capital-life sentence ("makes every measure look expensive") was
  untrue and is reworded on the page and in the help, as in the engine.

Gate: 3 new page tests (the smoke suite is 22).
