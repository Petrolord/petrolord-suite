# Storage Tank & Venting Designer: senior test T1

- App: Storage Tank & Venting Designer (`/dashboard/apps/facilities/storage-tank-designer`)
- Wave / position: Wave 5, #67 (Senior Testing Programme; facilities and process safety)
- Build tested: main 3ad8894b4 plus #690 to #695
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: API 650 one-foot shell design, API 2000 normal and emergency venting, AP-42 ch. 7.1 fixed-roof losses
- Coverage before T1: tank smoke tests and engine goldens; no human walk

## How it was tested

I used `/dev/facilities/tank` at 1366 x 768. The default is a 120 ft x
40 ft tank at a 38 ft design liquid level, SG 0.85, 8 ft courses,
23,200 / 24,900 psi, a 1/16 in corrosion allowance, filling at 500 bbl/h
and drawing at 800 bbl/h. I walked shell, venting and losses.

## Verdict

**Demo-ready after T1. It was S2 before, because of the minimum plate
thickness.**

- Capacity: pi/4 x 120^2 x 40 / 5.6146 = 80,574 bbl (2,014 bbl/ft).
- Shell, one-foot method, course 1:
  - product: 2.6 x 120 x 37 x 0.85 / 23,200 + 0.0625 = 0.4854 in;
  - hydrotest: 2.6 x 120 x 37 / 24,900 = 0.4636 in, so the product case
    governs.
- Venting: inbreathing 800 x 5.6146 = 4,492 plus 80,574 thermal (1 scfh
  per bbl) = 85,066 scfh, so vacuum governs, as flagged.
- Fire: 11,310 ft2 wetted to 30 ft gives 44.26 MMBtu/hr. The vent figure
  is withheld with a reason, which is the right call given the
  air-equivalence ambiguity it describes.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| TK-T1-001 | S2 | The default minimum plate was 3/16 in on a 120 ft tank. API 650 (5.6.1.1) requires 5/16 in for 36 to 60 m (120 to 200 ft), so the top course showed 0.1875 in where the standard requires 0.3125 in. The hint only said the band table "is not carried here". | The default is 5/16 in. The hint states the API 650 bands (3/16, 1/4, 5/16, 3/8 in by diameter) and that the engine does not apply them, so the user sets the right value. |
| TK-T1-002 | S3 | Engine notes named input keys ("the stated workingTurnoverFactor"), spoke of "this repository", and began lowercase. | Notes pass through a plain-language filter (turnover factor, latitude factor, "here") and capitalise their first letter. |

## Tests

- `e2e/storage-tank-t1.spec.js` checks the capacity, course 1, the
  5/16 in minimum, inbreathing, and no developer text.
- `TankStudio.smoke.test.jsx`: 4 pass, with the hint assertion updated.
- Engine follow-up (after NAPE): carry the API 650 minimum-thickness
  table in the engine.
