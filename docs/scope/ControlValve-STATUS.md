# Control Valve & Choke Sizing — status

Phase: Facilities F11 (Facilities-ROADMAP.md §3 app 11, §5 F11)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f11)
Slug: `control-valve-sizing` — a fresh slug. The F0-archived
`control-valve-sizer` stub (one of the 30 zero-code Coming Soon rows
the honest catalog archived) stays archived; this app shares its
subject and nothing else.

## The organising idea

A control valve is the one item of process equipment whose ordinary
sizing equation **stops working exactly when the service gets
difficult**. Past a certain pressure drop the flow chokes: the vena
contracta reaches vapour pressure on liquid or sonic velocity on gas,
and further drop produces no further flow. Size on the full stated
drop past that point and the valve is badly undersized, because the
equation credits a pressure drop the valve cannot use.

So the studio puts the boundary first, reports which side of it each
flow case sits on, and uses the allowable drop when the service is
choked.

## What it carries

- **Liquid**: Cv against the allowable drop FL²(P1 − FF·Pv), with FF
  from the published form.
- **Cavitation kept distinct from flashing.** If the liquid recovers
  above vapour pressure the bubbles collapse and destroy trim; if it
  does not, the flow is two-phase from the valve onwards and an
  anti-cavitation trim does nothing, because there is no collapse to
  prevent. Different problems, different valves.
- **The cavitation index**, because damage begins well before choking
  and a valve can be quietly eroding at a duty that looks stable on a
  Cv calculation.
- **Gas**: the pressure-drop ratio against the terminal ratio, with
  the expansion factor falling linearly to **exactly two thirds** at
  choking and then stopping.
- **Valve authority**, which decides whether a loop can control at
  all, and the published characteristic-selection rule that follows
  from it (equal percentage exists to cancel the installed-curve
  distortion that low authority causes).
- **Travel at three flows**, because a valve sized only for the
  maximum can sit almost on its seat at turndown where the
  characteristic collapses — a failure a single-point Cv calculation
  never shows.
- **An aerodynamic noise indication** banded on pressure ratio and
  stream power, explicitly labelled as screening rather than a dBA
  number pretending to be an IEC 60534-8-3 prediction.
- **The API RP 14E outlet velocity limit**, reused from the validated
  production `chokePerformance` engine: a valve that sizes correctly
  on Cv can still erode its own body.

## Validation

`@petrolord/engines` PR #87, vendored, shim at
`src/utils/facilities/engine/controlValve.js`. Oracle routes: the
liquid choking boundary located by **bisection on the regime flag**
rather than by evaluating the closed form, with Cv checked either
side; the gas expansion factor checked against a **march of x values**
up to and past the terminal ratio, confirming Y falls linearly to 2/3
and then stops; equal-percentage travel checked by **round trip**
through the characteristic law. 15 gates; engines suite 2011 green.

## Honest limits (stated in-app)

- FL and xT by valve style are **published table values**, offered as
  defaults with the style named; a vendor number for a specific trim
  always wins.
- Piping geometry factors are inputs, because they depend on the
  reducers actually installed.
- Noise is a screening indication: use it to decide whether the full
  IEC 60534-8-3 method is needed, and let that method give the answer.
- 2026-09-18, engines #214 vendored (Suite PR fix/revendor-facilities-copy-sweep):
  the flashing warning, the noise note and the noise threshold basis are
  reworded to the owner copy rule. No number, key or branch moved. The help
  guide's noise section and the Valve style hint follow the new wording.

## Open

- Tile seed migration 20260829710000 HELD for the prod upload.
- ARMED literature gate: published ISA 75.01 worked examples and the
  full IEC 60534-8-3 noise method (owner PDFs).

## FC8-0 repair, 2026-09-16 (engines PRs #204 and #205)

**THE CAVITATION SCREEN WAS SWITCHED OFF BY AN EMPTY BOX.** `liquidValve`
computed `sigma = pvPsia > 0 ? (p1 - pv) / dp : Infinity` with `pvPsia`
defaulting to zero, and this studio read the Pv box through
`num(inputs.liquid.pvPsia, 0)`. So CLEARING THE Pv BOX supplied exactly
that default, an infinite index took the last branch of the regime
ladder, and every liquid service at every pressure drop printed Sigma
"n/a" beside Regime "stable" IN GREEN, with no warning. The screen the
module exists for did not run. A liquid sizing with no vapour pressure
is now refused by name, on all three cases.

**AND THE TRAVEL VERDICT WAS COMPUTED OVER CHECKS THAT DID NOT RUN.**
`travelCheck` returned `pass: true` having performed zero checks: a
missing minimum flow skipped the near-seat rangeability check silently
and this studio printed "Verdict: WORKABLE" in green. It now counts its
checks and withholds the verdict.

### What a user sees change, at this studio's own shipped defaults

| screen | before | after |
| --- | --- | --- |
| Cv at each flow, with Pv cleared | Regime "stable" in green, Sigma "n/a" | a named refusal on all three cases |
| Travel tiles | 58 %, 89 %, 99 % | **58.3 %, 89.1 %, 99.4 %**, matching the one decimal the engine warnings beside them print |
| Travel verdict | CHECK | CHECK, with "3 of 3 checks ran" |
| Travel verdict, with a flow box cleared | **WORKABLE** in green | **NO VERDICT**, naming which checks did not run |
| Travel at maximum, with the box empty | "beyond the valve" in red | "not given" |
| Body velocity limit | a limit and no velocity to compare it with | actual velocity, percent of the limit, and the margin |
| Aerodynamic noise | ratio and band | ratio, **stream power in kW**, mass flow, and where the band came from |
| Recommended characteristic | "equal percentage" | "equal percentage", plus a warning when it disagrees with the trim selected |

Cv at the defaults (19.56, 65.19, 97.79), sigma (3.90) and the regime
("stable", correct here because Pv is stated) are unchanged.

### Inputs added

- **Piping geometry factor Fp**, which was persisted into every saved
  study, divides into every required Cv and had no field anywhere: over
  0.5 to 1 it moves the Cv by 50 percent.
- **Outlet bore (in)** and an **erosional C factor** selector, because
  the Body velocity limit card computed an RP 14E limit and never
  computed an actual velocity, so the check it advertised could not fire
  on any input at all, and it applied a two-phase continuous-service C
  factor to a single-phase liquid without saying so.
- An empty Pv, gas gravity, z or k box now refuses rather than meaning
  the engine's default.

### Honest limits added

The ISA Reynolds number factor FR is named as NOT CARRIED, so every
liquid sizing states that it is fully turbulent. The `fd` valve style
modifier is deleted rather than left in the table read by nothing: its
only consumers are FR and the IEC 60534-8-3 method, neither of which is
here. Every FL, xT, sigma threshold, authority threshold and noise band
is labelled as this engine's stated choice.
