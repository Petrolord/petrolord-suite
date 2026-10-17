# Earth Modelling with Petrolord: lesson plan

Twelve lessons on Earth Modeling with the Ekene demonstration field (kit v4),
re-recorded after the 3D grid upgrade (2026-10-17: 25 m x 2.5 ft cells, zones
from the well tops, the cap, SGS porosity, the skeleton, contacts, the player
and the charts),
oilfield units (feet), Daniel voice, British English, no burned-in subtitles.
Every lesson starts from an empty workspace, stacks the booked six-well maps
("Ekene Sand top/base (6-well map)") and saves only models named "Lesson ...".

Companion demos: em-01 (maps and logs to a 3D grid), em-02 (the
cross-check with ReservoirCalc Pro: 12.09 MMstb on the fine grid, 12.14 on the
map cells), em-03 (seeds, the tornado, the probability curve and hand-offs).

## Module A: the framework

| Lesson | Title | What it shows |
|---|---|---|
| A1 | The workspace and the framework | Explorer, dock, views; stacking; ties and zone by name; the 25 m frame and the traced edge against node cells; the clamp report; the grid skeleton in 3D |
| A2 | Tying the surfaces to the wells | The well-tie table; Ekene-8 and Ekene-9 drilled after the maps; the split tops tie their wells; adjust surfaces to the well tops |
| A3 | Zones, contacts and the volumes | Zones from the well tops and the cap; OWC and Bo; volumes by zone and the Details table; the contact plane, fluid zones and map lines; the open edge |

## Module B: rock properties

| Lesson | Title | What it shows |
|---|---|---|
| B4 | Zone averages or the logs | The published zone averages: pay averages, wet wells empty; NTG as net reservoir; the logs into every cell; histograms |
| B5 | Upscaling the logs | The 2.5 ft cells along each well; cutoffs; Sw only above the OWC; facies; histograms; the Vsh cutoff |
| B6 | Layers in the grid | Proportional, follow top and follow base; 2, 2.5 or 3 ft; the skeleton; the player sweeping the layers |

## Module C: population and QC

| Lesson | Title | What it shows |
|---|---|---|
| C7 | Constant, trend, kriging and simulation | Five methods on one layer in the player; the model against the wells; the histograms |
| C8 | Variograms, seeds and variance | The SGS variogram and seed; another realisation; kriging's fitted variogram, the variance map and the range |
| C9 | Sw from saturation height | The SCAL J function, the free-water level, Sw in 3D and the transition zone in the player |

## Module D: volumes and hand-offs

| Lesson | Title | What it shows |
|---|---|---|
| D10 | Reconciling with ReservoirCalc Pro | The booked case on the fine grid (12.09) and on the map cells (18,058 acre-ft, 418 acres, 12.14 MMstb); why; Prospect to RCP |
| D11 | Volume uncertainty | The tornado; the Monte Carlo distribution with shared draws; the probability curve; the contact alone |
| D12 | Delivering the model | Save, report PDF with pictures, volumes CSV, fine-layer GRDECL, publish a layer |
