# Refinery Planning & Scheduling Studio: senior test T1

- App: Refinery Planning & Scheduling Studio (Midstream & Downstream)
- Wave / position: Wave 6, #82 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #714
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: LP refinery plan with stream shadow prices, a plan-to-schedule cascade, and actuals variance on the same event model
- Coverage before T1: planning engine goldens and the panel tests; no human walk

## How it was tested

I used `/dev/studio/refinery-planning` at 1366 x 768 on the default
two-crude, two-unit, four-product plan for 30 days, across all three tabs.

## Verdict

**Demo-ready after T1, at S3. The plan and the schedule hand-check.**

- Light sweet runs 909,091 bbl, exactly what fills the reformer: 0.22 x
  909,091 + 0.15 x 2,000,000 = 500,000 naphtha. Medium sour is at its
  2,000,000 limit. The CDU is at 2,909,091 of 4,000,000 (73%).
- Products:
  - gasoline 425,000 (0.85 x 500,000);
  - jet 396,364;
  - diesel 900,000;
  - fuel oil 1,054,545;
  - offgas 108,182, which is surplus.
- Revenue is 47.6 + 42.02 + 90.9 + 65.38 = **$245.90M**. Crude costs
  $222.55M and opex $4.99M, so the margin is **$18,360,000**, or
  **$6.31/bbl**.
- Light sweet without naphtha loses 82 + 1.2 - 66.59 = $16.6/bbl. A free
  naphtha barrel backs out 1 / 0.22 = 4.545 bbl of it, which is
  **$75.50**, the naphtha shadow price shown.
- Schedule: 2 cargoes of 454,545 and 4 of 500,000. CDU runs are 2,909,091
  / 5 = 581,818, and gasoline lifts are 85,000.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RP-T1-001 | S3 | The Actuals tab, with nothing recorded, read actual margin $0 and a red variance of -$18,360,000. It also said 8 movements were unmatched, as if the month had been lost. | It reads "nothing recorded" with no variance or unmatched note until an actual is entered. |
| RP-T1-002 | S3 | The schedule, the actuals picker and the variance lines printed internal ids (crude_a, cdu, fuel_oil). | Names throughout (Light sweet, Crude distillation, Fuel oil) through a shared `materialName`. |
| RP-T1-003 | S3 | The product-slate chart showed a stray black legend square, and the surplus offgas was worth "$-0.00". | Legend removed; solver round-off shows as $0.00. |

## Tests

- `e2e/refinery-planning-t1.spec.js` checks:
  - a $18,360,000 margin at $6.31/bbl;
  - naphtha at $75.50, with no $-0.00 and no legend;
  - schedule names, not ids;
  - no variance before an actual.
- Refinery planning jest: 3 pass.
