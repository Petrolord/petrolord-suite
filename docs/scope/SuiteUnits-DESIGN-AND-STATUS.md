# Suite unit profile: design and status

Owner approved 2026-09-30. Branch `feat/suite-unit-profile`.

## What it is

One Petrel-like unit setup for the whole Suite. An organisation admin sets
the organisation default; each person can follow it or set their own. Every
adopted app opens in those units. The profile is a **display and input
preference only**: stored data stays in canonical units (SI in the geoscience
registries; rows carry `z_unit` / `xy_unit`), so changing a profile never
alters a stored value.

## Pieces

| Piece | Where |
|---|---|
| Table (migration file, **not applied**) | `supabase/migrations/20260930210000_suite_unit_settings.sql` |
| Scratch dry run and RLS pentest (33 checks) | `tools/validation/suite-unit-settings/run.sh` |
| Quantity registry, exact factors, convert | `src/lib/units/registry.js` |
| Presets and profile shape | `src/lib/units/presets.js` |
| Resolution order | `src/lib/units/profile.js` |
| App vocabulary adapter | `src/lib/units/vocabulary.js` |
| I/O, cache, table-absent fallback | `src/lib/units/profileService.js` |
| Provider (mounted in `App.jsx`) and `useUnitProfile()` | `src/lib/units/UnitProfileContext.jsx` |
| Per-app adoption hook | `src/lib/units/useAppUnits.js` |
| Project apps: system for new projects | `src/lib/units/useProfileSystem.js` |
| Notes shown in apps | `src/components/units/UnitProfileNote.jsx`, `ProjectUnitSystemNote.jsx` |
| Settings page (`/dashboard/units`, sidebar "Units", link on My Profile) | `src/pages/UnitSettings.jsx` |
| .pld metadata | `src/lib/units/portability.js` (+ `exportPackage.js`, `importPackage.js`, `supabaseSource.js`, `PackageImportDialog.jsx`) |

## Table

`public.suite_unit_settings`: one row per organisation (`scope =
'organization'`) and one per user (`scope = 'user'`), a check that exactly
the id matching the scope is set, `profile jsonb` of shape
`{ preset: 'oilfield' | 'metric' | 'custom', units: { family: unit }, version: 1 }`
(shape-checked; a missing key reads as false), `updated_by` default
`auth.uid()` on delete set null, `app_build`, timestamps. A touch trigger
pins scope, organisation and user and stamps the editor.

RLS uses only the SECURITY DEFINER helpers: organisation row read by members
(`is_org_member`), written by admins (`is_org_admin_of`); a user row is the
user's alone. anon revoked; authenticated gets select, insert, update and
delete. No shared table changes (organizations is only referenced).

**Status: file only. The owner applies it** (staging first). Until then the
app reads 42P01 / PGRST205 as "not there yet": resolution falls back to the
legacy depth setting and the built-in preset, "My units" is saved in the
browser, and the organisation default cannot be saved (the page says so).

## Resolution order

Per quantity family, first match wins:

1. **user**: your own setting ("your setting")
2. **project**: reserved for the Suite Project (after NAPE); sits between the
   organisation and the user; always empty today
3. **organization**: the organisation default ("organisation default")
4. **legacy**: `geoscience_settings.depth_unit`, depth family only ("your
   earlier depth setting")
5. **builtin**: the `oilfield` preset ("built-in default")

A `custom` profile sets only the families it lists, so a user can follow the
organisation and change just pressure. Each resolved unit carries its source
so the UI can label it honestly.

**Built-in default (programme lead decision):** `oilfield`. It matches the
current account depth default (ft) and the Nigerian upstream convention; an
organisation admin changes it on the Units page.

Loaded once per page (module cache) with a sessionStorage snapshot so a
reload paints the right units at once.

## Families and presets

| Family | Units | Oilfield | Metric |
|---|---|---|---|
| depth | m, ft | ft | m |
| xy | m, ft, ftUS | m | m |
| area | m2, km2, ha, acre, ft2 | acre | km2 |
| rockVolume | m3, 10^6 m3, acre-ft, bbl, ft3 | acre-ft | 10^6 m3 |
| liquidVolume | m3, bbl, STB, 10^3 bbl, MSTB, MMSTB, MMbbl, RB, 10^6 m3 | bbl | m3 |
| gasVolume | m3, 10^3 m3, scf, Mscf, MMscf, Bscf, 10^6 m3, 10^9 m3 | MMscf | 10^3 m3 |
| pressure | kPa, MPa, bar, psi | psi | kPa |
| temperature | degC, degF, K | degF | degC |
| liquidRate | m3/d, bbl/d, STB/d, RB/d | STB/d | m3/d |
| gasRate | m3/d, 10^3 m3/d, Mscf/d, MMscf/d, scf/d | Mscf/d | 10^3 m3/d |
| fvfOil | m3/m3, RB/STB | RB/STB | m3/m3 |
| fvfGas | m3/m3, rcf/scf, RB/Mscf, RB/scf | RB/Mscf | m3/m3 |
| density | kg/m3, g/cc, lb/ft3 | g/cc | kg/m3 |
| sonic | us/m, us/ft | us/ft | us/m |
| velocity | m/s, ft/s | ft/s | m/s |
| permeability | mD, D, m2 | mD | mD |
| viscosity | cP, mPa.s, Pa.s | cP | mPa.s |
| compressibility | 1/kPa, 1/psi, 1/bar | 1/psi | 1/kPa |
| timeSeismic | ms, s | ms | ms |
| gor | m3/m3, scf/STB, Mscf/STB | scf/STB | m3/m3 |
| declineRate | 1/d, 1/month, 1/yr, %/yr | %/yr | %/yr |
| productivityIndex | m3/d/kPa, m3/d/bar, STB/d/psi, RB/d/psi | STB/d/psi | m3/d/kPa |
| pseudoPressure | kPa2/mPa.s, psi2/cP | psi2/cP | kPa2/mPa.s |
| gasProductivityIndex | 10^3 m3/d/(kPa2/mPa.s), Mscf/d/(psi2/cP) | Mscf/d/(psi2/cP) | 10^3 m3/d/(kPa2/mPa.s) |
| capillaryPressure | kPa, bar, psi | psi | kPa |
| interfacialTension | mN/m, dyne/cm | dyne/cm | mN/m |
| wellboreStorage | m3/kPa, bbl/psi | bbl/psi | m3/kPa |
| flowCapacity | mD.m, mD.ft | mD.ft | mD.m |
| diameter | mm, in, 1/64 in | in | mm |

The last nine families and the extra units on liquidVolume, gasVolume,
liquidRate, gasRate, fvfGas and gor were added for the Reservoir round
(Step 0a, 2026-10-02; `docs/upgrade/Reservoir-Step0a-Foundations.md`). Gate:
`src/lib/units/__tests__/reservoirFamilies.test.js`. A decline rate converts
its time basis only (a year is 365.25 days, a month one twelfth of it);
nominal or effective is a label the app supplies, and the step between them
is `effectiveFromNominal` / `nominalFromEffective` in
`src/lib/units/decline.js`. No Reservoir app reads these families yet:
adoption is inside each app round.

Factors are exact definitions (0.3048 m/ft, 1200/3937 m/ftUS,
6894.757293168361 Pa/psi, 0.158987294928 m3/bbl, 0.028316846592 m3/ft3,
4046.8564224 m2/acre, 1233.48183754752 m3/acre-ft, 0.45359237 kg/lb,
9.869233e-13 m2/D). Standard conditions are not converted (scf and sm3 are
plain volumes, as every app already treats them); gauge versus absolute
pressure is handled at the doors that know the atmosphere.

Gate: `src/lib/units/__tests__/registry.test.js` derives every factor from
first principles (inch, pound, standard gravity, US gallon), round-trips every
unit pair to machine precision, checks m to ft is bit-identical to
`depthModes`, cross-checks Well Test, Earth Modeling, Pore Pressure and
Wellsite constants, with negative controls (rounded psi and bbl, survey foot).

Basin and Rock Physics now import `M_PER_FT` from the registry. Pore Pressure
and Wellsite take theirs from the vendored engines (never edited from the
Suite); the gate asserts they are equal.

## App adoption (phase 1)

Rule: the initial unit comes from the profile; the in-app toggle stays as a
this-session view override (sessionStorage); an older per-app remembered
choice (localStorage) is removed once so it no longer silently beats the
profile; the app shows when a view differs from the profile, with "Use my
profile". Project apps: NEW projects start from the profile's system; saved
projects keep theirs.

| App | Families from the profile | Notes | Status |
|---|---|---|---|
| Well Data Manager | depth | per-user `petrolord.wdm.displayUnit.v1:*` removed once | adopted |
| Petrophysics Studio | depth (parameter units follow it) | had no remembered unit | adopted |
| Well Correlation | depth | a saved section opens in its saved unit (like a saved project) | adopted |
| Stratigraphy Studio | depth | a saved Stratigraphy view opens in its saved unit | adopted |
| Earth Modeling | depth, volume set (rock volume) | toggle no longer writes the account depth setting; `em.depthUnit`, `em.volumeUnits` removed once | adopted |
| Pore Pressure Studio | depth, pressure (kPa or bar show as MPa, the nearest offered) | `pp.units` removed once | adopted |
| Rock Physics Studio | velocity, density, depth | `rp.units` removed once | adopted |
| Basin & Charge | depth, temperature | `bf.units` removed once | adopted |
| Wellsite Studio | depth | `ws.units` removed once | adopted |
| Well Test Analysis | system (pressure, liquid rate, depth) | new workspace only; opened project keeps its own | adopted |
| Nodal Analysis | system (pressure, liquid rate, depth) | new workspace only | adopted |
| ReservoirCalc Pro | system (area, rock volume, depth); contact depth unit | new workspace only; its app-local "Default Unit System" setting is retired | adopted |
| Seismolord | | other agent is upgrading it (U2); adopts in its own PR | not yet |
| Mapping & Surface Studio (+ Contour Map Digitizer) | | other agent is upgrading it (U1); adopts in its own PR; its depth toggle still writes the legacy account depth, which feeds step 4 of the resolution | not yet |
| Every other app | | phase 2 | not yet |

## Portability

Export writes `meta/unit-profile.json` (the organisation default, or the
built-in preset when none) listed and hashed in `manifest.files`, plus a
manifest note. The manifest schema is unchanged, so older builds verify and
ignore it. Import reads it; the review offers "Use these as my units", which
saves the importing user's own setting and never writes an organisation
default. Gate: `src/lib/units/__tests__/portability.test.jsx` (round trip,
built-in case, no-profile source, tamper refusal, offer never saves the org
default).

## Help text

The Units page explains the resolution order and that stored data never
changes. Help guides updated: Well Data Manager, Petrophysics, Well
Correlation, Earth Modeling, Pore Pressure, Rock Physics, Basin, ReservoirCalc
Pro (registry guide, contact field).

## Open items

1. **Apply the migration** (owner, staging first):
   `supabase db query --linked -f supabase/migrations/20260930210000_suite_unit_settings.sql`,
   then flip the MIGRATIONS.md row.
2. Seismolord and Mapping adopt in their own upgrade PRs (use `useAppUnits`
   for depth, `timeSeismic` and `xy`). Mapping should stop writing
   `geoscience_settings.depth_unit` from its toggle.
3. Phase 2: remaining apps (drilling, production, facilities, economics).
   Candidates with their own converters: `src/utils/nodal/units.js`,
   `src/utils/welltest/units.js`, RCP `unitsCatalog` could take their factors
   from the registry once their suites are rerun.
4. Suite Project layer (after NAPE): fill the reserved `project` layer; the
   resolution already has its slot.
5. Petrophysics parameter units still follow the depth unit; a later pass
   could follow the profile's system directly.
6. Retire `geoscience_settings.depth_unit` once every reader uses the profile
   (it stays as step 4 until then).

## Verification (2026-09-30, branch feat/suite-unit-profile)

- Scratch Postgres dry run and pentest: 33/33 (the shape check's NULL case
  was caught by the negative control and fixed before commit).
- Jest in band: 273 suites, 2448 tests green (units library, settings page,
  portability, every adopted app, Well Test and Nodal utils, wells
  components, src/__tests__ guards).
- Playwright walk (1 worker; 1366x768 and 390, light and dark), 77/77:
  `/dev/hubs/units` (admin edits and saves the organisation default and
  My units; sidebar link), `/dev/hubs/units-member` (read-only, admin
  named), `/dev/units-app/pp?preset=metric` (m and MPa; toggle shows the
  differs note, survives a reload in the tab, reset returns to the
  profile), `/dev/units-app/wdm?preset=oilfield` (feet; a user oilfield
  setting beats a metric organisation default). No horizontal scroll at
  390, no page errors.
- Production build (`npm run build`): passed in 3m 33s after merging origin/main (8851a52e4).
