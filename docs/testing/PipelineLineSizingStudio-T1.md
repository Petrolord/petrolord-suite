# Pipeline & Line Sizing Studio: senior test T1

- App: Pipeline & Line Sizing Studio (`/dashboard/apps/facilities/facility-network-hydraulics`)
- Wave / position: Wave 5, #62 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684 to #690
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Darcy-Weisbach / Colebrook line sizing, API RP 14E erosional velocity, ASME B31.4 / B31.8 Barlow wall, pigging volume
- Coverage before T1: Suite line sizing gates (51) and engine goldens; no human walk

## How it was tested

I used `/dev/facilities/pipeline` at 1366 x 768. The default is a liquid
line carrying 8,000 bpd of 35 API oil at 3 cP through 15,000 ft of
6 in sch 40, with a 15 ft/s velocity limit. I walked line sizing (with
the schedule sweep), profile, wall thickness and pigging.

## Verdict

**Demo-ready after T1. It was S2 before, because the recommended size
spent about 700 psi.**

- Line sizing:
  - 0.520 ft3/s over 0.2006 ft2 = 2.59 ft/s;
  - Re 34,400 with e/D 3e-4 gives f = 0.0236;
  - dP = 0.0236 x 15,000 / 0.5054 x 53 x 2.59^2 / 64.35 / 144 =
    26.9 psi;
  - RP 14E: 100 / sqrt(53) = 13.7 ft/s.
- Profile: a net zero elevation change, so the line arrives at
  900 - 26.9 = 873.1 psia.
- Wall: 1,440 x 6.625 / (2 x 52,000 x 0.72) = 0.1274 in, plus 0.0625 =
  0.1899 in. The MAOP of the 0.28 in wall is 2,458 psig.
- Pigging: 0.2006 x 15,000 ft3 = 536 bbl; x 0.409 holdup = 219 bbl;
  run time 15,000 / 5 = 0.83 h.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| LS-T1-001 | S2 | In liquid service the schedule sweep passed a bore on velocity and erosion only. "Recommended size 3 in sch 40, smallest bore passing every limit" was a line spending about 700 psi over the default 15,000 ft. Gas service already checked that the outlet stayed above atmospheric; liquid had no pressure check at all. | A liquid "Allowable pressure drop (psi)" input (default 100; blank sizes on velocity alone) is enforced by the sweep. The recommendation is now 6 in sch 80. A unit gate checks that the budget fails over-budget bores and moves the recommendation up. |
| LS-T1-002 | S3 | Every failing row read "fails" with no reason. The dP legend swatch was black. | Rows name what they break ("fails dP", "fails dP, velocity, erosional"), and the dP cell is amber when over budget. The legend says "green passes, amber fails". Warnings capitalise their first letter. |

## Tests

- `e2e/pipeline-line-sizing-t1.spec.js` checks:
  - the dP and the 6 in sch 80 recommendation;
  - the named failures;
  - the wall and MAOP, and the pig volume.
- Line sizing jest: 51 pass, including the new budget gate.
