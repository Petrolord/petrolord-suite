# Facility Layout Mapper: senior test T1

- App: Facility Layout Mapper (`/dashboard/apps/facilities/facility-layout-mapper`)
- Wave / position: Wave 5, #58 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 to #686
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: plot-plan spacing practice (onshore production spacing tables), API 521 flare radiation setback
- Coverage before T1: layout tag and spacing unit tests; no human walk

## How it was tested

I used `/dev/facilities/layout` at 1366 x 768. I placed a separator and a
flare about 41 m apart at zoom 17 and read the safety spacing panel with
the default duty: 20 kg/s relief, LHV 46,000 kJ/kg, F 0.3, and
4.73 kW/m2 allowed.

## Verdict

**Demo-ready after T1. It was S1 before, because the studio could not be
used at all.**

- Flare setback, point source: D = sqrt(F Q LHV / (4 pi K)) =
  sqrt(0.3 x 20 x 46,000 / (4 pi x 4.73)) = 68.1 m. The studio's figure
  is identical.
- The pair fails both rules: 41.4 m against 68.1 m for radiation (39%
  short) and against 60 m from the spacing table (31% short). Both are
  listed, with the largest shortfall named.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FLM-T1-001 | S1 | The basemap was CARTO's raster tiles, which now answer every request with an "API KEY REQUIRED" image. The map was blank on every domain. | OpenStreetMap standard tiles, the source the Well Spacing map uses, with attribution. |
| FLM-T1-002 | S1 | Leaflet's stylesheet (and leaflet-draw's) was never imported, so tiles and controls scattered across the page. | Both stylesheets are imported by the map panel. The same missing import was fixed in the Well Spacing map. |
| FLM-T1-003 | S1 | The map instance came from `whenCreated`, which react-leaflet 4 (installed: 4.2.1) no longer calls. `mapRef` was never set, so the layer effect returned early, and no placed equipment or pipeline was ever drawn. The pipeline length (`mapRef.current.distance`) would also have thrown. | The instance comes from `ref`, and a state mirror re-runs the layer effect once the map exists. Equipment draws with its sequential tag. |

## Tests

- `e2e/facility-layout-t1.spec.js` checks:
  - that the tiles come from OpenStreetMap;
  - that two placed items draw as markers with their tags;
  - the 68.1 m flare setback and a failing check.
- Layout mapper jest: 9 pass.
