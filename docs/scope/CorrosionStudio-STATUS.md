# Corrosion & Integrity Studio — status

Phase: Facilities F6 (Facilities-ROADMAP.md §3 app 6, §5 F6)
Status: **SHIPPED 2026-08-29**; **REPAIRED FC9-0 2026-09-16**
(engines PR #203, Suite PR for the studio layer)
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
- **Protective scale factor**: iron carbonate plates out and the rate
  FALLS with further heating. The onset is NOT 60 C, which is what this
  document and the help guide both used to say: it is where
  `2400/T = 6.7 + 0.6 log10 fCO2`, which is **81 C at the studio's own
  shipped conditions**, and it moves with fugacity. `scaleOnsetTC`
  computes it and the studio prints it (FC9-0).
- **CO2 fugacity** rather than partial pressure at pressure.
- **Wall shear stress** with the film-survival threshold: above about
  100 Pa most inhibitor films are stripped, so the datasheet
  efficiency stops describing the line.
- **Inhibitor efficiency separated from availability.** A 95 percent
  inhibitor at 80 percent availability delivers 76 percent protection,
  nearly five times the metal loss of the datasheet number. The studio
  computes and states it.
- **WITHDRAWN FC9-0: the sour-service severity regions and the material
  guidance.** They were drawn from
  `log10(pH2S / 0.0035) - (pH - 3.5)` with break points at 1 and 2.5, an
  expression written in the engine and labelled with a standard's name,
  and the studio served three named material recommendations off it.
  Moving the pH pivot from 3.5 to 4.5 and widening the Region 1 boundary
  from 1 to 2 both left the gate 19 of 19 green, and a missing pH fell
  through to Region 3 and the hardest recommendation in the file. Removed
  rather than retuned, with nothing in its place: what survives is the
  H2S partial pressure against a threshold, and the threshold value is
  itself HELD. The studio says plainly that it does not classify severity
  and does not select materials. See
  `packages/engines/tools/validation/facilities/FINDINGS-corrosion.md`.
- **The H2S:CO2 ratio** deciding whether a CO2-only model still describes
  the surface, and FC9-0 makes the studio ACT on it: in the sulphide
  regime the category and the remaining life are WITHHELD and the rate is
  kept as a stated upper bound.
- **Remaining life** against a corrosion allowance, the allowance a
  design life demands, and the shortfall — with the practical point
  made in the UI: when availability is what fails the design life,
  fixing the injection system beats upgrading metallurgy.
- Persistence (`saved_corrosion_projects`, APPLIED), studio kit, help
  guide, smoke test.

## Engine and validation

`@petrolord/engines` PR #82, repaired by **PR #203 (FC9-0)**, vendored,
shim at `src/utils/facilities/engine/corrosion.js`.

The 2026-08-29 claim that the oracle used "independent routes
throughout" was wrong, and FC9-0 measured it. Three routes were the
engine's expressions character for character, and `shear_darcy` formed
`f_darcy = 4 f_fanning` then `(f_darcy/8) rho U^2`, which IS the
engine's own `0.5 f_fanning rho U^2`. **Thirteen of fifty defects
planted in the engine alone left the gate 19 of 19 green, and fifteen
of seventeen planted in the engine AND the oracle together left it
green with the oracle catching none of the seventeen.**

The gate is rebuilt in three parts, because a constant typed in two
files cannot be validated by comparing the two files: genuinely
independent routes (the bisection combination, the 8760 hour duty
cycle, the wall shear through a **momentum balance** whose force
balance is checked as an identity, the film onset bisected, the life
marched, and **the H2S to CO2 ratio from mole fractions**, which is
pressure free and is what catches a pH2S built from the wrong thing);
constant-free invariants; and every held constant MEASURED out of the
engine's own behaviour and pinned against a literal in the gate, a
third location. **51 negative controls, every one proved to fire.**

**Battery: 0 of 70 green engine-only and 0 of 25 green paired**, from
13 of 50 and 15 of 17. 48 gates from 19; golden 110 rows from 10, still
synthetic and now saying so. Engines suite 179 suites, 5865 green.

## Deleted

`src/utils/corrosionCalculations.js` and
`src/components/corrosion/CorrosionRiskMatrix.jsx` (superseded).

## Honest limits (stated in-app, FC9-0)

- A screening model, not a prediction.
- **No sour-service severity region and no material selection.**
  Withdrawn, see above.
- **No inspection interval, minimum thickness or retirement thickness,
  and no fitness-for-service assessment.** The studio divides an
  allowance by a rate and stops. API 570, 579 and B31.G appear nowhere
  in the engine, the app or the help guide, and producing any of them
  means adopting a standard the engine does not carry, so it does not
  guess at one.
- No erosional velocity limit, no pitting, SSC or HIC criterion, and no
  chloride, oxygen, organic acid, glycol or top-of-line model. The one
  rate returned is a general uniform rate.
- **Blank means blank.** A cleared box is refused and the refusal names
  the box. The pH correction refuses below its reference of pH 4.
- **The rate is withheld** where the model does not apply: the sulphide
  regime, no CO2, and an oil-wet assumption. No category, no life, and
  the rate kept as a stated upper bound.
- Ten held items are exported by the engine and listed in the studio
  behind a disclosure, including the one that matters most: **whether
  the protective scale factor multiplies the reaction term or the
  combined rate.** The engine applies it to the COMBINED rate, and mass
  transfer controls at the studio's own defaults, so which side it
  belongs on changes the answer materially. Unresolved and stated.

## Engines copy sweep (2026-09-18)

Engines #214 is vendored ahead of its pin. Seven corrosion strings are
reworded to the owner copy rule, among them the inhibitor warning on screen,
which now ends "availability is what limits it" (the smoke test pins the new
words). `BAR_TO_PSIA` keeps its value, 14.503773800721815, and its comment no
longer calls it exact: the exact conversion is 14.503773773020923, 1.91e-9
relative lower, kept because moving it would shift six-decimal figures in the
held FC9 course ladder. No number moved.

## Open

- Tile rename migration 20260829630000 HELD for the prod upload.
- **FC9-0 tile description correction
  `20260916120000_fc9_corrosion_tile_withdraw_region_claim.sql` HELD**:
  the live description still sells "the protective-scale correction
  above 60 C" and "MR0175 sour-service regions from H2S partial
  pressure and pH". Description only; the slug carries entitlements and
  is untouched.
- Prod upload carrying FC9-0, then owner staging E2E.
- ARMED literature gates, and every one of them is now a HELD item
  rather than a nice-to-have: the de Waard-Milliams constants and their
  validity bands, the scale factor's placement, the pH slope and its
  below-reference behaviour, the 250 bar cap, the H2S threshold, the
  1/500 and 1/20 ratios, the 100 and 50 Pa shear thresholds, the rate
  category bands, and the Blasius constants. **No ISO 15156 region
  gate: that claim is withdrawn, not pending.**
- Cross-app, recorded and NOT wired up in FC9-0: three studios take a
  corrosion allowance and none knows about the others. This one
  consumes one to give a life (0.125 in default); Pipeline & Line
  Sizing ADDS one to a Barlow wall (0.0625 in); Storage Tank & Venting
  ADDS one to an API 650 shell course. The wall this studio is eating
  is not the wall either of those sized.
