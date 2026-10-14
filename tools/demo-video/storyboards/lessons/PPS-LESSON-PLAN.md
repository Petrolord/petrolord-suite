# Pore Pressure with Petrolord: lesson plan

Twelve short lessons (about 2 to 3 minutes each) on Pore Pressure Studio, on the Ekene
demonstration kit (ekene-demo-v4, `05-pressure/` and `01-wells/Ekene-1.las`, `Ekene-9.las`).
Oilfield units throughout: depth in feet, pressure in psi and ppg EMW.

Data rules: the lessons work on "PPS demo: Ekene-1", a copy of the kit's Ekene-1 LAS loaded as its
own registry well (`seed/pps.mjs`), and read Ekene-9 without saving or publishing anything on it.
Well Design Studio sites are named "PPS lesson ..." (never "Lesson ...", which the Well Design Studio
setups clear). Each setup deletes the demo user's Pore Pressure Studio project and the curves this
studio published on "PPS demo:" wells, so every take starts from a new project.

| # | Lesson | What it shows |
|---|---|---|
| A1 | The workspace and the water column | Registry wells, the water column from the well's datum, depth frames (below mudline, TVD RKB, TVDSS, MD), psi and ppg EMW, the depth readout |
| A2 | Overburden and hydrostatic | Density integrated from the seawater down, the pore fluid column, Gardner where a well has no density (Ekene-9, read only) |
| A3 | The normal compaction trend | The NCT view on a log axis, gamma ray shale picks above the ramp, picks in sand, the fit; what happens when the trend is picked inside the overpressure |
| B4 | Eaton in the shales | Eaton's exponent, pressures from every sample against pressures from shale samples, the underpressure warning, the interpreted line |
| B5 | Bowers and unloading | The velocity against density crossplot, the loading curve, the samples below it, U and sigma max |
| B6 | Resistivity as a second opinion | Eaton on the deep resistivity, its trend fitted on the same shales, exponent 1.2, compared with the sonic at the Ekene Sand |
| C7 | Pressure tests | MDT pretests through the import door (rows for the open well, psia to gauge), the misfit, Fit n on the shown prognosis |
| C8 | The fracture gradient | Eaton's Poisson's ratio, Matthews and Kelly, Daines; LOT and FIT; calibrating to the leak-off tests; a FIT as a lower bound |
| C9 | Mud weights as evidence | Mud weights held over intervals, the 9.8 ppg influx at 4,652 ft, the evidence line |
| D10 | The drilling window and casing seats | Trip and kick margins, bottom-up seats, the shallowest seat, the window per section |
| D11 | Publish, the CSV and the report | Publish and its provenance, the publish state chip, Prognosis CSV, the reviewer PDF |
| D12 | The prognosis downstream | Well Design Studio's mud window from an offset well by subsea depth, reviewing a design against a prognosis, the notice when it changes |

Storyboards: `lessons/pps-a1.mjs` to `lessons/pps-d12.mjs`, helpers in `pps-common.mjs`.
