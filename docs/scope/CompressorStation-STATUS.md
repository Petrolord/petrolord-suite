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
- **A driver cannot beat the first law.** A heat rate below the
  2544.4336 Btu in one horsepower-hour was reported as a thermal
  efficiency above 100 percent, up to 254443 percent at a heat rate of
  1. The fuel card now refuses below that figure and accepts it at the
  boundary. (The floor was 2544.43 until the FC3-0 vendor below, which
  took it from the engine's own exact constant.)
- **The discharge limit the user typed is now checked.** The engine
  chose the stage count from the suction temperature for every stage
  and then ran every stage after the first from the intercooler outlet,
  so an intercooler that leaves the gas warmer than the suction ran the
  later stages hotter than the stage count allowed for. Its own hot
  stage warning was measured against a fixed 300 F rather than the limit
  in the box, so it stayed silent on exactly those cases. **The app's own
  default state has the approach above the suction (110 F against
  100 F)**: at a 250 F limit two of three stages finished at 253.1 F with
  no warning at all. The studio named the stages that finished above the
  limit that was typed. **This was a display-layer defence rather than
  the repair**, and it was removed by the FC3-0 vendor below once the
  engine repair landed.
- **A numeric gate.** `src/contexts/__tests__/compressorStudioContext.test.jsx`
  asserts numbers for this app for the first time, including a
  regression gate that the negative ratio limit no longer takes the page
  down.

## Open

- Tile seed migration 20260829670000 HELD for the prod upload.
- ARMED literature gate: a published GPSA Chapter 13 worked example
  (owner PDFs).
- Engine-side items C1, C2, F1 and G2 are CLOSED by engines PR #197,
  vendored below.
- The `operatingRegion` and `zAt` sentences the engine now returns are
  rendered verbatim, and two of them speak in engine vocabulary
  ("this module", "the DAK validity range") on a user-facing card. Left
  as canonical rather than deviated from, and raised upstream instead.

## FC3-0 vendor: engines PR #197 (2026-09-16)

Vendored canonical `4fa37e6`, engines PR #197, the rotating-equipment
repairs. It was deliberately held out of the previous vendoring pass
because it moves a live studio answer rather than only golden fields, so
it got its own blast radius.

**The grid.** 5 rates x 6 suction pressures x 6 discharge pressures x 4
suction temperatures x 5 intercooler approaches x 5 discharge limits,
filtered to a discharge above the suction: **17000 duties**, each solved
through the whole studio composition (train, machine screen, driver fuel,
inlet volume, first-stage card) at both commits.

**What moved, and why.**

| Answer | Duties moved | Named cause |
| --- | ---: | --- |
| Stage count | 4295 of 17000 | `stageCount` now tests each trial count at the inlet that count's stages will really have |
| `governedBy` | 3020 | the same; mostly "both equally" becoming "discharge temperature" |
| Ratio per stage, every stage discharge temperature, every stage z | 4295 | consequences of the count, and **zero** where the count held |
| Total brake power at 0 dp | 5539 | 4295 from the restaging, 1244 more from a uniform ratio of 1.0000178451 crossing a rounding boundary: the gas constant (1.0000009059) times the standard base (1.0000169392) |
| Inlet volume at 0 dp | 11100 | one standard base for the module: 14.7 psia and 520 degR became 14.696 and 519.67, a uniform ratio of 1.0003627367 |
| Machine recommendation | **0** | the ratio above is far inside the 500 and 3000 acfm thresholds |
| Refusals | **0** | every new engine guard sits behind the studio's own `dutyIssue` door |
| Driver thermal efficiency at 1 dp | **0** | moved by 1.0000014061 at the bit, which is below the card's precision |

**The staging move, characterised rather than counted.** All 4295 are
increases, never decreases, spread 2 to 3 (1470), 3 to 4 (1555), 4 to 5
(670) and on out to 7 to 8, with one 2 to 4. **Brake power falls in
every single one of the 4295**, because an extra stage is an extra
intercooler and intercooling is what buys the power back. Before the
repair, some stage finished above the limit the user had typed on 4295
duties, the worst by **98.8 F** (5 MMscfd, 15 to 1400 psig, 60 F
suction, 130 F intercooler, 300 F limit). After it, on **0** of 17000.

The headline case the vendoring brief carried reproduces exactly, with
the parameters it did not name: 20 MMscfd, 114.7 to 1014.7 psia,
intercooler 110 F, **suction 90 F, k 1.26, gas gravity 0.65, polytropic
efficiency 0.78, mechanical efficiency 0.97**. 2 stages at 3110.26 bhp
becomes 3 stages at 2954.77 bhp. On the app's own untouched default
state (20 MMscfd, 85 to 985 psig, 100 F, 110 F approach, 300 F limit)
the count does not move: 3 stages both ways.

**Controls, chosen before the sweeps were run.** Six, of which five
predicted zero flips and returned zero:

- C1, an intercooler at or below the suction (729 duties): the repaired
  `stageCount` reduces to the old one there. **0 flips, bit for bit.**
- C2, single-stage duties (1224): a single stage is never cooled.
  **0 flips, bit for bit.**
- C3, the machine recommendation over all 17000 duties: **0 flips**, with
  a negative control proving the check discriminates. Sweeping the rate
  at 0.001 MMscfd across the 500 acfm threshold flips the recommendation
  at 2 of 19001 rates, so a zero here is a result and not a blind gate.
- C4, C5 and C6 are on the pump side; see PumpStation-STATUS.md.

**The doubled warning, removed.** The studio's own `dischargeLimitCheck`
was added in Suite PR #491 to compensate for the very defect #197
repairs. With the repair in, it fired on **0 of 17000** duties where it
previously fired on 4295, so it could only ever have printed a second
sentence for a condition the engine now prevents. It is gone from the
context, the panel and the value object. What survives is the engine's
own per-stage warning, now measured against the limit in the box rather
than a hardcoded 300 F, and two tests prove that path is live: a stage
at a ratio of 3.4 finishing at 340.1 F warns against a typed 250 F and
says nothing under a typed 400 F. An 81-train sweep gates the claim that
no stage finishes above its typed limit.

**Also in this pass.** The studio's `MIN_HEAT_RATE_BTU_HP_HR` is now
imported from the engine's `lib/units/fieldUnits.js` (shim added at
`src/utils/facilities/engine/fieldUnits.js`) rather than restated as
2544.43. Two owners of one constant left a band between 2544.43 and
2544.4336 in which the studio accepted a heat rate the engine then
refused. The first-stage detail card is now handed `maxDischargeF`, so
its warning is measured against the typed limit like every stage in the
train.
