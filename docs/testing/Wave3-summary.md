# Wave 3 summary (Senior Testing Programme, drilling, 2026-09-26)

Ten drilling apps (#34 to #43), each tested on its dev harness at
1366 x 768, with the figures checked by hand. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- the full jest suite green before merge. The only failure was
  `assuranceHubRender`, which already fails on main.

Well Design and Wellsite were rechecked in Wave 1B, and Well Cost was
tested in Wave 2.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 34 | Torque & Drag Studio | #662 | S2 | Lockup (negative surface load) never stated; warnings did not name their operation |
| 35 | Hydraulics Studio | #663 | S3 | Surge/swab limits off the axis; ECD chart did not start at surface |
| 36 | Well Control Studio | #664 | S2 | Influx density used along-hole height as vertical (1.03 against 0.90 g/cc) |
| 37 | Cementing Studio | #665 | S2 | Checklist never compared the peak ECD with the shoe fracture EMW |
| 38 | Geomechanics Studio | #666 | S3 | Mud window axis stretched to 12 g/cc by shallow values |
| 39 | Casing & Tubing Design | #667 | S2 | Tubing FAIL did not state the failing check |
| 40 | Completion Design Studio | #668 | S3 | Float noise in inches; clearance basis unstated |
| 41 | Perforation & Sand Control | #669 | S2 | Underbalance band went past the 870 psi sanding margin; Saucier band never drawn |
| 42 | Stimulation Designer | #670 | S2 | A 30 m frac on a 77 m (vertical) interval, never flagged |
| 43 | Well Integrity & P&A | #671 | S2 | Plug rules failed a plug against a zone it sits below; element names unreadable |

Every app is Demo-ready after T1. No S1 was found in Wave 3: the drilling
engines were already validated against oracle goldens. The defects were in
what the screen told the engineer.

## Suite-wide pieces

- Drilling copy sweep (#671): prose em dashes removed from user-facing
  strings across the drilling apps.
- The engine conventions found in this wave are stated on screen through
  Suite wrappers. The vendored engines and goldens are unchanged.

## Held for the owner

- One production zip after the Wave 3 merges. Cut it with
  `cut_suite_zip.sh`, purge the CDN, and check `/version.json`.
- Engine follow-ups for `petrolord-engines`, after NAPE:
  - `wellControl.js`: the kill sheet's influx height and the kick
    tolerance volume both use the along-hole length as the vertical height.
  - `tdAnalysis` wear text: it still says collapse derating "ships with D6".
  - `plugAbandonment.js abandonmentProgram`: the step text gives the slurry
    to 1 decimal, while the total uses 2.
