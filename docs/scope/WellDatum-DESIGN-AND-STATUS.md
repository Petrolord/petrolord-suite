# Well datum model: design and status

Owner released 2026-10-01 ("The well datum model can also be applied now").
Branch `feat/datum-digitizer`. Builds WDM U2-007 and serves Well Correlation
U2-018, Wellsite U2-019 (closing WS-U1-024) and the datum half of Pore
Pressure U2-004.

## 1. Live state read on 2026-10-02 (read-only)

`public.geo_wells` (product-prefixed registry table; 13 rows; all 13 have
`organization_id` NULL): the only vertical reference is `kb_m double precision
NOT NULL DEFAULT 0`. There is no ground level, water depth, reference kind,
datum name or unit column. RLS on; four policies (select own or organisation,
insert, update and delete own); no triggers; constraints: primary key, two
foreign keys, the status check. No policy changes are made here.

Zero was a default at every door, so a stored 0 says nothing:

| Door | Code before this work |
|---|---|
| Column default | `kb_m ... default 0` |
| Registry writer | `kb_m: w.kbM ?? 0` (`src/lib/wellsRegistry.js`) |
| Well import dialog | KB field starts as `'0'` (`src/components/wells/WellImport.jsx`) |
| LAS import | blank KB becomes 0 (`LasImportDialog.jsx`) |
| Batch LAS | `row.kbM ?? 0` |
| Well Design publish | `wellbore.kb_elev_m ?? 0`, and the wellbore dialog stores `num(kb) || 0` |

The 13 wells and what the migration does to each (rule in section 4):

| # | Well | `kb_m` today | Stations, checkshots, curves, tops | After the migration |
|---|---|---|---|---|
| 1 | Alaoma-1 | 1 | 2, 28, 10, 26 | KB, 1 m. Implausibly small for a kelly bushing: owner to check the value |
| 2 | Alaoma-2 | 2 | 79, 28, 8, 26 | KB, 2 m. Same remark |
| 3 | Barracuda_BX-01 | 62.01 | 0, 0, 52, 1 | KB, 62.01 m |
| 4 | Lad | 0 | 220, 0, 0, 0 | **Unset.** Published from Well Design Studio, whose publish writes 0 when the wellbore has no KB; no tops, curves or checkshots depend on it |
| 5 | Assa 7 | 56.0832 | 224, 565, 7, 28 | KB, 56.0832 m, entered in ft |
| 6 | Assa 7.1 | 56.083 | 224, 565, 17, 30 | KB, 56.083 m, entered in ft |
| 7 | BX-1New | 62.01 | 0, 0, 14, 14 | KB, 62.01 m |
| 8 | Assa-06 | 56.287416 | 254, 278, 12, 52 | KB, 56.287416 m, entered in ft |
| 9 | Barracuda_BX-1 | 62.01 | 0, 0, 63, 14 | KB, 62.01 m (its Wellsite well carries the same 62.01) |
| 10 | Barracuda BX-1 | 18.901 | 0, 10, 14, 14 | KB, 18.901 m |
| 11 | Petrolord | 1.998 | 24, 24, 14, 0 | KB, 1.998 m |
| 12 | Petrolord 1 | 18.8997 | 24, 0, 14, 4 | KB, 18.8997 m |
| 13 | W-3 | 7.06063104 | 304, 0, 21, 18 | KB, 7.06063104 m, entered in ft |

Twelve wells keep exactly the number they have, now stated as a kelly bushing
elevation. One well (Lad) becomes unset. No stored depth changes: tops, curves
and surveys are in MD, and the stored checkshot tables stay as they are.

Other state: `ws_wells` has 1 row whose `header.kb_elev_m` (jsonb) is a copy of
the registry KB taken at setup; Wellsite could not correct it (WS-U1-024).
Well Design keeps its own `kb_elev_m`, `ground_elev_m` and `water_depth_m` on
its wellbores and only the KB reached the registry.

## 2. What a well states

All elevations are stored in metres (the registry is SI), positive above the
vertical datum.

| Field | Column | Meaning |
|---|---|---|
| Depth reference | `depth_ref_kind` | Where measured depth is zero: `KB` kelly bushing, `RT` rotary table, `DF` drill floor, `GL` ground level, `MSL` mean sea level, `OTHER` (named in `depth_ref_label`) |
| Reference elevation | `depth_ref_elev_m` | Elevation of that point above the vertical datum. NULL means not entered. 0 is a real value (a well measured from the datum) |
| Environment | `well_environment` | `onshore` or `offshore` |
| Ground level | `ground_elev_m` | Onshore: ground elevation above the vertical datum |
| Water depth | `water_depth_m` | Offshore: datum to mudline, positive down |
| Vertical datum | `vertical_datum` | Its name: MSL, LAT, or a named national datum |
| Elevation unit | `elev_unit` | `m` or `ft`: the unit the elevations were entered in and read back in. Storage stays metres |
| Change record | `datum_changes` | jsonb array, one entry per correction: who, when, before, after, shift, what was affected, reason |

`kb_m` stays (NOT NULL, default 0) and every writer keeps it equal to the
reference elevation (0 while unset), so a build that predates this work, such
as production until the next upload, keeps reading the number it always read.

Derived terms, as a textbook has them:

- **TVD** is vertical depth below the depth reference.
- **TVDSS** = TVD - reference elevation: depth below the vertical datum,
  positive down. **Elevation** = -TVDSS.
- **Air gap** (offshore) = reference elevation. **Mudline** is at TVD =
  reference elevation + water depth, TVDSS = water depth.
- **Depth below mudline** = TVD - (reference elevation + water depth).
- **Height of the reference above ground** (onshore) = reference elevation -
  ground level. **Depth below ground** = TVD - that height.

## 3. One module

`src/lib/wellDatum.js`, beside the units door (`src/lib/units`) and the wells
registry. It is the only place that turns MD, TVD, TVDSS, elevation and depth
below mudline or ground into one another. The minimum-curvature path itself
stays in the vendored engine (`makeDepthFrame`); the module calls it with a
zero offset and applies the datum itself.

- `readWellDatum(well)`: the well's datum, with a `state`:
  - `set`: the new columns state the reference elevation.
  - `legacy-kb`: no new value, `kb_m` is not 0. Read as a kelly bushing
    elevation, and said.
  - `unset`: the columns exist, no value, `kb_m` is 0. TVDSS is refused with
    the reason and where to fix it.
  - `legacy-zero`: the columns do not exist yet (migration not applied) and
    `kb_m` is 0. Today's behaviour is kept (TVDSS equals TVD) with an honest
    note, because nobody can state a datum yet.
- `makeWellFrame(well)`: MD to TVD, TVDSS, elevation, depth below mudline or
  ground and back, through the survey. Where the datum cannot give a value the
  result is NaN and `frame.datum` carries the reason; nothing assumes 0.
- Scalar conversions (`tvdssFromTvd`, `tvdFromTvdss`, `belowSurfaceFromTvd`,
  `surfaceTvd`) for callers that already hold a TVD.
- `validateDatum(input)`: refuses a non-numeric elevation, a negative water
  depth, water depth on an onshore well, ground level on an offshore well, a
  reference below ground; warns on a negative reference elevation and on a
  ground level that disagrees with a GL reference.
- `datumFromEntry(fields, unit)` and `datumToEntry(datum, unit)`: feet and
  metres through the unit registry (`src/lib/units`), exact factors.
- `proposeDatumFromLas(parsed)`: EKB, EGL, EDF, APD, EPD, LMF, DMF, PDAT into
  a proposal with its reasons and conflicts. A proposal fills the editor; it
  is never saved without the user's confirmation.
- `datumChangeImpact(well, counts, next)`: what a correction moves.
- `datumPatch(...)`, `datumColumnsPresent(row)`: the write side, used by the
  registry service.

Readers moved onto the module (each had its own `kb_m ?? 0` arithmetic):
Well Data Manager (detail, tops sheet, exports, data sheet, inventory),
the shared log viewers (`depthModes`), the shared section kit used by Well
Correlation, Stratigraphy and Mapping (`useSectionWells`, `sectionFrame`,
`horizons`), Petrophysics (zone averages, saturation height, report,
exports), Seismolord (visible wells, synthetics and ties, tops to horizons),
Earth Modeling (well paths), Pore Pressure (prep, depth references, layer
cake datum), Rock Physics, Basin handoff, Geomechanics and Well Design where
they read a registry well, Wellsite (well context, offsets), the `.pld`
sidecars.

## 4. Migration

`supabase/migrations/20261002090000_geo_wells_datum_model.sql`. Additive,
nullable columns only; idempotent; one `DO` statement, so it is one
transaction however it is sent, and it has no `begin` or `commit` line of its
own. Checks: the reference kind list, environment list, unit list, water
depth not negative, no water depth onshore, no ground level offshore, the
change record is an array. No policy, grant or trigger change.

Backfill rule (the only data this file writes itself; see section 8 for what
the team-editing triggers add to the wells it touches): where `depth_ref_elev_m` and
`depth_ref_kind` are both NULL and `kb_m` is not 0, set `depth_ref_kind =
'KB'` and `depth_ref_elev_m = kb_m`; where the well's `units_note` starts
with `entered: KB/TD ft`, set `elev_unit = 'ft'`. A `kb_m` of exactly 0 is
left unset, because section 1 shows 0 was the default at every door. The
vertical datum name and the environment are not backfilled: nothing stored
says which they are. The apps keep reading such a well's elevations as above
mean sea level, as they always have, and say that the datum is not named.

Owner command, from the Suite primary checkout:

```
supabase db query --linked -f supabase/migrations/20261002090000_geo_wells_datum_model.sql
```

## 5. Before and after the migration

Staging shares the production database, so the code detects the columns on
the rows it reads (`'depth_ref_elev_m' in row`).

| | Before apply | After apply |
|---|---|---|
| Reading | `kb_m` is the reference elevation (kind KB); a 0 is used as before with the note that the registry cannot tell 0 from not entered | The new columns; a well with no value refuses TVDSS-dependent output and says why |
| Editing | The editor saves the elevation into `kb_m` and says the full datum (kind, ground level, water depth, datum name) will be kept once the registry is upgraded | Every field saved; "not set" can be saved |
| Change record | An entry merged into `crs_provenance.datum_changes` (the registry's existing provenance object; Wellsite's survey source and the other keys there are kept) | An entry in `datum_changes`; earlier entries in `crs_provenance` are still read, so the history is continuous |
| `.pld` | Rows carry no datum fields | Rows carry them; an older package imports and reads as `legacy-kb` |

## 6. Correcting a datum

Changing the reference elevation of a well that has data is a correction. The
editor shows, before saving: the shift in metres and the display unit; how
many tops move in TVDSS and elevation (MD unchanged); how many curves read at
a new TVDSS; the checkshot table (re-derived through the new elevation when
its entry convention is recorded, left as stored otherwise); Seismolord ties
and synthetics, top maps, correlation sections and published pore pressure
curves, which must be re-run. The user confirms; the record says who and
when. Wellsite corrects KB through the same door (the owner of the registry
well), and its own header copy follows.

## 7. Validation

`src/lib/__tests__/wellDatum.test.js`: a hand-worked offshore well (KB 25 m
above MSL, 100 m of water) and onshore well (ground 312 m, KB 318.5 m) on a
deviated path (vertical to 1,000 m MD, a 30 degree build over 300 m, a
1,000 m tangent). The build arc has radius 300 / (pi/6) = 572.958 m, so it
adds 572.958 x sin 30 = 286.479 m of TVD and the tangent 1,000 x cos 30 =
866.025 m: TVD at 2,300 m MD is 2,152.504 m. Offshore: TVDSS 2,127.504 m,
depth below mudline 2,027.504 m. Onshore: TVDSS 1,834.004 m, depth below
ground 2,146.004 m, and a point at 200 m MD is 118.5 m above sea level.
Negative controls: adding the elevation instead of subtracting it, and
ignoring it, both fail. Hostile inputs: feet and metres through the unit
registry, a negative KB, water depth on an onshore well.

## 8. Status (2026-10-02)

- Module, migration file, registry door, shared editor, Well Data Manager,
  the shared viewers and section kit, Petrophysics, Rock Physics, Pore
  Pressure, Basin handoff, Earth Modeling, Seismolord, Mapping, Well
  Correlation, Stratigraphy (through the kit), Wellsite, Well Design, the
  `.pld` sidecar and sink: built on PR #848.
- Geomechanics reads no well elevation from the registry (its wellbore comes
  from Well Design), so nothing changed there.
- Migration: logged NOT APPLIED. Scratch dry run 60 of 60. Live rolled-back
  dry run (one statement that always raises, nothing kept, verified), run
  again after the team-editing migration was applied: 13 wells before and
  after, `kb_m` unchanged, 12 stated as KB, Lad unset, the four
  `entered: KB/TD ft` wells marked ft.
- At the apply, beside the team-editing triggers now on `geo_wells`: the 12
  backfilled wells each get version + 1, `updated_at` = the apply time and
  one history line with no author and the summary "Datum model: the earlier
  KB stated as the depth reference (migration, no depth changed)". An editor
  open on one of them at that moment is told a newer version was saved and
  reopens. Lad is not touched.
- Tests: `wellDatum.test.js` (52), `wellDatumReaders.test.js` (15, with the
  source guard), `wellsRegistryDatum.test.js` (11), WDM `u2Datum.test.jsx` (5)
  and `crsAssignKeepsProvenance.test.jsx` (2), Wellsite `upgradeU2Datum.test.jsx`
  (9), Earth Modeling `upgradeDatum.test.js` (3), portability
  `wellDatumPortability.test.js` (6); e2e WDM and Seismolord wells specs
  updated.

### What each app does before and after the apply

| App | Before apply | After apply |
|---|---|---|
| Well Data Manager | `kb_m` shown as the KB; a 0 noted; the editor saves the elevation only and says so; the change record in `crs_provenance` | Full datum saved; a well with none withholds TVDSS; record in `datum_changes` |
| Petrophysics, Rock Physics | As today | TVDSS empty with the reason and saturation height refused on a well with none |
| Well Correlation, Stratigraphy | As today (`no KB: TVDSS = TVD` on a 0) | `no depth reference: TVDSS withheld`; not drawn in TVDSS or time |
| Seismolord | As today | Such a well is not drawn, with the reason; synthetics, ties and Tops to Horizons refuse it |
| Mapping | As today | A TVDSS top map leaves it out with the reason |
| Earth Modeling | As today | Left out of ties, properties and the scene; named in the build notes |
| Pore Pressure | As today | No onshore TVDSS for it, with the reason |
| Basin | As today | Unchanged (TVD only); `registryKbM` null |
| Wellsite | KB correctable now (saved in `kb_m`) | A registry well with none gives a live well no KB; offsets with none left out and named |
| Well Design | Publish writes the KB as before, a 0 as 0 | Publish states the datum; a 0 publishes not set; a stated registry datum is never overwritten |
| `.pld` | Rows carry no datum fields | Rows carry them |

Only Lad changes behaviour at the apply, and it has no tops, curves or
checkshots.

### With organisation sharing (#849, merged before this PR)

The datum door (`updateWellDatum`) writes through the sharing store like
every other write on the well row, so the version check, the check-out and
the change history apply to it: from Well Data Manager's editor a stale save
is refused with the reason, and a colleague who holds the check-out of a well
shared for editing can correct the datum (the change record names them). The
two geo_wells migrations are independent: this one adds only the datum
columns, the team-editing one only its own, and they apply in either order
(the team-editing one is applied; the backfill passes its summary through
that migration's pass-through column only when the column exists). Wellsite's Correct KB stays with the owner of the registry well.

### Open

- The seismic reference datum stays declared per app (Pore Pressure,
  Seismolord), not on the well.
- A datum per wellbore (sidetracks) is not modelled; the registry has one row
  per well.
- Wellsite keeps its own ground level and RT offset in the live well header.
- Ground level and mudline are not drawn as markers on sections yet.
- Who besides the owner may correct a datum is for the organisation sharing
  wave (its lock and history columns are separate from `datum_changes`).
- Alaoma-1 and Alaoma-2 KB values (1 m, 2 m): owner to check.
