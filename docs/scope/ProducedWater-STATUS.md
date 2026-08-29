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
