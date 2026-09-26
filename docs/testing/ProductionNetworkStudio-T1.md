# Production Network Studio: senior test T1

- App: Production Network Studio (`/dashboard/apps/production/production-network-studio`)
- Wave / position: Wave 4, #51 (Senior Testing Programme; production)
- Build tested: main 0cce190e4 plus #676 to #679
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PIPESIM / GAP network solves (gathering systems, separator pressure sensitivity)
- Coverage before T1: engine goldens (networkSolve), Suite network gates; no human walk

## How it was tested

I used `/dev/production/network` at 1366 x 768. The default network is
three wells (P-1, P-2, P-3) on flowlines to a header, then a trunk to a
180 psia separator. I walked the solve, results, and the separator
sensitivity from 80 to 400 psia.

## Verdict

**Demo-ready after T1. It was S2 before, because the sweep silently
stopped short of its range.**

- Rates: 1,417 + 417 + 2,271 = 4,105 stb/d.
- Pressures close on the header: 263 - 43 = 233 - 14 = 274 - 55 =
  219 psia, and 219 - 39 = 180 psia at the separator.
- Backpressure cost: standalone 4,327 minus 4,105 in the network =
  222 stb/d (5.1%).
- Bottleneck: P-1's flowline ranks highest on pressure per pound of
  fluid moved. By oil rate alone P-2 would look worse (14/417 against
  43/1,417). P-2's stream is heavier per barrel of oil, so the engine's
  mass basis is the right one, and the screen now says so.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| NET-T1-001 | S2 | The separator sweep dropped every pressure whose solve failed, from both the chart and the table. It was asked for 80 to 400 psia and ended at 309 without a word. 217, 354 and 400 psia were missing. | Every pressure is listed. A failure states its reason, with the engine's floats rounded. |
| NET-T1-002 | S2 | The sweep solved each pressure from a cold start, so Newton stalled after one iteration at 354 and 400 psia. | Continuation: the base pressure is solved first, and the sweep marches outward seeding each solve with its neighbour's pressures (cold retry as fallback). 354 and 400 psia now solve (2,909 and 2,683 stb/d). |
| NET-T1-003 | S3 | 217 psia sits on P-2's shut-in switch (flowing at 171, shut in at 263), a kink the Newton step cannot settle on. | The row says so and names the well. A robust solve across a shut-in switch is recorded for the engines repo. |
| NET-T1-004 | S3 | "Most pressure per unit carried" read as per barrel of oil, and the figures on screen seemed to contradict it. | "per pound of fluid moved (oil, water and gas together)", with the reason stated. |
| NET-T1-005 | S3 | The first column of well nodes was clipped at the left edge. The sweep axis ended on "308.57142857142856". The "Today" label was clipped. | Schematic padding, whole-number ticks, label inside the plot. |

## Tests

- `e2e/production-network-t1.spec.js` checks the field rate, the
  bottleneck basis, and the sweep: 80 to 400 listed, 400 solved, exactly
  one failed row that names P-2.
- Network jest: 51 pass.
