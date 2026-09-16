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

## FC3-0 repairs (2026-09-16)

Found by the NextGen FC3 course build
(`/root/fc-wip-rotating/FINDINGS.md` section S) and repaired in
`src/contexts/CompressorStudioContext.jsx` and the panels. **The
vendored engine is untouched.**

- **Every typed box is checked at the door, by name.** The compression
  engine guards about half of its inputs and hands the rest straight to
  the arithmetic, so the studio was reachable from the keyboard to a
  wrong number stated confidently. A maximum ratio per stage of 1 gave
  an infinite stage count and then a refusal naming four inputs that
  were all correct; **a negative one threw a TypeError out of the engine
  and took the whole page down**, which is new here and was not in the
  findings file. A polytropic efficiency of 0 or 1.5, a suction
  temperature below absolute zero and a discharge limit below absolute
  zero all produced the same refusal telling the user to intercool
  harder. A mechanical efficiency of 0 gave an infinite brake power and
  a negative one gave a negative brake power. Each of these now refuses
  by name, and every refusal names the box the user typed in.
- **A driver cannot beat the first law.** A heat rate below the 2544.43
  Btu in one horsepower-hour was reported as a thermal efficiency above
  100 percent, up to 254443 percent at a heat rate of 1. The fuel card
  now refuses below that figure and accepts it at the boundary.
- **The discharge limit the user typed is now checked.** The engine
  chooses the stage count from the suction temperature for every stage
  and then runs every stage after the first from the intercooler outlet,
  so an intercooler that leaves the gas warmer than the suction runs the
  later stages hotter than the stage count allowed for. Its own hot
  stage warning is measured against a fixed 300 F rather than the limit
  in the box, so it stays silent on exactly those cases. **The app's own
  default state has the approach above the suction (110 F against
  100 F)**: at a 250 F limit two of three stages finish at 253.1 F with
  no warning at all. The studio now names the stages that finish above
  the limit that was typed. **This is a display-layer defence, not the
  repair**: staging on the temperature the stages will actually see is
  an engine change and is routed to the engines repo.
- **A numeric gate.** `src/contexts/__tests__/compressorStudioContext.test.jsx`
  asserts numbers for this app for the first time, including a
  regression gate that the negative ratio limit no longer takes the page
  down.

## Open

- Tile seed migration 20260829670000 HELD for the prod upload.
- ARMED literature gate: a published GPSA Chapter 13 worked example
  (owner PDFs).
- Engine-side, routed to the engines repo rather than patched here:
  staging against the temperature the later stages actually see (C1),
  the hot-stage warning measured against the caller's limit rather than
  a fixed 300 F (C2), the guards that would make the studio's door
  checks redundant, the two values of the gas constant between
  `compression.js` and the `gasProperties.js` it imports from (F1), and
  the absence of a DAK validity-window refusal that `separatorSizing.js`
  in the same package does carry (G2).
