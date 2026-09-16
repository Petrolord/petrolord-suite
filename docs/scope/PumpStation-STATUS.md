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

## FC3-0 repairs (2026-09-16)

Found by the NextGen FC3 course build
(`/root/fc-wip-rotating/FINDINGS.md` section S) and repaired in
`src/contexts/PumpStudioContext.jsx` and the panels. **The vendored
engine is untouched**; the engine-side findings in that file are routed
to the engines repo.

- **S1. Two answers for one change, and the change was applied twice.**
  The studio scales the whole pump curve and re-solves the crossing with
  the system. The "what a change would buy" card then applied the
  engine's affinity and trim laws on top of the duty that already
  trimmed curve had produced. At a 20 percent trim the card read 752 gpm
  and 137 ft while the chart marked 984 gpm at 236 ft, and the card's
  point did not even sit on the curve the chart drew. **The duty
  headline, the chart and the summary rail were always the correct
  numbers.** The card now starts from the duty before the change and
  keeps three quantities apart: the duty before, the duty after as a
  fresh crossing with the same system, and where the old duty point
  lands on the changed curve, which sits on the pump curve without
  sitting on the system curve.
- **S2. One trim law.** The context carried its own copy of the trim
  shortfall model and applied it to head but not to flow, so it
  disagreed with the engine it sits on. The curve is now scaled by
  factors read out of `impellerTrim` and `speedChange` at unit duty,
  which makes the curve law and the point law the same law and carries
  an engine repair through automatically. Duty flow falls by up to 2.6
  percent on trims deeper than 5 percent and does not move at all above
  that.
- **S3. Named refusals at the door.** Motor efficiency is bounded to
  (0, 1] with the shaft power still computed and only the motor figures
  refused, because the shaft side never depended on it. A trim ratio
  above 1 now carries the engine's own refusal instead of quietly
  scaling the impeller up. A speed ratio outside 0.5 to 1.5 is named as
  an extrapolation rather than refused, because it is computable. A
  fitted curve that does not droop no longer produces a duty point, so a
  flat curve reported as a perfect fit refuses instead of printing a
  flow and a head as headline figures.
- **S4. A numeric gate.** `src/contexts/__tests__/pumpStudioContext.test.jsx`
  asserts numbers for the first time in this app, including the
  agreement test S1 needed: the point the card reports must lie on the
  curve the chart draws.

## Open

- Tile seed migration 20260829690000 HELD for the prod upload.
- ARMED literature gate: published HI 9.6.7 worked examples (owner
  PDFs).
- Engine-side, routed to the engines repo rather than patched here:
  the unbounded motor efficiency and speed ratio in `pumps.js` itself,
  `npshCheck` returning `severity: 'adequate'` with `pass: false` for an
  NPSHa it could not read, `dutyPoint` answering on a curve `fitPumpCurve`
  has just warned about, `viscosityCorrection` changing its return shape
  between branches, and the module header's misstatement of the margin
  rule as a ratio rule.
