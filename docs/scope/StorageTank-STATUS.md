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
