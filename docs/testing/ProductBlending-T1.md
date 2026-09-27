# Product Blending Optimizer: senior test T1

- App: Product Blending Optimizer (Midstream & Downstream)
- Wave / position: Wave 6, #81 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #713
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - least-cost blend by LP;
  - properties blended on their proper bases (octane on volume, sulfur on
    mass, RVP through the index);
  - giveaway and shadow prices.
- Coverage before T1: blend optimizer engine goldens and the page full-precision tests; no human walk

## How it was tested

I used `/dev/studio/blending` at 1366 x 768 on the default 50 ppm gasoline
specification and the illustrative pool, for 1,000 bbl.

## Verdict

**Demo-ready after T1, at S3. The recipe and every property hand-check.**

- Recipe: reformate 516.0, FCC 414.9 and butane 69.1 bbl. Isomerate is
  unused at $89.
- RON = (516 x 100 + 414.9 x 92 + 69.1 x 94) / 1000 = **96.27**. MON is
  **85.27**.
- Sulfur on mass is (412.8 x 2 + 311.2 x 120 + 40.1 x 1) / 764.1 =
  **50.0 ppm**, binding. Density is **0.764**.
- RVP index RVP^1.25 gives 0.516 x 3.95 + 0.415 x 9.39 + 0.069 x 139.9 =
  15.60, so 15.60^0.8 = **9.00 psi**, binding.
- Cost is 47,472 + 34,852 + 3,800 = **86,124**, or $86.12/bbl. The RON
  giveaway is 5.266 x 0.6 x 1000 = **$3,160**.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| BL-T1-001 | S3 | The recipe chart showed a stray black legend square (a single series coloured per bar). | Legend removed; the components are named on the axis. |
| BL-T1-002 | S3 | Money printed without grouping ("$86123", "$3160"). The binding RVP giveaway read "-0.00" (solver round-off). | Thousands are grouped, and anything under half the last digit shows as 0.00. The full-precision test is updated to the grouped total. |

## Tests

- `e2e/blending-t1.spec.js` checks:
  - $86.12/bbl, $86,123 and RON 96.27;
  - no "-0.00" and no legend;
  - a 0.6 RON value prices the giveaway at $3,160.
- Blend optimizer jest: 3 pass (full-precision expectation updated).
