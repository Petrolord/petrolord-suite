# SCAL Studio: senior test T1

- App: SCAL Studio (Reservoir Management)
- Wave / position: Wave 7, #86 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 and #719
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - Corey relative permeability;
  - Leverett J-function (field constant 0.21645, Tiab & Donaldson);
  - saturation-height, h = Pc / (0.4335 x delta gamma).
- Coverage before T1: SCAL engine goldens and page tests (149 in the filtered run); no human walk

## How it was tested

I used `/dev/studio/scal` at 1366 x 768 on the defaults:

- Swc 0.2, Sor 0.25;
- krw 0.35, kro 0.9;
- nw 2.5, no 2.0.

For the J curve the defaults are a = 0.25, b = 1.4, Swirr 0.15, k 150 md,
phi 0.22, sigma 26 and theta 30, with gamma 1.05 / 0.80.

## Verdict

**Demo-ready after T1, at S3. The curves and the conversions hand-check.**

- Span 1 - 0.2 - 0.25 = **0.550**. 0.35 S^2.5 = 0.9 (1 - S)^2 at S =
  0.6415, so the crossover is at Sw = **0.553**.
- At Sw 0.5:
  - Sw* = 0.4118 and J = 0.25 x 0.4118^-1.4 = 0.866;
  - Pc = 0.866 x 26 cos 30 / (0.21645 sqrt(150/0.22)) = 3.449 psi;
  - h = 3.449 / (0.4335 x 0.25) = **31.8 ft**.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| SCAL-T1-001 | S3 | "Height at Sw = 0.5" read 32.5 ft, which is the height of the first 61-point grid row below 0.5 (about 0.488), 2% high. | The engine evaluates Sw = 0.5 itself (`pcFromJ` then `heightFromPc`), giving 31.8 ft. |
| SCAL-T1-002 | S3 | Saturation axes printed auto ticks at one decimal, so 0.25 and 0.75 showed as "0.3" and "0.8". The kr curve's 0.75 endpoint sat under a "0.8" label. The legends overlapped the axis titles. | Ticks at 0.2 steps on every saturation and fraction axis, with the Suite legend and label band. |
| SCAL-T1-003 | S3 | Em dashes in every parameter label ("Swc — connate water") and in the lab chart title. An em dash also served as the empty-value mark. | "Swc, connate water"; "Lab kr with Corey fit: name"; "-" for empty values. |

## Tests

- `e2e/scal-studio-t1.spec.js` checks:
  - span 0.550 and crossover 0.554;
  - Sw ticks 0.0 to 1.0 in 0.2 steps;
  - height at Sw 0.5 = 31.8 ft;
  - no em dash on the page.
- SCAL jest passes (149 in the filtered run).
