# Produced Water Treatment Studio — status

Phase: Facilities F7 (Facilities-ROADMAP.md §3 app 7, §5 F7)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f7)
Slug: `produced-water-treatment` (kept — it carries entitlements).
Tile: the HELD migration 20260829650000 both RENAMES and **ACTIVATES**
it. F0 deliberately left this tile Coming Soon because the app existed
but its engine was invented; F7 is what earns the Active status.

## What the predecessor was

`usePwtCalculations.js`: a `TECH_DB` of fixed removal efficiencies
multiplied stage by stage. An API separator always removed 60 percent
of the oil, a hydrocyclone always 90 percent, whatever the water was
and whatever the device was sized for. **Temperature and TDS were
collected as inputs and never used in the math at all** — the clearest
possible tell, because in real produced water they are most of the
story. Save and Export were toast-only stubs, and a
`setTimeout(1000)` simulated "complex calculation time".

## What replaced it

Oil in water is treated as what it is, a **droplet size
distribution** (log-normal, median and spread), and every device as
what it is, a **grade-efficiency curve with a cut size**. Removal is
the distribution integrated against the curve. Three consequences the
old model could not express, all now visible in the UI:

1. **The same device performs worse on finer water.** A datasheet
   efficiency is that device's performance on the water it was tested
   with.
2. **Three "90 percent" devices do not give 99.9 percent.** Each one
   passes on the droplets it cannot catch, so the median falls down
   the train and every stage faces harder water than the last. The
   stage table shows the median falling; that is the mechanism.
3. **Hot brine treats differently from cool fresh water.** Every cut
   size runs on Stokes, which runs on viscosity and the density
   difference. The studio warns below ~60 kg/m3 of density difference,
   the classic heavy-oil-in-hot-brine disappointment.

Cut sizes come from device physics: Stokes rise for API 421 basins
(with the horizontal-velocity re-entrainment limit) and plate packs,
centrifugal scaling for hydrocyclones **including the turndown
collapse when liners are starved** (the field goes as the square of
the flow — shut liners in rather than running them all half fed),
bubble attachment for flotation with a residence-time floor, and depth
capture for media filters with a loading-rate limit.

## Engine and validation

`@petrolord/engines` PR #83, vendored, shim at
`src/utils/facilities/engine/producedWater.js`. Oracle uses genuinely
different numerical methods: the distribution-against-grade-efficiency
integral by **Monte Carlo sampling** against the module's binned
quadrature; the log-normal CDF from the **C library's erf** against
the module's Abramowitz & Stegun series; depth filtration **marched
layer by layer** against the closed exponential. The viscosity fit
independently reproduces the textbook 0.890 cP for water at 25 C.
20 gates; engines suite 1946 green.

## Deleted

`src/hooks/usePwtCalculations.js` and
`src/components/pwt/PwtVisualizer.jsx` (superseded).

## Honest limits (stated in-app)

- No chemistry: no coalescer aid, no reverse demulsifier, no polymer.
- No solids fouling, filter run length or backwash intervals.
- It does not know your inlet droplet distribution unless you measure
  it; a half-remembered number propagates its uncertainty exactly.
- Where it earns its keep is showing which lever moves the outlet, and
  that is usually upstream shear rather than another stage of kit.

## Open

- Tile rename+activation migration 20260829650000 HELD for the prod
  upload.
- ARMED literature gates: API 421 worked examples and published
  hydrocyclone grade-efficiency curves (owner PDFs).

---

# FC7-0, 2026-09-16: the repair wave

The recon before the NextGen Produced Water course found **55 findings, 27 of
them reachable by typing into a box in this studio and producing a wrong,
unmoved or non-finite number on a screen**. Engines PR (FC7-0) and the matching
Suite PR fix all of them. The full record, with every decision and its reason,
is `tools/validation/facilities/FINDINGS-producedwater.md` in the engines repo.

## The four that were wrong on this studio's own shipped defaults

1. **The hydrocyclone rewarded buying FEWER liners, without limit.** The
   centrifugal field went as the square of the flow per liner with nothing
   above it, so the cut size fell as one over its square root. The shipped
   default of 20 liners on 50,000 bwpd ran them at **7.667 times their design
   flow at 58,786 g**, and clearing the Liners box gave ONE liner at
   **23,514,452 g** and an outlet 78 times better. The whole headline (1.2 ppm,
   MEETS, 27.78 ppm margin) rested on it. The field now stops rising at the
   1.3x envelope, overload carries an inlet-shear penalty so the cut gets
   worse, and past 2x design the engine refuses and says how many liners the
   flow needs. **The default is 160 liners now**, which is turndown 0.958.
2. **A device whose inputs were incomplete was SKIPPED and the train still
   printed a verdict.** Clearing the Plate area box dropped the CPI and the
   studio still read 1.220 ppm, 99.76 percent and MEETS with a 27.78 ppm
   margin. The train withholds `meetsSpec` and `marginPpm` now, names the
   stages that did not run, and this studio prints the reason in an error note
   and paints the row.
3. **The Bubble size and Gas ratio boxes could not change any number**, so
   induced and dissolved gas flotation were the same device behind two menu
   entries, and the panel hardcoded 80 micron for DAF behind the user's back.
   Both boxes are live now and they are the whole difference between the two,
   with a one-click preset for each. At the presets the induced cell cuts at
   18.6 um and the dissolved cell at 6.6 um.
4. **The Bed depth box could not change any number either**, because the filter
   computed its removal twice by two routes that disagreed and the train read
   the one the bed depth did not enter. One route now, and the bed depth, the
   grain size and the loading rate all move the cut.

## What else changed in this layer

- **Every box is parsed strictly.** `parseFloat` read a prefix and threw the
  rest away, so a saved study or a pasted figure carrying "50,000" came back as
  50 and the studio designed a train for fifty barrels a day and called it
  excellent. A box that does not hold a number is named on screen.
- **No box has a silent fallback.** Clearing one refuses by name instead of
  substituting a value nobody typed.
- **The hidden constants are on the panel**: the liner design flow and its
  field at design, the flotation cell depth and gas rate, the filter
  coefficient (3.5 for walnut shell and 4.2 for multi-media was the ONLY
  difference between those two menu items) and the media grain size. A new
  "Inside each device" card shows the turndown, the field, the residence, the
  gas holdup, the bubble Reynolds number, the loading and the cut droplet's
  Reynolds number.
- **The chart and the calculation discretise one distribution.** The bar chart
  ran at 30 bins against a train at 60.
- **All four derived blocks are wrapped**, so a throw shows a message rather
  than a white screen.
- **The filter bed area default moved from 6 to 16 m2**, because 6 m2 puts the
  shipped case at 55 m/hr, over twice the loading the engine warns about.
- **Copy**: the "29 ppm monthly average is the common offshore limit" hint is
  gone (no source for it exists anywhere in the repo, and the engine now states
  no limit at all), the two help-guide claims the arithmetic denied are
  corrected, the catalogue's four-device promise is restated, the null verdict
  is no longer painted red, and three owner copy-rule contrastives in live help
  text are rewritten.

## The shipped case, before and after

| | before | after |
| --- | --- | --- |
| liners / filter bed area | 20 / 6 m2 | 160 / 16 m2 |
| liner turndown, field | 7.667 x, 58,786 g | 0.958 x, 919 g |
| filter loading | 55.2 m/hr, over its own warning | 20.7 m/hr, inside it |
| outlet | 1.2188 ppm | 6.5387 ppm |
| overall removal | 99.756 % | 98.692 % |
| droplet median | 30 typed to 5.858 measured | 30.000 to 7.323, both measured |
| verdict | MEETS, margin 27.78 ppm | MEETS, margin 22.46 ppm |

The new answer is 5.4 times worse and it is the one the equipment supports.

## Held for literature, stated in-app and never graded

- The discharge limit itself. The spec box is the user's own permit figure.
- The oil-in-water basis: the removal is a fraction of the oil, so it is
  dimensionless and the outlet comes back on whatever basis the inlet was given
  on. Converting a limit written in mg/l is the user's step.
- API 421's horizontal velocity rule, of which only the fixed-velocity half is
  implemented.
- The dissolved and soluble oil floor, whose existence is stated on the
  Treated water card and whose value is the caller's to supply.
- Every device shape and scale constant, including the flotation attachment
  efficiency and the field a liner develops at its design flow.

## Gate

Engines: 68 gates, up from 20. The planting battery went from **22 of 35
defects leaving the suite green to 0 of 35**. Suite: the smoke test now asserts
the hidden constants appear and that clearing an equipment box gives NO spec
verdict, and `ProducedWaterContext.parsing.test.js` holds the strict parser and
the re-picked defaults against the values `parseFloat` used to launder.

## FC7-1: the second engine repair, vendored 2026-09-17

Engines PR #206 (merge `9874d58`) repaired three more defects in the same
module, all of them classes FC7-0 had named but had not chased into every
device. The Suite pin moved `55431d7` -> `9874d58`, seven canonical paths,
each proved byte-identical to the canonical blob. The import closure needed
nothing else: `engines/facilities/producedWater.js` imports nothing.

1. **`mediaFilter` kept a silent `Math.max(loadingMHr, 1)`.** Below 1 m/hr
   the bed area moved the answer by exactly nothing. At the shipped 50,000
   bwpd, beds of 400, 600 and 2000 m2 all reported a filter coefficient of
   11.067972 per m, a cut of 5.275789 micron and 99.9953 percent removal of
   a reference droplet, to every digit, across a five-fold span of bed area.
   The clamp is gone, so the area bites wherever the module answers, and
   below a declared and pinned `filterMinLoadingMHr` of 1 m/hr the module
   now REFUSES BY NAME, quoting the loading, the floor, the declared
   reference loading and the bed area that would run the flow at the floor.
   The low-rate form is HELD FOR LITERATURE.
2. **Three thresholds were bare inlined numbers**: the flotation residence
   warning of 60 s, and the grid's `nBins` and `spanSigma` floors. All three
   are declared in `DECLARED_CONSTANTS`, and the flotation warning now quotes
   the threshold it judged against. `flotation` returns `residenceWarnS` and
   `mediaFilter` returns `loadingFloorMHr`, so the app can show both.
3. **`medianOfBins` still fell back to the bare bin midpoint** when a bin
   carried no edges, a silent route back to the quantised median FC7-0 had
   removed. The path is closed and the leaf returns NaN. No in-module caller
   can reach it, so nothing in this Studio changes.

### What moves on a live screen

**No shipped default moves.** The shipped filter bed is 16 m2, which at
50,000 bwpd loads at 20.70 m/hr, twenty times the floor, and the shipped
flotation cells sit far above the 60 s warning. The Studio's default case is
identical to the last digit: cut 11.253503 micron, coefficient 2.432582 per m.

**Above the floor nothing moves at all.** The old clamp was `Math.max(x, 1)`,
which is the identity for every loading of 1 m/hr and above, so every answer
the Studio can still give is bit-for-bit what it gave before.

**Below the floor a frozen number becomes a named refusal.** At the shipped
flow that is any bed past about 331.2 m2. Where the Studio used to print a
cut size of 5.275789 micron and a 99.9953 percent reference removal for any
bed of any size, it now prints the refusal and its reason. The train already
handles this honestly: `treatmentTrain` marks the stage `ran: false`, the
stage table shows "did not run" with dashes rather than a blank or a zero,
the reason appears as a note, and the spec verdict is WITHHELD rather than
silently computed on two stages.

**The flotation residence warning is reworded** by the engine, from "less
than a minute of flotation residence (32.0 s)" to "32.0 s of flotation
residence is under the 60 s this module warns below". Same trigger, same
threshold, and it now names the number it judged against.

### Suite-side changes

- `PwtPanels.jsx`: the **Bed area** box states the floor before you can hit
  it; the **Loading rate** row carries the floor and the bed area at which
  this flow would reach it; the **Residence over all cells** row carries the
  declared 60 s warning threshold. All three read the engine's own returned
  values rather than restating a constant.
- `PwtHelpGuide.jsx`: the limits section states the filter refusal and why.

No new refusal renders as a blank, a NaN or a zero: `DeviceDetail` gates
every row behind `!d.error` and shows an `ErrorNote`, and the stage table
prints "did not run".

### Queued for the engines repo, not fixed from here

`apiSeparator`'s short-circuit refusal string breaches the owner copy rule
with a contrastive: "an F of zero or less is not a perfect separator, it is
an undefined one". It predates FC7-1 and it DOES reach a live screen, because
`DeviceDetail` renders a device's `error` verbatim and the Short-circuit
factor F box is on the API panel for anyone to type a zero into.
`mediaFilter`'s `cutBasis` carries the same shape, "not a second opinion",
but nothing in the Suite renders `cutBasis`, so that one is latent.

FC7-1's own new refusal string is clean: no dash of any kind and no
contrastive. The vendored `engine.copy.lint` suite passes, though it gates
dashes and rounding rather than contrastives.

Engine copy is repaired in petrolord-engines and never from the Suite, so
both are queued there.
