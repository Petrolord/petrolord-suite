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
- Noise is a screening indication: use it to know whether the question
  needs asking, not to answer it.

## Open

- Tile seed migration 20260829710000 HELD for the prod upload.
- ARMED literature gate: published ISA 75.01 worked examples and the
  full IEC 60534-8-3 noise method (owner PDFs).
