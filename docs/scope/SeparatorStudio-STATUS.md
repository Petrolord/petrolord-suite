# Separator & Slug Catcher Studio — status

Phase: Facilities F5 (Facilities-ROADMAP.md §3 app 5, §5 F5)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f5)
Slug: `separator-slug-catcher-designer` (kept — it carries
entitlements; the tile RENAMES via the HELD migration
20260829610000).

## What the predecessor got wrong, and what replaced it

| Predecessor | Now |
|---|---|
| `Z = 0.85` hardcoded | z from the validated DAK correlation at the vessel's own conditions |
| one K for every pressure | published base K by orientation and mist extractor, derated for pressure, floored honestly, overridable by a vendor value |
| assumed half-full vessel | exact circular-segment geometry at whatever liquid level is set |
| two-phase only | three-phase solving the oil AND water retention times against one vessel, naming which sets the length |
| gas velocity read from the PREVIOUS render's diameter (F0 fixed the crash; F5 removes the pattern) | computed from the vessel being sized |
| no persistence | `saved_separator_projects`, inputs-only, results re-derived on load |
| one assumed L/D | the whole L/D family swept and tabled, customary band marked |
| slug catcher: one vessel formula | vessel and finger (harp) types, the slug volume taken from the F1 studio's pigging tab rather than guessed |

## Beyond the fixes

The three-phase path asks the question retention time alone cannot:
can a water droplet actually fall through the oil layer, and an oil
droplet rise through the water, in the residence available. On a
thick, cold oil the answer is often no, and a vessel that meets every
retention target still carries water over. The studio warns when that
settling check fails.

## Engine and validation

`@petrolord/engines` PR #81, vendored, shim at
`src/utils/facilities/engine/separatorSizing.js`. Oracle
(`oracle_separator.py`) uses independent routes: circular-segment
areas by **numerical integration of the chord** against the closed
form, and Stokes settling from the SI law v = g d²Δρ/(18 μ), which
**checks** the field constant 1.78e-6 rather than repeating it (they
agree to 0.42 percent — the constant is a rounded packaging). 20
gates; engines suite 1905 green.

## Honest limits (stated in-app)

- Bulk separation sizing to the standard method: it does not design the
  inlet device, size the mist extractor itself, or predict the real
  droplet distribution leaving an inlet nozzle. Those need vendor data
  and, for difficult services, physical testing.
- What the studio gives is the vessel envelope a vendor bid should fit
  inside, and the reasons behind it.

## Open

- Tile rename migration 20260829610000 HELD for the prod upload.
- ARMED literature gates: GPSA K-value tables and API 12J worked
  examples (owner PDFs).
- The conditions card does not show the `nearFloor` flag that engines
  #195 added to `kValue` (see below). Surfacing it is new function.

## FC1-0 repairs (2026-09-15, branch fix/fc1-0-separator-layout-apps)

Suite-side repairs, decided under the owner's delegation. Engine repairs
run in a separate engines PR; nothing under packages/engines changed here.

- **Missing stays missing.** The context no longer substitutes gas SG
  0.65, API 35, retention 3/5 min, droplet 500 um, finger 24 in x 6, and
  the rest. The example values remain the initial values of a new study,
  labelled "Example case" in both input panels; a cleared required field
  stays blank and the results are replaced by "Missing required inputs:
  <names>." The K override stays optional by design.
- **L/D band per vessel type.** `LD_BAND` mirrors the engine's ldSweep
  documentation (3 to 5 horizontal, 2 to 4 vertical); changing the vessel
  type moves an untouched band, and an edited band is left alone. A gate
  reads the engine comment so drift fails. Studies saved before this keep
  whatever band they saved.
- **No first-row fallback.** With nothing in band, no vessel is selected
  and the studio says "No candidate in the L/D band (min to max), so no
  vessel is selected."

Engine follow-ups to adopt when the engines repair PR lands: an exported
L/D band constant (replace the mirror), and any `feasible` flags or change
to `ldSweep().preferred` semantics (`selectVessel` reads only `preferred`).


## FC1-0 engine integration (2026-09-15, engines #188)

The vendored engine was repaired under FC1-0 and the studio follows it:

- **Refusals are named.** A missing, non-finite or out-of-domain input
  throws a `SeparatorInputError` carrying the input name. The studio
  catches it and prints the field label the user sees with the engine's
  own message, so nothing is silently substituted.
- **A blank K override is undefined, not zero.** The engine refuses a
  given K that is not positive, and blank means "use the derated
  correlation" as the hint has always said.
- **Two droplet sizes.** `dropletMicron` is retired. The water drops to
  remove from the oil and the oil drops to remove from the water are
  different jobs and are entered separately (500 and 200 micron are the
  customary figures). A study saved before this change carries its single
  size into both, which is what the old engine did with it.
- **Selection is the engine's `preferred`**: the smallest FEASIBLE
  candidate inside the L/D band. A row that cannot carry the gas, or
  whose droplet checks fail, is marked unfeasible with the reason and can
  never be selected, and `preferredStatus` tells the user whether nothing
  is feasible or whether the feasible rows are all outside the band.
- **Three-phase results**: one `liquidRetentionLengthFt` at the
  proportional interface (the separate oil and water lengths are gone),
  with the interface height, the water layer, the oil layer, residence
  times from the sized vessel, and every warning listed.
- The conditions card shows the Ppr and Tpr behind the z-factor and the
  engine's note when Ppr is below the DAK fit range.


## Engines #195 vendored (2026-09-16)

`packages/engines` moved to canonical `fa53f7f`, which carries engines
PR #195 beside the FC2-0 line-hydraulics work. #195 touches
`separatorSizing.kValue`, which this studio calls on every solve, so its
effect here was measured rather than assumed.

- **`nearFloor` is additive.** `kValue` gains a third flag beside
  `derated` and `floored`, true when the floor did not catch this K and
  one more 100 psi step of the published derating rule would put it
  under. A typed K reports it false, so the return shape is identical on
  both branches and nothing in this studio changed shape. **This studio
  does not read `nearFloor` yet**, so the flag is computed and not
  shown. Surfacing it is new function and is listed under Open.
- **One input moves, and it is a repair.** The floor comparison was
  `kDerated < K_FLOOR` in binary floating point, and it now carries a
  slack of 1e-9. A derating that lands EXACTLY on 0.12 reads as
  0.11999999999999997, so the old comparison floored a K the published
  rule does not floor. Swept at 0.01 psi over 0 to 6000 psig across all
  six mist-extractor rows, **exactly one input in the whole space
  changes**: `verticalMesh` at 2400 psig, where the rule gives
  `0.35 - 0.01 * 23`. There, K moves from 0.12 to 0.11999999999999997
  (3e-16 relative, below the six decimals a K is ever reported at, and
  far below anything this studio displays), `floored` goes true to
  false, and the "0.12 floor bound" warning that the conditions card
  printed **stops being printed**. That warning was wrong: the rule does
  not put that vessel under the floor.
- The engines FINDINGS note for #195 states that five pressures are
  affected, one per base row. That does not reproduce. Only
  `verticalMesh` at 2400 psig lands close enough below 0.12 in binary
  floating point for the comparison to have differed; the other five
  rows land on 0.12 exactly or just above it. Recorded here rather than
  silently carried, and raised upstream.
