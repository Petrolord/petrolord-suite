# Storage Tank & Venting Designer — status

Phase: Facilities F12 (Facilities-ROADMAP.md §3 app 8, §5 F12)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f12)
Slug: `storage-tank-designer` — a fresh slug, seeded by
20260829730000 (HELD).

## The organising idea

Three questions about an atmospheric tank are normally asked in three
different places and answered inconsistently: how thick the shell has
to be, how much the tank has to breathe, and how much product
evaporates out of it. They all fall out of one geometry, so they belong
in one app where the same diameter and height feed all three.

## What it carries

- **API 650 shell courses by the one-foot method**, with the
  **hydrostatic test case computed beside the product case and the
  governing one named**. This is the case people forget: water is
  heavier than most products, so on a light product the water test
  governs the shell and designing for the product alone
  under-thicknesses it. The studio warns when any course is test
  governed.
- **API 2000 normal venting worked in both directions**, from the
  thermal and the liquid-movement components separately, with the
  governing case named. The vacuum answer is computed as its own
  result rather than assumed to follow the pressure one, because
  inbreathing is the case that actually destroys tanks: a cold
  rainstorm on a hot tank being drawn down will collapse it if the
  vacuum vent cannot pass air in fast enough.
- **Emergency fire venting** from the wetted shell below thirty feet,
  which is the basis the standard is written on, reported beside the
  normal requirement so the order-of-magnitude gap between them is
  visible.
- **Standing and working evaporative losses**, reported as both
  product lost and tonnes of emissions from the same arithmetic, with
  control equipment quantified by the efficiency you type rather than
  an assumed one (internal floating roof customarily 60 to 90 percent,
  vapour recovery 90 to 98).

## Validation

`@petrolord/engines` PR #88, vendored, shim at
`src/utils/facilities/engine/storageTank.js`. The oracle
(`tools/validation/facilities/oracle_tanksmetering.py`) re-derives the
one-foot method **entirely in SI** — density in kg/m³, head in metres,
stress in Pa — so the `2.6` field constant is **checked rather than
repeated**, agreeing to 4e-4. 22 gates across both F12 engines; engines
suite 2035 green.

## Honest limits (stated in-app)

- No wind or seismic design, no roof structure, no foundation or
  settlement, no nozzle reinforcement, no floating-roof mechanics.
  Those are the rest of API 650 and they need a tank designer.
- Loss control efficiencies are equipment and operating figures, so
  they are typed rather than assumed.

## Open

- Tile seed migration 20260829730000 HELD for the prod upload.
- ARMED literature gate: published API 650 and API 2000 worked
  examples (owner PDFs).

## FC8-0 repair, 2026-09-16 (engines PRs #204 and #205)

**THE EMERGENCY VENT CAPACITY IS WITHHELD.** `fireVenting` divided the
fire duty by `sqrt(molecularWeight * tempR)` beside a dead
`* Math.sqrt(1)`. 1107 is a field-unit packaged constant with a
reference temperature already folded into it, so it cannot coexist with
a free absolute temperature in the same denominator; `tempR` was an
input this studio never exposed and it moved the answer 29 percent
across 400 to 800 R; and if the customary packaged form
`1107 Q / (L sqrt(M))` is right, the line UNDER-STATED the required vent
by about 23.7 times. API 2000 is not in the repository and must not be
reconstructed from memory. The studio now shows the heat input with its
band and says the vent capacity is withheld, with the reason, rather
than printing a figure that may be 24 times too small. HELD FOR
LITERATURE.

### What a user sees change, at this studio's own shipped defaults

| screen | before | after |
| --- | --- | --- |
| Venting, Emergency vent | 1,678,956 scfh air | **withheld**, with the reason |
| Venting, Heat input | 44.26 MMBtu/hr | 44.26 MMBtu/hr, with its band named |
| Venting | no warning | a NEW extrapolation warning: 80,574 bbl is above the 20,000 bbl at which this package stops claiming the thermal rate is proportional |
| Losses, Vapour space | 135,717 ft3 (12 ft typed) | **22,619 ft3** (2 ft, derived from the geometry) |
| Losses, Standing loss | 17,276 lb/yr | **4,854 lb/yr** |
| Losses, Saturation factor | 0.5118 | **0.8628** |
| Losses, Total | 32.7 tons/yr | **26.5 short tons/yr** |
| Losses, With control | 3.3 tons/yr | **2.6 short tons/yr** |
| Shell | course table only | a summary row: governing course, thickest, how many courses the water test governs, and the 0.1875 in minimum in force with its basis |

Working loss (48,126 lb/yr), the normal vent figures (51,152 out and
85,066 in scfh) and every course thickness are unchanged.

### Inputs added, removed and exposed

- ADDED: Latitude factor, which was persisted into every saved study,
  scaled the governing vacuum case by 75 percent over its range and had
  no field anywhere. Minimum plate (in), because "minimum plate
  thickness" was a governing reason with no number attached. Average
  vapour temperature and the vent setting, which set the loss answer.
- REMOVED: the typed Vapour space (ft), now derived from the shell
  height less the design liquid level, so the geometry and the losses
  cannot contradict each other. Latent (Btu/lb) and the venting-side
  Vapour MW, which fed only the withheld vent conversion, so keeping
  them would have been two more inputs that change nothing.
- An empty Control efficiency box now refuses rather than meaning zero.

### Honest limits added

API 650's minimum shell plate thickness band table, the one-foot
method's diameter limit, the API 2000 thermal venting table above the
capacity where it stops being proportional, the fire case's
wetted-area ceiling, and AP-42's turnover factor Kn are all named as
NOT CARRIED by this package. The turnover input that never fed Kn, and
moved the total 0.000000 percent over 1 to 500 turnovers, is gone.
