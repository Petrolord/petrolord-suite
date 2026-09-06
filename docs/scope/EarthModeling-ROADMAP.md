# Earth Modeling, EM series (Petrel tester readiness, 2026-09)

Status: **planned 2026-09-06**, executed autonomously as the next door
in the Geoscience loop after Mapping & Surface Studio's MS series (the
owner's standing instruction: continue the tester-readiness waves from
one Geoscience app to the next). Decisions below are v1 defaults the
owner may override; each is cheap to revisit.

## Why this app, and why now

The Petrel testers walked Well Data Manager, Petrophysics Studio, Well
Correlation and (with MS0 to MS5) Mapping & Surface Studio. Mapping now
launches into Earth Modeling (`?surface=`) and Earth Modeling reads the
fault polygons drawn in Mapping, so it is the next window a tester opens.
Audit of the app as built (G8, 2026-07-14; 2,108 lines incl. engines and
e2e) against what a Petrel user expects of a structural framework:

| Area | Today | A Petrel user expects |
|---|---|---|
| Units | Metres everywhere; volumes in 10^6 m3 | Depth in the account's unit (ft by default, like Mapping); rock volume in acre-ft or 10^6 m3, pore volume in MMbbl or 10^6 m3 |
| Model frame | The top surface's frame, no choice | A cell size, an extent, a boundary polygon to clip to |
| Well ties | Residuals reported, surfaces untouched | "Adjust to wells": the surface passes through the tops, residuals near zero |
| Horizons | Registry surfaces only | Derived horizons: parallel to a surface at a thickness, proportional between two |
| Section | Straight line between two wells, metres, no wells drawn | Any polyline on the map, vertical exaggeration, ft, wells with a GR track and top ticks, PNG |
| Properties | Constant, plane, simple kriging with typed parameters | Ordinary kriging with a fitted variogram (the Mapping engine), property maps with variance |
| Deliverables | Publish grids, QC tables on screen | Volumes CSV in the chosen units, launchers into ReservoirCalc Pro and Mapping, a help guide |
| 3D | None | A 3D window of the framework (G8.5 stretch) |

## Program

| Wave | Theme | Engine PR? | One line |
|---|---|---|---|
| EM0 Units and frame | depth unit, volume units, model frame, boundary | no | Account depth unit (shared with Mapping), volume units, cell size and boundary clip from geo_culture |
| EM1 Well adjustment | surfaces through the tops | yes | Residual field (TPS through the tie residuals, radius-limited) added to each surface; toggle per surface; before/after residuals; oracle golden |
| EM2 Derived horizons | parallel and proportional surfaces | yes | Parallel-to at a constant or isochore thickness, proportional between two; stackable and publishable |
| EM3 Section window | polyline section | no | Drawn polyline or well pair, vertical exaggeration, ft or m, projected wells with a GR track (shared painter) and top ticks, PNG |
| EM4 Property kriging | ordinary kriging | no | Mapping's kriging engine with Fit for property population, variance map per property |
| EM5 Deliverables | exports, links, help | no | Volumes CSV in chosen units, Open in ReservoirCalc Pro and Mapping, help guide, ?wells= consumer |
| EM6 3D window | framework in 3D | no | Seismolord viewer core lifted to a shared location (G8.5), surfaces, wells, faults; stretch |

## Recorded decisions (v1 defaults, 2026-09-06)

- The engine keeps metres positive-down; display converts at the edge
  through the shared depth unit (`geoscience_settings.depth_unit`, the
  Mapping MS5 column) with `localStorage` as the fallback.
- Volume units are a display choice (`em.volumeUnits`): metric (10^6 m3)
  or field (acre-ft for bulk and net, MMbbl for pore and HCPV). The
  QC tables and the CSV carry the unit in every header.
- Well adjustment is a residual-field correction: TPS through the tie
  residuals at the tie positions, faded to zero beyond a radius (default
  three times the median well spacing), added to the surface. It is a
  build option per surface, off by default, and the QC table shows
  residuals before and after.
- Derived horizons are computed surfaces in the definition (parallel-to
  and proportional); they take part in the stack like registry surfaces
  and publish to geo_surfaces on request.
- The section is a polyline on the map (two or more vertices) or the
  well pair; wells within a projection distance (default two cells) draw
  as a GR column through the shared track painter when curves exist.
- Property kriging uses the Mapping kriging module (ordinary, fitted
  variogram, trend removal); simple kriging stays for saved models that
  ask for it.
- The 3D window is attempted last and only if EM0 to EM5 are on main.

## Wave log

- **EM0 (2026-09-06), branch `feat/em0-units-frame`.** Depth displays in
  the account's Geoscience unit (`geoscience_settings.depth_unit`, ft
  default, browser fallback `em.depthUnit`; ribbon toggle `em-depth-unit`
  writes it back): map labels and readout for depth layers, the section
  axis, the tie table (MD, TVDSS, surface z, residual). Volume units are
  a display choice (`em-volume-units`: metric 10^6 m3, or field acre-ft
  for bulk and net and MMbbl for pore and HCPV; `services/units.js`,
  tested), the table headers carry the unit. The definition gains
  `frame: {cellM, boundaryId}`: `frameSpec` keeps the top surface's
  origin and extent and recounts nodes for the cell; a boundary polygon
  from Mapping (geo_culture kind boundary, both backends'
  `listBoundaries`) nulls every node outside it on every surface and
  thickness, so map, section and volumes stop at the lease line and the
  status says "clipped to". e2e: unit toggle changes the residuals,
  field units change the headers and the bulk value, a 25 m cell gives
  the expected frame, the fixture lease shrinks the cell count.
- **EM1 (2026-09-06), branch `feat/em1-well-adjustment`, engines PR #139
  (906e456, subtree pulled).** "Adjust surfaces to the well tops" in the
  dock (`em-adjust-on`, radius `em-adjust-radius`, empty = three times
  the median tie spacing). The build resamples, computes the tie
  residuals on the raw surfaces, adds a Franke-Little correction field
  per tied surface (exact at the tie, zero beyond the radius; a
  background weight 1/R^2 the oracle forced, see the engine header),
  then clamps as before. QC gains a "Well adjustment" card (per surface
  ties, max residual before and after) and a Before column in the tie
  table; the build status names the surfaces adjusted and the residual
  range. Fixture: the worst tie (W2 TopA, 35.8 m) drops under 0.3 m.
