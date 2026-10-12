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

## Recording notes (lessons, from 2026-10-12)
- The lessons run on kit v4 (`EKENE3D-v4-full.sgy`, the listric growth fault), like the re-recorded demos.
- Storyboards: `lessons/seis-<module><n>.mjs`, shared helpers in `lessons/seis-common.mjs`. A lesson creates and removes only items named "Lesson ...", so the demos' horizons, faults and surfaces stay as they are.
- Lessons A1 and A2 use a lesson file that is not in the kit, `EKENE3D-v4-vendor.sgy` (the small cube under a wrong textual header), made by `seed/seis_lesson_assets.py`. Neither lesson imports anything.
- Module A: A1 4:28, A2 3:31, A3 4:03. Module A is the public YouTube module.
- Module B: B4 3:25, B5 3:15, B6 4:37. B5 teaches QC on a real tracking failure: correlation tracking from Ekene-1 crosses the growth fault onto a deeper footwall event. B6 runs Tops to Horizons without accepting (the demos' framework stays).
- Fixes found while scripting Module B: the Tops to Horizons prognosis in the user's depth unit (#1022).
- Module C: C7 2:49, C8 3:24, C9 2:31. C7 places its sticks at the kit's answer key; C8 runs Detect faults without saving (the demos keep Auto-1 and Auto-2); C9 tracks the footwall with Stop at faults.
- Fix found while scripting Module C: Stop at faults leaked round a fault that runs off the survey (#1023).
- Recording note: kill the old site server by its exact PID, and clear a take's profile service worker after a site rebuild, or the take can run on the old bundle.
- Module D: D10 3:12, D11 3:16. Module E: E12 2:40, E13 2:26, E14 recorded after #1028. Module F: F15 2:24, F16 onward.
- Fixes found while scripting Modules D to F: layer-cake depth conversion across holes in boundary horizons (#1026), the Make surface cell display (#1027), and a dialog opened from a right-click menu locking the page (#1028).
- Lessons that save something use names no demo uses ("Lesson ...", "Ekene Sand (Interval RMS)", "Ekene Sand (TWT ms)") and remove them in setup. D11 runs the calibration fit but never applies it; F16 uses an unsaved ReservoirCalc Pro workspace.
