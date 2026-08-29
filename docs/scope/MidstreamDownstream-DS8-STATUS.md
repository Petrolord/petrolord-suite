# Energy & Utilities Efficiency Studio (DS8) — status

Phase: DS8 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds8)

Track C's opener, and the app that turns the module's carbon doctrine
into arithmetic.

## Doctrine 3, as arithmetic

Every saving on the register is priced twice — in money and in tonnes of
CO2e — **from the same energy, in the same run, through one fuel cost
and one emission factor**. The two ledgers cannot disagree because there
is only one number behind them.

The abatement cost per tonne is computed and **handed on** rather than
ranked here: ranking measures into a marginal abatement cost curve is
DS9's job, and duplicating it would produce two rankings that could
differ.

## Combustion is an atom balance, not a chart

Air required, flue gas produced and the excess air implied by a measured
stack oxygen all come from the carbon, hydrogen, oxygen and sulfur in
the user's own fuel analysis and the oxygen content of air — **0.20946,
not the rounded 0.21**.

- **Fuel inerts are carried through** to the flue gas. A fuel gas with
  thirty percent inerts has a very different flue gas from one without,
  and the nitrogen still has to be heated up the stack.
- **Excess air is solved** from the oxygen reading rather than taken off
  the usual shortcut. The guard test puts the oxygen back into the dry
  flue gas the solver also computed and checks it comes out the same.
- The result is stated to assume **complete combustion**, because an
  oxygen reading alone cannot see carbon monoxide, and a stack making CO
  reads as if it had more excess air than it has.

Independently verified: **17.04 kg air per kg of fuel** and **15.0
percent excess air at 3 percent stack oxygen** — both exactly where a
combustion engineer expects them, from an atom balance that was not
tuned to hit them.

## Every efficiency declares its basis

An efficiency on LHV and one on HHV differ by close to ten points for
the same heater on the same day (this engine returns **89.88 percent on
LHV against 81.07 on HHV** for the shipped case). Quoting one as the
other is the single most common error in this field.

So the basis is carried through the calculation, not just labelled:

- On **HHV** the latent heat of the water made from hydrogen is a real
  loss, because HHV counted it as available.
- On **LHV** only the sensible heat of the vapour is a loss, because LHV
  never counted the latent heat at all.

And the app **refuses outright** to compare two efficiencies on
different bases.

## The three things it will not supply

- **The radiation and convection loss.** It comes off a published chart
  against surface area and firing rate.
- **The minimum safe stack oxygen.** Below some excess air a burner
  makes carbon monoxide, and where that point sits depends on the
  burner, the fuel and the draught control. Given a target below the
  declared floor the app **blocks and explains**, rather than quietly
  clamping to something it decided was safe.
- **A failed trap's discharge coefficient.** It depends on the orifice
  and on how the trap failed, and a default would put spurious precision
  on a figure that is already an estimate.

## Steam, and the term everyone forgets

Trap loss is **choked** flow: above a pressure ratio of about two it
depends on the upstream pressure and not at all on what is downstream,
which is why a trap blowing into a condensate header loses much the same
steam as one blowing to atmosphere. It scales with **area, not
diameter** — twice the hole is four times the leak.

Condensate is worth more than its heat. It is treated water, so losing
it costs fuel to reheat the makeup, the raw water, **and the treatment
again**. The treatment is the term routinely left out of these business
cases, so it is asked for separately and the value is called a **floor**
until it is supplied.

## This is not EII

The Solomon Energy Intensity Index is a proprietary benchmark with its
own standard-energy methodology and a subscription behind it. Computing
something similar and labelling it EII would be wrong in a way that
matters commercially.

What this computes is the plant's **own** energy per tonne of
throughput, compared against whatever peer figure the user supplies and
has the right to use. The disclaimer travels with the result rather than
sitting in the UI.

## Pinch targets, from first principles

The minimum hot and cold utility for a stream set is a **result**, not a
correlation, and the Problem Table Algorithm that finds it is short
enough to write correctly. Temperatures are shifted by half the approach
so that any exchange feasible in shifted space is feasible in real
space; the surplus is cascaded down the intervals; the most negative
point is the hot utility, and the point that becomes zero once it is
added is the pinch.

Pinned by identities rather than by remembered numbers:

- the **energy balance closes to zero** at every approach tested
- both utilities are **monotone** in the minimum approach
- `Qh − Qc` is **invariant** in the approach, because the streams are
- the cascade is **never negative** and **touches zero exactly once**
- a **threshold problem is reported as one** rather than given an
  invented pinch
- no cold streams gives zero hot utility, and vice versa

**Literature anchor.** The published four-stream problem returns
**Qh = 107.5 kW, Qc = 40 kW, pinch at 90 / 70 C at a 20 degree
approach** — reached independently by this implementation. It is
labelled in the test as the one remembered answer rather than an
identity, precisely because that is what makes it valuable.

## A real correction

The engine's own comment claimed that subtracting the efficiency
percentages **overstates** the fuel saving. It **understates** it.

Fuel is duty over efficiency, so the saving is
`(e_target − e_current) / e_target`. The shortcut divides that same gap
by a hundred instead of by the target efficiency, and since the target
is below a hundred the shortcut comes out **smaller**. It is the safer
of the two errors and it is still an error: it is how a tuning project
gets turned down on a business case that was never right.

Caught by the test that asserted the wrong direction. The doc comment,
the `method` string and the test were all corrected.

## Verification

- Jest **414 suites / 6105 tests green** — 63 on the engine, 17 on the
  page.
- `npm run build` clean.
- `20260830000000` (persistence) **APPLIED** after a rollback-wrapped
  dry run; probe shows RLS enabled with one owner policy.
- `20260830010000` (tile to Active) **HELD** for the DS8 upload.

## Open

- **Literature gate**: the four-stream pinch anchor should be cited
  against its published source when the owner supplies the reference.

## Next

DS9, the Carbon Footprint & Abatement Studio: the roll-up of the dual
ledger the other apps already produce — Scope 1 and 2 inventory from the
same stream and fuel data, carbon intensity per tonne of product, and a
marginal abatement cost curve that ranks the measures DS8 and the rest
of the module hand it.
