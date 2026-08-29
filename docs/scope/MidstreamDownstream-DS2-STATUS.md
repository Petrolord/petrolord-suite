# Product Blending Optimizer (DS2) — status

Phase: DS2 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds2)

The module's second application, and the first consumer of the LP kernel
built at DS0.

## What it does

Given the components in a pool, their costs and their qualities, it
finds the cheapest recipe that meets every specification. That is a
continuous decision rather than a menu, so it is a linear programme:

- **minimise** the cost of the components used
- **subject to** the volume required (an equality), every specification
  (a row each), and each component's floor and ceiling **as bounds**
  rather than as extra rows

## Every specification declares how its property blends

This is the modelling decision, and it is visible rather than buried.

| Basis | Meaning |
|---|---|
| `volume` | Mixes linearly on volume. |
| `mass` | Per unit mass (weight percent, ppm). Weighted by density. **Using volume for sulfur reports a blend as on-spec when it is not.** |
| `index` | Does not mix linearly at all. Linearised through a stated index, blended, inverted. |

All three stay linear in the decision variables, which is what keeps the
problem an LP rather than something needing a different solver.

The achieved properties are **recomputed after the solve** by each
spec's own rule, independently of the constraint rows. Agreement between
the two is asserted in the tests, so it is a check rather than a
tautology.

## What it reports, which is the point

- **Which specifications bind.** The binding set is what is stopping the
  blend getting cheaper.
- **Quality giveaway.** How far inside each limit the blend sits. Half a
  point of octane over a month is real money and it is invisible unless
  someone measures it. Where a unit value is supplied the gap is priced;
  where it is not, the gap is still shown **without a price**, because a
  giveaway figure built from a guessed unit value is worse than none.
- **The shadow price of every constraint**: what one unit of relief on it
  would save. Often the most useful number on the screen, because it is
  the argument for a waiver, a different crude, or an octane investment.
- **Infeasible as a real answer.** No mixture of these components can
  meet these limits, so a limit has to move or the pool needs a component
  that can reach it. The app says that rather than returning a recipe
  that misses.
- **A specification it could not apply**, because not every component
  carries the property, is reported as **not applied** rather than
  silently dropped. Dropping it would return a recipe that appears to
  meet a spec nobody checked.

## What it refuses to guess

Octane does not truly blend linearly: a component's effective octane
depends on the pool it sits in, which is why refiners carry measured
**blending** octane numbers rather than neat ones. The published index
methods are coefficient tables, and this package does not reproduce
published tables from memory.

So: a supplied blending octane number is used as given, and a neat
octane is blended linearly **and labelled as the approximation it is**.
The same applies to cetane, and the ASTM D4737 cetane index is not
implemented for the same reason.

The RVP index exponent is a **named, overridable parameter** rather than
a constant buried in the code, because refiners tune it to their own
pools and a value that influential should be visible.

## A real defect found in the DS0 LP kernel

Writing the shadow-price test found a genuine bug in the kernel shipped
two phases ago.

`readShadowPrices` recomputed each row's column offsets from the count
of constraint rows. But finite upper bounds add their **own rows** to
the tableau, and those take slack columns too. So with any bounded
variable the artificial-column offset landed past the real column, and
**every equality row priced at zero**.

In this app that meant the marginal cost of a barrel of product read as
nothing, on a problem where the total-volume row is an equality and
every component is bounded — that is, on every problem this app solves.

Fixed at source: `buildTableau` now **records** each row's slack and
artificial column as it assigns them, and the reader uses those indices
instead of recomputing offsets, which removes the whole class of error.
Three regression tests are pinned in the kernel's own suite.

It was caught by asserting a shadow price against the objective change
from **actually re-solving with the row relaxed**. Nothing weaker would
have caught it: the value returned was a plausible zero.

## The specification templates

Four shapes ship (two gasolines, a gasoil, a fuel oil) so nobody starts
from an empty table. Every limit is editable, and every template carries
a line saying **the regulation in force governs, not the template**.
Fuel specifications are set by regulation, differ by market and change;
this app is not a compliance oracle and says so in the UI, in the help
guide, and in the engine source.

## Verification

- Jest **401 suites / 5736 tests green** — 29 on the engine, 10 on the
  page, 21 on the LP kernel including the new regressions.
- `npm run build` clean.
- `20260829880000` (persistence) **APPLIED** after a rollback-wrapped dry
  run; probe shows RLS enabled with one owner policy.
- `20260829890000` (tile to Active) **HELD** for the DS2 upload.

## Next

DS3, the Refinery Planning & Scheduling Studio: the same LP kernel at
configuration scale, on the shared stream model built at DS0, carrying
the plan, the schedule and the actuals in one data model so variance is
a subtraction rather than a reconciliation project.
