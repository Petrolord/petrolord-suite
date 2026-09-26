# Capital Portfolio Studio: senior test T1

- App: Capital Portfolio Studio (`/dashboard/apps/economics/capital-portfolio-studio`)
- Wave / position: Wave 2, #28 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #652 to #655
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Aucerna Portfolio (PlanningSpace), Palantir FUSION, spreadsheet knapsack
- Coverage before T1: D4/E5 exact knapsack, EC5-0 Monte Carlo risk metrics (oracle-gated)

## How it was tested

New harness `/dev/capital-portfolio-studio` on the in-memory Supabase
double, with a new `DevAuth` stand-in user (the app reads `useAuth().user`;
`AuthContext` is now exported for dev harnesses). One portfolio with a 500
$MM limit and four projects:

| Project | Capex | P50 | POS | Fail cost | Risked EMV |
| --- | --- | --- | --- | --- | --- |
| A | 200 | 120 | 100% | 0 | 120 |
| B | 150 | 80 | 100% | 0 | 80 |
| C | 250 | 150 | 60% | 40 | 0.6 x 150 - 0.4 x 40 = 74 |
| D | 100 | 30 | 100% | 0 | 30 |

## Verdict

**Demo-ready after T1 (no S1).** The optimizer is right. Enumerating the
feasible sets by hand, A + B + D (capex 450, EMV 230) beats A + B (200),
A + C (194) and B + C + D (184). The app funds exactly that set, and its
frontier data runs 0/0, 100/30, 150/80, 200/120, 300/150, 350/200, 450/230.

The frontier chart, however, never showed the answer. The x axis ran to
the data maximum, so the funded set sat on the plot edge and was clipped.
The star meant to mark the optimum was invisible.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CPS-T1-001 | S2 | Efficient frontier clipped its own last point: the optimum (450, 230) and its star never rendered | Axes run to the capex limit with headroom and round ticks (0 to 600 / 0 to 250); animation off |
| CPS-T1-002 | S3 | Frontier legend overlapped the x-axis title | Shared legend band and axis-label height |
| CPS-T1-003 | S3 | Deleting a project needed one click with no confirmation (portfolio delete already confirmed) | Confirmation dialog |
| CPS-T1-004 | S3 | Workbench table showed two of four projects (stacked action icons in a 256 px box) | Actions on one line; taller scroll box |
| CPS-T1-E1 | Enhancement | No harness | `/dev/capital-portfolio-studio` with `DevAuth` |

## Tests

`e2e/capital-portfolio-t1.spec.js` (optimum 230 / 450; frontier axis to
600 with the optimum star visible). CPS jest 19/19.
