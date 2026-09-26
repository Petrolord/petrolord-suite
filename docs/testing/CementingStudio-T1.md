# Cementing Studio: senior test T1

- App: Cementing Studio (`/dashboard/apps/drilling/cementing`)
- Wave / position: Wave 3, #37 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #663 and #664
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: CemCADE, Halliburton iCem, API 10D / 10TR4
- Coverage before T1: D4 build (plug-flow placement against oracle goldens)

## How it was tested

The existing `/dev/cementing` harness loads the golden 7 in job: shoe at
3,000 m, TOC at 1,200 m, a lead/tail split at 1,400 m and 15% open-hole
excess. I walked job design, placement and centralization at 1366 x 768
and checked the figures by hand.

## Verdict

**Demo-ready after T1 (no S1).** The volumes and placement are right:

| Quantity | Hand calculation | App |
| --- | --- | --- |
| Tail slurry | 0.011782 m2 x 1.15 x 1,600 m + 0.78 m3 shoe track | 22.5 m3 |
| Lead slurry | 0.013356 m2 x 200 m | 2.7 m3 |
| Sacks | 25.1 / 0.0382 | 658 |
| Displacement | 2,960 m x 0.019377 m2 | 57.4 m3 |
| Job time | 86.5 m3 at 20 L/s | 72 min |
| Float differential | about 5,750 kPa (tail, lead and spacer against displacement mud) | 5,714 kPa |

The job has a shoe fracture EMW of 1.75 g/cc, and the placement's peak ECD
at the previous shoe is 1.658. Neither the quality checklist nor the chart
set one against the other. The loss check is the first thing a cementing
engineer reads. The chart even carried a "frac EMW" line, but it sat off
the auto axis and was never drawn.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CMT-T1-001 | S2 | The quality checklist did not compare the peak ECD at the previous shoe with the shoe fracture EMW | A sixth item, "Peak ECD ... against the shoe fracture EMW ..." with the margin, or a losses warning. It is added in the Suite wrapper from values the engine already returns. |
| CMT-T1-002 | S3 | The ECD chart's fracture line sat off the auto axis; ticks repeated (1.65, 1.65) at 2 decimals | The line extends the axis; 3-decimal ticks |
| CMT-T1-003 | S3 | Standoff depth axis ran from 15 m with odd ticks; legends over axis titles | From surface with round ticks; shared legend band |

## Tests

- `e2e/cementing-t1.spec.js`: volumes, sacks, the 6/6 checklist with the
  fracture item, and the fracture line drawn.
- The existing `cementing-studio.spec.js` still passes.
- Cementing jest: 9/9 pass.
