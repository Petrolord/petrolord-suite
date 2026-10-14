# Earth Modelling with Petrolord: lesson plan

Twelve lessons on Earth Modeling with the Ekene demonstration field (kit v4),
oilfield units (feet), Daniel voice, British English, no burned-in subtitles.
Every lesson starts from an empty workspace, stacks the booked six-well maps
("Ekene Sand top/base (6-well map)") and saves only models named "Lesson ...".

Companion demos: em-01 (maps and logs to a static model), em-02 (the
cross-check with ReservoirCalc Pro, 12.14 MMstb), em-03 (uncertainty and
hand-offs).

## Module A: the framework

| Lesson | Title | What it shows |
|---|---|---|
| A1 | The workspace and the framework | Explorer, dock, views; stacking the top and base; ties and zone by name; the frame and the clamp report |
| A2 | Tying the surfaces to the wells | The well-tie table; Ekene-8 and Ekene-9 drilled after the maps (residuals); adjust surfaces to the well tops |
| A3 | Zones, contacts and the volume table | OWC and Bo; bulk against HC bulk and HC area; the open edge; bound the leg by the closure and spill |

## Module B: rock properties

| Lesson | Title | What it shows |
|---|---|---|
| B4 | Zone averages or the logs | The published zone averages: pay averages, wet wells empty; NTG as net reservoir; switching to the logs |
| B5 | Upscaling the logs | The upscaled table; cutoffs and what they change; Sw only above the OWC |
| B6 | Layers | One zone into proportional layers; layer maps; section bands; the volume is added layer by layer |

## Module C: population and QC

| Lesson | Title | What it shows |
|---|---|---|
| C7 | Constant, trend, inverse distance, kriging | The four methods on the same control; the model against the wells; histograms |
| C8 | Variograms and variance | Ordinary kriging with a fitted variogram; the variance map; the kriging range of volume |
| C9 | Sw from saturation height | The SCAL J function, the free-water level, the transition zone in Sw |

## Module D: volumes and hand-offs

| Lesson | Title | What it shows |
|---|---|---|
| D10 | Reconciling with ReservoirCalc Pro | The booked case typed: 18,058 acre-ft, 418 acres, 12.14 MMstb in both apps; Prospect to RCP |
| D11 | Volume uncertainty | The Monte Carlo distribution: contact, Bo and kriged properties; P90, P50, P10 |
| D12 | Delivering the model | Save, report PDF, volumes CSV, GRDECL with permeability, publish a layer |
