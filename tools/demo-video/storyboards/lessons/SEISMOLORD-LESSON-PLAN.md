# Seismolord videos: plan

Three sales demos and an 18-lesson teaching series, "Seismic Interpretation with
Petrolord", on the Ekene kit v3:
- the full stack, angle stacks and gathers;
- wells with tops and checkshots;
- truth surfaces in `02-surfaces`.

The format matches the QI series:
- Daniel's voice, feet.
- No subtitles on lessons.
- Every number spoken is checked on screen with `expectText`.
- Long worker jobs are cut out of the finished video.

The lessons follow the nine Seismolord handbooks (2026-08-21). Where a lesson
overlaps the QI series (well ties), it refers to QI lessons C8 to C10 rather than
repeating them.

## Sales demos
1. **From SEG-Y to a first horizon.** Import EKENE3D-full.sgy:
   - the geometry the file really has, against what its textual header claims;
   - byte mapping and the CRS declaration;
   - inline, crossline and time slice, gain and colour;
   - a seeded horizon track of the top Ekene Sand.
2. **The wells build the framework.** Tops to horizons:
   - tie, match and track ten horizons from six wells;
   - automatic fault picking on the Ekene fault;
   - the 3D window.
3. **From horizons to volumes.**
   - an amplitude map and a variance volume;
   - a depth surface with the velocity model;
   - the handoff to ReservoirCalc Pro and the volumetrics there.

## Module A: Getting the seismic in
1. **A1 SEG-Y in practice:** IBM and IEEE samples, trace headers, byte mapping, and a textual header that lies.
2. **A2 Coordinates:** the project CRS, declaring a survey's CRS, and the area-of-use check.
3. **A3 Viewing:** sections and slices, polarity, gain, AGC, colour maps, and why gain is never baked in.

## Module B: Horizons
4. **B4 Picking a horizon:** manual, seeded tracking and correlation tracking; picking a peak against a zero crossing.
5. **B5 Tracking QC:** confidence, rejects, the eraser and versions.
6. **B6 Tops to horizons:** a framework from the wells, and leave-one-well-out misties.

## Module C: Faults
7. **C7 Fault sticks** by hand.
8. **C8 Automatic fault detection:** variance, fault likelihood and the area of interest.
9. **C9 Horizons across faults:** fault jump, throw and the framework.

## Module D: Wells in the seismic
10. **D10 Wells on the section:** paths, tops and logs on the seismic.
11. **D11 Time to depth:** checkshots, the velocity model, and depth conversion of a horizon.

## Module E: Attributes and maps
12. **E12 Attributes along a horizon:** amplitude, RMS, interval attributes and stratal slices.
13. **E13 Volume attributes:** variance, spectral decomposition and co-rendering.
14. **E14 Surfaces and the Map window:** gridding, coverage and contours.

## Module F: Delivery
15. **F15 Export:** XYZ, CPS-3, ZMAP+, Irap and Charisma, and the conventions each one expects.
16. **F16 Into ReservoirCalc Pro:** a gross rock volume from the Seismolord surface.
17. **F17 Projects, sharing and sessions:** working as a team.
18. **F18 2D lines and the large-survey path:** SEG-Y 2D, and very large volumes on the seismic worker.

## Order of work
1. Demo 1, then demos 2 and 3.
2. Modules A to F in order, each dry-run on the demo account before it is recorded.
3. App defects found on the way are fixed with tests and merged on green, as in the QI series.
