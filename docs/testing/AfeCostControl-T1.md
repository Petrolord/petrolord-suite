# AFE & Cost Control: senior test T1

- App: AFE Cost Control Manager (`/dashboard/apps/economics/afe-cost-control-manager`)
- Wave / position: Wave 6, #71 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: AFE and earned value practice (PMI EVM: CPI, SPI, EAC), JV partner billing
- Coverage before T1: engine goldens (economics/afe.js) and the EC5 gates (36 AFE tests); no human walk

## How it was tested

Wave 6 adds a shared harness at `/dev/studio/:app` for the Wave 6 and 7
studios, with per-app worked seeds. AFE-2026-014 is seeded as follows:

- budget $8.5M, window 2026-06-01 to 2026-12-31;
- three lines, RIG, CSG (with an entered forecast) and SVC, with actuals,
  commitments and progress;
- two invoices, one 40% non-operating partner, and a pending $300k change.

I walked the dashboard, cost breakdown, invoices, changes and partners at
1366 x 768.

## Verdict

**Demo-ready after T1. It was S2 before, because the partner billing
screen named the software vendor as the operator.**

- EAC per line is max(budget, actual + commitment) unless a forecast is
  entered: 5.0 + 2.3 + 1.5 = $8.8M against $8.5M, variance -$300k.
- Actual $5.2M is 61.2% of budget. Commitments are $1.2M.
- EV: 3.0 + 1.8 + 0.45 = $5.25M, so CPI = 5.25 / 5.2 = 1.01.
- SPI at 2026-09-27: 118 of 213 days gives PV $4.71M, so SPI = 1.11.
- JV split: 60% operator of $5.2M = $3,120,000, and the partner
  recovers $2,080,000.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| AFE-T1-001 | S2 | The operator row on the Partners tab was labelled "Petrolord (Operator)". Every customer's own operator share was named after the software vendor. The Type column read `partner.type`, but rows are saved with `partner_type`, so it was always blank. | "Operator (your share)"; the Type column reads the saved type (Non-Operator by default). |
| AFE-T1-002 | S3 | All three dashboard charts were dark, off the Suite chart standard (no white frame, no logo, oversized default legends). Money axes printed "$10000k", "$7500k". | White framed charts with the logo, theme grid, axis, tooltip and legend tokens. Axes read $10M, $7.5M, $1.5M. |
| AFE-T1-003 | S3 | The header printed a dangling " - " and "Class:" when those fields were empty. The AFE search called `afe_name.toLowerCase()` and `afe_number.toLowerCase()`, which throw on a null value (for example an imported AFE with no name). Invoice dates wrapped mid-date. | The header joins only the present parts. The search guards nulls. Dates stay on one line. |

## Tests

- `e2e/afe-cost-control-t1.spec.js` checks:
  - the header, EAC $8.8M and 61.2% spent;
  - the $10M axis label, and no "$10000k";
  - the operator label, the $3,120,000 share, and the Non-Operator type.
- AFE jest: 36 pass, including the "no invented partner literal" guard,
  which the harness seed respects.
