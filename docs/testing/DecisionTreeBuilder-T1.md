# Decision Tree Builder: senior test T1

- App: Decision Tree Builder (`/dashboard/apps/economics/decision-tree-builder`)
- Wave / position: Wave 6, #72 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: EMV rollback (Raiffa decision trees; the approach behind TreeAge and PrecisionTree)
- Coverage before T1: decision tree gates (22) and the shared TreeDiagram fixed for VOI in Wave 2; no human walk

## How it was tested

I used `/dev/studio/decision-tree` at 1366 x 768 with the opening
prospect decision:

- Drill for $40MM, with a 0.3 chance of $300MM and a 0.7 chance of a
  -$10MM dry hole;
- Farm out, with a 0.3 chance of a $60MM carry;
- Do nothing.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Drill: 0.3 x 300 + 0.7 x (-10) = 83, less the 40 cost = 43.
- Farm out: 0.3 x 60 = 18. Do nothing: 0.
- Optimal EMV 43 (Drill). Next best 18, so the advantage is 25.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| DT-T1-001 | S3 | On the rolled-back tree, the outgoing branches ran through the decision and chance node labels ("EMV 83.0 $MM" crossed by both branches). The lowest branch label collided with the legend ("outco Do nothing"). | Node labels sit above and right of decision and chance nodes, and terminal labels stay beside their triangle. The legend has its own band below the last row. This is the shared diagram, so VOI and FDP benefit, and their T1 specs still pass. |

## Tests

- `e2e/decision-tree-t1.spec.js` checks the optimal EMV and advantage,
  the node label, and that the lowest branch label clears the legend.
- VOI and FDP T1 specs pass. Decision tree jest: 22 pass.
