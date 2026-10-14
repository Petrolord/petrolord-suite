# Basin Modelling with Petrolord: lesson plan

Twelve lessons on Basin & Charge Modeling, Ekene kit v4 plus the basin files
(`tools/demo-video/seed/basin_assets.mjs`: Ekene-1 column, temperatures,
vitrinite and Rock-Eval; the East kitchen column; the traps). Oilfield units
(ft, F). Each lesson saves only models named "Lesson Xn: ..." and its setup
removes them first; seeded models come from `storyboards/basin-fixtures`.

| Lesson | Title | Model | What it shows |
|---|---|---|---|
| A1 | The workspace and a new model | none, then Lesson A1: Ekene-1 | modes, Expert tabs, the model list, units, a new model, the deposition and step defaults |
| A2 | Building the column from a well | Lesson A2: Ekene-1 | registry tops, the column file (ages, hiatus, eroded thickness, lithology, mixed layers), the TD row, layer details |
| A3 | Burial history and decompaction | Lesson A3: Ekene-1 (seeded) | burial plot; instant against continuous deposition; the time step; the eroded section; maximum-burial compaction |
| B4 | Heat flow and the surface | Lesson B4: Ekene-1 (seeded) | seabed temperature, constant heat flow against a history, conductivity of sand and shale, the Thermal tab |
| B5 | Correcting bottom-hole temperatures | Lesson B5: Ekene-1 (seeded) | the calibration import below KB, raw BHTs, Horner, AAPG and Harrison, the DST |
| B6 | Calibrating to vitrinite and temperature | Lesson B6: Ekene-1 (seeded) | the misfit, residuals, Auto-Fit 58.5 mW/m2, a wrong heat flow by eye |
| C7 | Source rocks from Rock-Eval | Lesson C7: Ekene-1 (seeded) | TOC, HI, Tmax from the Rock-Eval file; kinetics (Pepper and Corvi); the Akata at Ekene-1 barely generates |
| C8 | Maturity and the kitchen | Lesson C8: East kitchen | the pseudo-well column file, maturity windows 0.55, 1.3, 2.0, isolines on the burial plot |
| C9 | Generation and expulsion | Lesson C9: East kitchen (seeded) | transformation ratio, the retention threshold, oil and gas windows, the critical moment |
| D10 | Traps and charge timing | Lesson D10: East kitchen (seeded) | a trap typed by hand, the charge table, factor bands, a young trap |
| D11 | Sensitivity and scenarios | Lesson D11: East kitchen (seeded) | migration efficiency sweep, source Ro against heat flow, scenario comparison |
| D12 | Hand-offs and the report | Lesson D12: East kitchen (seeded) | Prospect Risking, the pressure profile to Pore Pressure Studio, the PDF report and CSV |
