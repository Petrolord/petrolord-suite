# Flare Gas to Value Studio (DS10) — status

Phase: DS10 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds10)

The module's tenth app, its bridge back upstream, and the last of the
program.

## What it does

A volume of gas is being burned for nothing. This screens the handful of
routes that would turn it into something — compressed gas, mini LNG,
liquids extraction, power — against **the gas that is actually there**
rather than the gas a brochure assumed, prices each one, and says what
recovering it would really abate.

Today this is done in an ad-hoc spreadsheet, one per bidder, rebuilt for
every parcel.

## The claim this app exists to stop

**You cannot claim a flare's whole emission as abatement unless the gas
is never burned.** Recover it and sell it and the customer burns it,
emitting CO2 in a truck instead of at the flare tip.

The abatement is the **difference against a stated counterfactual**, and
the direction is not predictable:

| Counterfactual | Against the flare's gross figure |
|---|---|
| The product displaces a dirtier fuel | **Larger** — the diesel no longer burned is abated too |
| The product displaces the same gas | **Equal** — only the flare itself is abated |
| The product displaces nothing | **Smaller**, and it can go negative |

Three different answers from one flare. So a gross claim is **not a
conservative shortcut**; it is simply a different number from the right
one, in a direction nobody can guess in advance.

The app therefore reports **no abatement at all** until the
counterfactual is declared — what the product displaces, and what
burning it emits.

## Most of a flare is often what it fails to burn

Flaring emits CO2 from the carbon that burns and methane from the carbon
that does not, and methane is far worse per tonne. On the shipped parcel
at **92 percent destruction, the methane slip carries 47 percent of the
flare's CO2e**.

That is why the destruction efficiency is a **required input**: for a
flare it is most of the answer, and it is contested. CO2 is computed
from the carbon in the gas atom by atom, and the test proves the two
products account for every carbon atom between them.

## The gas, characterised rather than assumed

- **Liquids content** — gallons of recoverable hydrocarbon per Mscf — is
  the number that decides whether extraction is even a conversation, and
  it is **derived** from the composition and the component liquid
  densities (moles in a thousand cubic feet, times molar mass, over
  liquid density) rather than read off a table.
- **CO2 is tracked separately from inerts as a whole**, because a
  liquefaction train cares about CO2 specifically: it freezes in the
  cold box and must come out first.
- A component with no liquid density is **named and left out**, not
  counted as nothing.

## Screening has three states, not two

A route **passes**, **fails**, or is **not fully screened**.

A requirement with no limit set is reported as **unchecked, not
passed** — an unset limit is not a satisfied one, and treating it as one
is how a route clears screening nobody actually did. A failure names
which requirement failed, what the gas is, what the limit was, and by
how much it missed, because "not feasible" is not an answer anybody can
act on.

The limits themselves **ship unset**: a licensor's CO2 limit is a design
choice and the minimum viable volume moves with the market, so shipping
numbers would be shipping somebody else's project as if it were a rule.

## Economics that stop where they should

- **Recovery is required** per route. It is a process design outcome
  rather than a property of the gas, and a recovery quietly assumed at
  100 percent is the optimism that sinks these business cases.
- **Capital scales by DS4's power law**, imported rather than
  reimplemented, and the exponent comes back with the answer.
- **Valuation is handed on.** Capital, operating cost and revenue are
  assembled into a cash flow for the sanctioned economics engine. A
  second discounted cash flow in this module would be a second answer.

## The credit question a bid actually turns on

Whether the project **needs** credits is a different question from what
they are worth. One that clears its hurdle without them is robust; one
that only clears with them is a bet on a credit price, and those are
different things to put in front of a board. The app says which it is
and names the price at which the case turns.

It will not price credits off a gross flare figure at all: a credit
computed from an abatement that cannot be substantiated is a credit that
cannot be issued.

## Routes that fail stay in the table

A route screened out is **kept in the bid comparison with its failure
named**, rather than dropped. A route missing from a comparison reads as
one nobody considered, and in a bid that is the difference between
thorough and careless.

The ranking is on gross margin per Mscf, which ignores the capital
entirely, and the app says so beside the number.

## A real correction

The engine header claimed the abatement is "usually much smaller than
the flare's gross emissions". The test proved it can be **larger** —
displacing diesel abates the diesel as well.

Both the doctrine in the module header and the user-facing warning text
were corrected to say what is actually true: the abatement is neither
reliably above nor below the gross figure, and that is precisely why the
counterfactual is required rather than optional.

## Verification

- Jest **418 suites / 6228 tests green** — 43 on the engine, 15 on the
  page.
- The **route guard was extended** to assert all ten seeded tiles are
  routed, now that the module is complete.
- `npm run build` clean.
- `20260830040000` (persistence) **APPLIED** after a rollback-wrapped
  dry run; probe confirms all six Track B/C tables have RLS enabled with
  one owner policy.
- `20260830050000` (tile to Active) **HELD**.

## The module is complete

DS0–DS10 are all shipped and merged. **Eleven tile migrations** (the DS0
seed plus DS1–DS10) are HELD together for the one prod upload that ships
the module build; every persistence migration is applied and safe
pre-deploy.

## Open

- The prod upload, and the eleven held tile migrations that go with it.
- Owner staging E2E across the ten apps.
- **Literature gate (DS8)**: the four-stream pinch anchor wants a
  citation against its published source.
