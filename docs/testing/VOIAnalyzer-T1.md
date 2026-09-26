# Value of Information Analyzer: senior test T1

- App: Value of Information Analyzer (`/dashboard/apps/economics/value-of-information-analyzer`)
- Wave / position: Wave 2, #27 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #652 to #654
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: DPL, PrecisionTree, TreeAge
- Coverage before T1: E2 real tree diagram, EC4-0 consistency check (withheld VOI on contradictory indicators)

## How it was tested

A new harness, `/dev/voi-analyzer`, runs the app on the in-memory Supabase
double. I ran the default "Phoenix" study (drill decision with a 3D seismic
option) at 1366 x 768 and checked every figure by hand.

## Verdict

**Demo-ready (no S1).** All four figures are right:

| Figure | Hand calculation | Result |
| --- | --- | --- |
| EMV without information | 0.3 x 300 + 0.7 x (-50) - 40 | 15 |
| EMV with information | drill on positive (0.6 x 300 + 0.4 x (-50) - 40 = 120), walk away on negative; 0.4 x 120 - 10 | 38 |
| Net VOI | 38 - 15 | 23 |
| EVPI | 0.3 x 260 - 15 | 63 |

The indicator numbers are consistent: 0.4 x 0.6 + 0.6 x 0.1 = 0.30.

The decision tree beside the numbers was hard to read. Each branch label
sat at the branch midpoint, on top of the parent node's EMV text, so
"Dry Hole (p=0.40)" was printed across "EMV 160 $MM". Five collisions
showed on the default tree.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| VOI-T1-001 | S2 | Branch labels overprinted node EMV labels (5 collisions on the default tree) | Label moved to the child end of its branch: right aligned, above a rising branch and below a falling one. Columns widened to 240 px, and all tree text gets a white halo. The shared TreeDiagram also serves the Decision Tree Builder. |
| VOI-T1-002 | S3 | KPI tiles read "$15.00M" while the tree and the inputs use $MM | "$15.00MM" |
| VOI-T1-E1 | Enhancement | No harness existed | `/dev/voi-analyzer` on the in-memory double |

## Tests

- `e2e/voi-analyzer-t1.spec.js` checks the four figures and asserts that
  no branch label box intersects a node label box. The negative control
  (the old layout) fails with the five collisions.
- The existing decision-studio T1 e2e still passes.
- VOI and decision-tree jest: 45 tests pass.
