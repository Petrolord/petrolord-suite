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
