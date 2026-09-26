# Torque & Drag Studio: senior test T1

- App: Torque & Drag Studio (`/dashboard/apps/drilling/torque-drag`)
- Wave / position: Wave 3, #34 (Senior Testing Programme; drilling)
- Build tested: main 1347bb314 (Wave 2 merged)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Landmark WELLPLAN T&D, Drillbench
- Coverage before T1: D1 build (soft-string Johancsik against an independent RK4 oracle and goldens), human tester feedback (moderate)

## How it was tested

The existing `/dev/torque-drag` harness, which loads the oracle golden
horizontal well (TD 2,800 m MD, 1,215 m TVD), was walked at 1366 x 768
across all four tabs: string and geometry, analysis, casing wear and the
friction sweep.

## Verdict

**Demo-ready after T1 (no S1).** The numbers hold up:

- Pickup hookload is 633.5 kN, matching a rough hand balance of about 635
  kN. The pieces:
  - buoyancy factor 0.817;
  - about 186 kN for the vertical 700 m of drill pipe;
  - build weight about 150 kN, and build friction about 100 kN;
  - lateral friction 0.35 x 573 kN = 200 kN.
- The friction sweep reproduces the analysis figure at the case's
  factors: 633 kN at 0.25 cased / 0.35 open.

What the screen said about those numbers was the problem. The golden
case's slack-off and slide-drill surface loads are negative (-17.3 and
-157.6 kN), so that pipe would have to be pushed from surface. The app only
said "Buckling onset 0 m" plus two warnings that did not name their
operation.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| TD-T1-001 | S2 | A negative surface load (lockup) was never stated, and warnings did not name their operation | Each negative surface load is stated per operation with its consequence: no weight on bit when sliding; the pipe will not run in under its own weight when tripping in. Every engine warning is prefixed with its operation, and the buckling KPI names the operation that buckles first. |
| TD-T1-002 | S3 | The casing wear note (engine text) and the help guide said collapse derating "ships with the D6 casing upgrade" | Points to Casing & Tubing Studio, which has shipped; the engine text is left as is (vendored) |
| TD-T1-003 | S3 | Wear chart depth axis ran from 15 to 1185 m with odd ticks | Runs from surface with round ticks |
| TD-T1-004 | S3 | The sweep's operation picker showed raw keys ("trip out") | Operation names |

## Tests

- `e2e/torque-drag-t1.spec.js`: lockup statements, named warnings, and the
  collapse note.
- The existing `torque-drag-studio.spec.js` still passes.
- T&D jest: 20/20 pass.
