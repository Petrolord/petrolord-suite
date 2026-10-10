# QI with Petrolord: lesson series plan

Teaching series on QI Studio, Rock Physics Studio and Seismolord, built on the
Ekene kit v3 (`dist-demo/ekene-demo-v3`, truth in `10-qi/ekene-qi-truth.md`).
Same format as "Petrophysics with Petrolord":
- Daniel's voice.
- No subtitles (YouTube captions them).
- 1440x810 viewport.
- Every number spoken is checked on screen by `expectText`.

Lessons depend on the demo account state described in `../qi-common.mjs`. A
lesson's setup puts the account in the state the lesson starts from.

## Module A: Should we do QI here?
1. **A1 What a QI study asks.** The two questions (is the data good enough, can the seismic see the fluid). A new QI project; wells, target and volumes.
2. **A2 The data inventory and the usability matrix.** Each cell explained; Ekene-9 without density; what "limited" means.
3. **A3 Seismic QC.** Noise, bandwidth and amplitude balance per volume; issues into the register.

## Module B: Rock physics first
4. **B4 Shear logs.** Measured DTS against Greenberg-Castagna; calibrating the local trend (Ekene trend 4.4 percent above GC at 3 km/s).
5. **B5 Fluids and Gassmann.** Batzle-Wang brine and live oil at 180 degF and 3200 psia. Oil-to-brine substitution on Ekene-1: AI up 7.5 percent, Vp/Vs up 7.2 percent.
6. **B6 Crossplots and the wet trend.** AI against Vp/Vs; distance from the brine line; facies.
7. **B7 Modelled AVO.** Intercept, gradient and class at the Ekene top. In situ against brine; the Oboro gas polarity flip; publishing the gather per well.

## Module C: Tying the wells
8. **C8 Synthetics and wavelets.** Statistical and well wavelets; phase; correlation.
9. **C9 Bulk shift, anchors and the time-depth record.** Committing the tie to the checkshots; what every other app then reads.
10. **C10 The field wavelet.** QI Studio's ties table; averaging the wavelets across wells.

## Module D: From gathers to angle stacks
11. **D11 Gathers on the worker.** Offset byte and bin width; the gather store; prestack QC (residual moveout, stretch mute).
12. **D12 Angles from velocity.** RMS velocity to incidence angle; ranges; the usable angle and fold; angle stacks into Seismolord.

## Module E: AVO on the seismic
13. **E13 AVO volumes.** Intercept, gradient and fluid factor from near, mid and far stacks; reading them in Seismolord.
14. **E14 AVO at the wells.** Model against seismic, one scale over all wells, class agreement and misfit; what a disagreement means.

## Module F: Inversion and the decision
15. **F15 Post-stack inversion.** Model-based inversion with the field wavelet; the blind-well table; the low-frequency model and horizons.
16. **F16 Simultaneous inversion.** AI, SI and density from the angle stacks. Why density needs the far angles; blind wells per parameter.
17. **F17 Properties from impedance.** Porosity and facies calibrated at the wells, left out in turn.
18. **F18 Prospects and the report.** Trap, anomaly and conformance; evidence and competing explanations; the QI assessment and the report.

## Order of work
The three demos come first. After that, the lessons are built module by module
(A to F), each dry-run on the demo account before it is recorded.
