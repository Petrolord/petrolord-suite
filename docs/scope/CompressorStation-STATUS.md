# Compressor Station Designer — status

Phase: Facilities F9 (Facilities-ROADMAP.md §3 app 9, §5 F9)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f9)
Slug: `compressor-station-designer` — a **fresh slug**. This is the
first genuinely new app of the program: the F0-retired
`compressor-pump-pack` stays Archived with its route redirecting, per
the no-revival doctrine. That shell was fifty lines of static HTML
printing `Power: 1250 hp` as a literal string, and it is not the
ancestor of anything.

## What shipped

Engine (`@petrolord/engines` PR #85, vendored, shim at
`src/utils/facilities/engine/compression.js`) implementing the GPSA
Chapter 13 method:

- **Stage count from both limits**, the equal-ratio rule and the
  discharge-temperature limit, with the governing one named. On a hot
  suction or a high-k gas the temperature governs, and sizing on the
  ratio rule alone under-stages exactly those cases — which is how a
  machine ends up running its valves and lube oil above where they
  last. The two limits also respond to different fixes, so naming the
  binding one is the actionable part.
- **Polytropic head and power** with the exponent derived from the
  polytropic efficiency. Using the isentropic exponent where the
  polytropic one belongs is the classic error in this calculation and
  is worth roughly ten percent of power.
- **Z at suction and discharge, averaged** — it moves materially
  across a stage at pipeline pressure, and carrying the suction value
  through overstates the head.
- **Interstage cooling duty** at every stage, because that is a real
  exchanger with a real cost, and the trade is genuinely between shaft
  power and heat-transfer surface.
- **Reciprocating against centrifugal** on the published selection
  criteria only (inlet volume, ratio, power), with "either" allowed
  where both are viable rather than inventing a preference.
- **Driver fuel**, which on a gas plant comes out of the very stream
  being compressed and belongs in the sales-gas balance.
- A **discharge-pressure sweep** showing power rising smoothly while
  the stage count rises in steps: the cheap discharge pressure is the
  one just below a step, not just above it.

## A test caught a real bug

The isentropic efficiency initially carried a spurious factor,
producing a value **above** the polytropic efficiency — thermodynamically
impossible for compression, where the reheat a real machine generates
has to be recompressed. With the published relation the two power
routes now agree to 1e-12, which is the strongest available check that
neither is transcribed wrong: the actual work is the actual work
whichever idealisation computes it.

## Validation

Oracle uses genuinely different mathematics throughout: polytropic
head by **Simpson integration of the reversible work integral**
∫v dp along the polytropic path, against the closed form; discharge
temperature by a **100,000-step march**, against the closed
exponential; stage count by **brute-force search**; and power
converted through **SI watts** rather than the 33000 ft·lbf/min
horsepower packaging, so that constant is checked rather than
repeated. Agreement to 12–14 significant figures. 15 gates; engines
suite 1977 green.

## Honest limits (stated in-app)

- No machine curves, no surge line, no wheel selection, no valve
  dynamics or rod loading — those need vendor data for a specific
  frame, and a screening tool that pretended to them would be worse
  than useless.
- What the studio gives is the duty a vendor should quote against, the
  stage count and power to expect, and the reasons behind both.

## Open

- Tile seed migration 20260829670000 HELD for the prod upload.
- ARMED literature gate: a published GPSA Chapter 13 worked example
  (owner PDFs).
