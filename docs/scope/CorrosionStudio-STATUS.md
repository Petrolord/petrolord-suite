# Corrosion & Integrity Studio — status

Phase: Facilities F6 (Facilities-ROADMAP.md §3 app 6, §5 F6)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f6)
Slug: `corrosion-rate-predictor` (kept — it carries entitlements; the
tile RENAMES via the HELD migration 20260829630000).

## What the predecessor was

76 LOC: the de Waard-Milliams nomogram equation times a pH factor and
two flat fudge multipliers (oil wetting 0.1, carbonate scale 0.2),
plus a single-threshold H2S check. **No velocity term at all**, so the
same fluid in a 4-inch line and a 16-inch line produced identical
answers. No inhibitor model, no shear, no remaining life — the last
one being something the tile had been advertising.

## What replaced it

- **de Waard-Milliams 1995 in resistance-in-series form**,
  1/CR = 1/Vr + 1/Vm, so velocity and diameter enter explicitly. The
  studio draws rate against velocity, a curve the old model could not
  produce, and names which resistance controls.
- **Protective scale factor above 60 C**: siderite plates out and the
  rate FALLS with further heating. Extrapolating the low-temperature
  equation upward without it is a common and expensive mistake.
- **CO2 fugacity** rather than partial pressure at pressure.
- **Wall shear stress** with the film-survival threshold: above about
  100 Pa most inhibitor films are stripped, so the datasheet
  efficiency stops describing the line.
- **Inhibitor efficiency separated from availability.** A 95 percent
  inhibitor at 80 percent availability delivers 76 percent protection,
  nearly five times the metal loss of the datasheet number. The studio
  computes and states it.
- **MR0175 / ISO 15156 regions from H2S partial pressure AND in-situ
  pH**, not one H2S threshold, with material guidance per region; plus
  the H2S:CO2 ratio deciding whether a CO2-only model still describes
  the surface at all.
- **Remaining life** against a corrosion allowance, the allowance a
  design life demands, and the shortfall — with the practical point
  made in the UI: when availability is what fails the design life,
  fixing the injection system beats upgrading metallurgy.
- Persistence (`saved_corrosion_projects`, APPLIED), studio kit, help
  guide, smoke test.

## Engine and validation

`@petrolord/engines` PR #82, vendored, shim at
`src/utils/facilities/engine/corrosion.js`. Oracle uses independent
routes throughout: the series combination by **bisection** rather than
the algebraic reciprocal; reaction and fugacity recomputed in
**natural logs** against the module's log10 form (so a base slip in
either shows); shear re-derived through the **Darcy** factor against
the Fanning form; and the inhibitor time-average recomputed as an
explicit **hour-by-hour annual duty cycle**. 19 gates; engines suite
1925 green.

## Deleted

`src/utils/corrosionCalculations.js` and
`src/components/corrosion/CorrosionRiskMatrix.jsx` (superseded).

## Honest limits (stated in-app)

- A screening model, not a prediction: it says which lines need
  attention and roughly how much.
- Where iron sulphide governs (H2S:CO2 past ~1:500), the studio says
  the CO2 model no longer describes the surface rather than quoting a
  number with false confidence.

## Open

- Tile rename migration 20260829630000 HELD for the prod upload.
- ARMED literature gates: NORSOK M-506 comparison cases and the
  ISO 15156-2 region diagram (owner PDFs).
