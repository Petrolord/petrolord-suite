# Well Design with Petrolord: lesson plan

Twelve short lessons (about 2 to 3 minutes each) in Well Design Studio on the
Ekene demonstration kit (ekene-demo-v4), oilfield units: depths in feet, site
coordinates in metres (EPSG:32632). TVDSS = MD - 82 ft on Ekene (KB 25 m).

Every site a lesson makes is named "Lesson ..." and its setup deletes it
first. The registry surfaces "WDS demo: Oboro Sand top" and "WDS demo: Ekene
Sand top" are the series' own (seed/wds.mjs, files from seed/wds_assets.mjs).
Ekene-8 carries the Pore Pressure Studio prognosis the mud window lessons read
(published once by the seed, NCT on shale picks 1,000 to 3,900 ft below the
mudline, Eaton n 3).

The pad (wds-common.mjs `buildPad`): Ekene Alpha, origin 401700 E 521600 N,
slots 2.5 m apart. The registry's Ekene-8 and Ekene-9 sit on S3 (the origin,
their published wellhead); Ekene-10 (S1) and Ekene-12 (S2) are wellbores with
the kit's surveys imported; Ekene-11 is planned on S5.

| # | Module | Lesson | What it shows |
|---|---|---|---|
| A1 | Set up | Sites and slots | Site, CRS EPSG:32632, pad origin, slot template, the tree |
| A2 | Set up | Wellbores and the three norths | Slot, KB 82 ft, water depth, depth unit, grid/true/magnetic, WMM2025 declination and convergence |
| A3 | Set up | Targets from the registry | T1 by hand from the kit table; From top (Oboro Sand in Ekene-8); From surface with a stand-off (T1 26.2 ft below the Oboro Sand top map) |
| B4 | Design | Build and hold, and the KPI strip | J to T1, KOP and build rate, segments, the KPIs |
| B5 | Design | S-profile, curve to target and Point | The other solvers on the same target, what each answers |
| B6 | Design | Horizontal landing on T2 | Heel and toe targets, landing azimuth and inclination from heel to toe |
| B7 | Design | The plan editor and what Save means | Plan view table edits, undo, station interval, Save as the authority |
| C8 | Clearance | Uncertainty | EOU on plan and section, the ISCWSA MWD Rev4 model, survey program |
| C9 | Clearance | Anti-collision | Offsets, the SPE-187073 rule, ladder, distance mode, traveling cylinder, saved run |
| C10 | Clearance | Actual surveys | Excel import (sheet, preview, mapping), definitive composite, plan vs actual, project ahead |
| D11 | Hand-offs | The mud window and casing seats | Prognosis from Ekene-8 by TVDSS, ppg EMW, trip and kick margins, seats on Ekene-11 MD |
| D12 | Hand-offs | When the map changes, and the report pack | Source changed notice on a surface target, refresh, re-solve; wall plot and AC report |

Narration is written after a dry run: every number spoken is the number on
screen, and `expectText` steps stop a take that disagrees.
