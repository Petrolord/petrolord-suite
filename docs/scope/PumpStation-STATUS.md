# Pump Station Designer — status

Phase: Facilities F10 (Facilities-ROADMAP.md §3 app 10, §5 F10)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f10)
Slug: `pump-station-designer` — a fresh slug. This is the other half
of the F0-retired `compressor-pump-pack`, which printed
`Head: 450 ft` and `NPSHa: 12 ft` as literal strings and stays
Archived with its route redirecting.

## The organising idea

A pump has no operating point until it is connected to something. The
system curve and the pump curve are separate objects here, and the
duty point is **solved as their intersection** rather than assumed.
That is what makes every follow-on question honest: change the system,
the trim or the speed and the point moves, and so do the power, the
efficiency and the suction margin.

## What it carries, and why

- **NPSH available from the real suction side**, judged against the
  customary margin (the larger of 3 ft and 35 percent of required)
  rather than bare equality — because NPSHr is itself measured at a
  three percent head drop, so a pump at NPSHa = NPSHr is already
  cavitating a little.
- **Hydraulic Institute viscosity corrections.** A catalogue curve is
  a water curve; at a few hundred centistokes a centrifugal loses
  roughly half its efficiency, and past the correlation's range the
  engine says the service wants a positive-displacement pump instead
  of extrapolating a correction that has stopped meaning anything.
- **Operating region relative to best efficiency**, with what each
  costs named: recirculation and short seal life below 70 percent,
  steeply climbing NPSHr above 120 percent. A pump that works and a
  pump that works for a fortnight look identical on a datasheet.
- **An impeller trim under-delivers what the affinity laws promise**,
  because a cut impeller no longer matches its casing, and the
  shortfall grows with the depth of the cut. The studio shows the
  ideal and the real side by side.

## Two results the engine exists to make visible

1. **Two pumps in parallel are not twice one pump.** On a
   friction-dominated system the head rises with the square of flow,
   so the second machine can buy barely thirty percent more. The
   engine solves the combined duty rather than doubling.
2. **A pump whose shutoff head is below the system's static head
   cannot start that system at all.** The engine says exactly that
   instead of returning a number.

## Validation

`@petrolord/engines` PR #86, vendored, shim at
`src/utils/facilities/engine/pumps.js`. Oracle routes: the quadratic
curve fit by **Cramer's rule** against Gaussian elimination here, and
separately by **residual orthogonality** — the defining property of a
least-squares solution, which matching arithmetic cannot fake; the
duty point by a **two-million-point scan** plus refinement against
bisection; power through **SI watts** rather than the 3960 field
packaging; NPSH from a **pascal pressure balance**. 17 gates; engines
suite 1995 green.

## Honest limits (stated in-app)

- A selection and troubleshooting tool, not a vendor performance test
  on a specific machine.
- The curve is a quadratic fit to catalogue points: three points
  support a quadratic and nothing more, and the fit quality (R
  squared) is reported so a poor one is visible.

## Open

- Tile seed migration 20260829690000 HELD for the prod upload.
- ARMED literature gate: published HI 9.6.7 worked examples (owner
  PDFs).
