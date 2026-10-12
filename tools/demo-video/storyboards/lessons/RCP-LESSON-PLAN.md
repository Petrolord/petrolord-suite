# ReservoirCalc Pro videos: plan

Owner directive 2026-10-12: three demos of 5:00 or less, then a lesson series
of about 8 to 12, non-stop. Same pipeline and standard as the Seismolord
series: Daniel's voice, 4K, depth in feet, every spoken number checked on
screen (`expectText`), no em dashes and no "X, not Y" in any copy.

## Data on the demo account

- Kit `ekene-demo-v4`. The booked six-well Ekene Sand maps
  (`02-surfaces/EkeneSand-{top,base}-6wells.zmap`) are elevations below the
  rig floor (KB 25 m; wells 1 to 7 are vertical, so MD). `seed/rcp_assets.mjs`
  writes the same grids on the registry's datum (sea level, TVDSS) and the
  seven-well grids (Ekene-7 added, same engine, frame and options as the
  booking). `seed/rcp.mjs` imports the six-well TVDSS grids through Mapping
  & Surface Studio as **Ekene Sand top (6-well map)** and **Ekene Sand base
  (6-well map)**. No other video uses these names.
- Booked case: contact 1560 m MD = 1535 m = 5,036 ft TVDSS (typed -5036.1),
  NTG 0.80, porosity 0.20, Sw 0.35, Bo 1.20: STOIIP 12.14 MM stb (kit
  12,139,208), GRV 18,058 acre-ft over 418 acres. With Trap only on, the
  spill is the map edge (the booked map stops at the outer wells), so the
  booked case runs with Trap only off and is a minimum for the mapped area.
- Seven-well maps: 10.42 MM stb (NAPE quant, `/root/nape-paper/quant`).
- Monte Carlo, structural mode, 50k, seed 20261109, no correlations:
  - before evidence (assumption ranges): P90 8.73, P50 19.36, P10 36.54
    (NAPE engine run: 8.83, 19.43, 36.56);
  - evidenced, six-well map: P90 11.32, P50 12.14, P10 13.00 (NAPE 11.37,
    12.13, 12.94).
  Ranges as in the NAPE results (contact and depth converted to feet).
- Registry zones (Petrophysics publishes): Ekene Sand on Ekene-1, 2, 3, 4;
  Ekene-2 and 4 have no net pay. Pay averages from Ekene-1 and 3:
  porosity 0.191, Sw 0.442. NTG in a Surfaces run is net reservoir over
  gross, 0.948 (fix #1035; it was net pay, 0.4525).

Lesson and demo takes only create items named "Lesson ..." or
"RCP demo ..." and clean them up in setup. Demo 3 replaces the
(6-well map) grids in place and its setup puts the six-well grids back.

## App fixes found while scripting

- #1033 Mapping: Replace grid from a file, in place (demo 3 needs the
  registry row to keep its id so RCP's source-changed notice fires).
- #1035 RCP: registry NTG in a Surfaces or Hybrid run is net reservoir (the
  contact was applied twice).
- Waits on #1034 (preview sizing, another agent) before any take.

## Demos

1. **rcp-01 From interpretation to volumes.** Surfaces method; top and base
   from the registry; the map and 3D previews; contact 5,036 ft TVDSS; Trap
   only and the open map; zone averages from Petrophysics through the Wells
   tab; the volume; the booked case (12.14 MM stb) and the report.
2. **rcp-02 How sure are we.** Probabilistic, structural mode: assumption
   ranges give P90 8.7 / P50 19.4 / P10 36.5 and a tornado led by GRV and
   the contact; evidence (MDT contact, checkshot-tied depth, signed-off
   cutoffs, core porosity, PVT Bo) narrows it to 11.3 / 12.1 / 13.0 from
   the same rock; P90 up by about 30 percent.
3. **rcp-03 When the data changes.** Ekene-7 finds the sand 18.6 ft deep;
   the mapper replaces the top and base in Mapping (Replace grid from a
   file); the saved RCP project opens with "Registry source changed";
   Refresh; 12.14 to 10.42 MM stb; the audit trail records the decision.

## Lessons: "ReservoirCalc Pro lessons" (12, Modules A to D)

Module A: Structure
- A1 The workspace and the four methods (Simple, Hybrid, Surfaces,
  Area-depth); units; the volumetric chain from rock to oil.
- A2 Surfaces in: registry and files, units, datum and sign, what the
  import read, the map and 3D previews.
- A3 Contacts, closure and spill: Trap only, the open-closure warning, the
  contact sweep.
- A4 Area-depth tables and areas of interest.

Module B: Rock and fluid
- B5 Zone averages from the registry: weighting, net pay against net
  reservoir, choosing wells.
- B6 Saturation height: Sw from the capillary curve against a constant.
- B7 Fluids: Bo from PVT and correlations, solution gas, a gas cap.

Module C: Uncertainty
- C8 Monte Carlo: distributions, structural mode, seed, P90/P50/P10.
- C9 Correlations and fitting a distribution from data.
- C10 Sensitivity: tornado, spider and variance share.

Module D: Delivery and the chain
- D11 Reports and exports: the PDFs, the slide, CSV, report details.
- D12 Projects, sharing, source-changed notices, and the links to
  Material Balance, Recovery Factor and Prospect Risking.

Plans per lesson are firmed up after a dry run of each.
