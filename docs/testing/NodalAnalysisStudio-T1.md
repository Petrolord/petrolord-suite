# Nodal Analysis Studio: senior test T1

- App: Nodal Analysis Studio (`/dashboard/apps/production/nodal-analysis-studio`)
- Wave / position: Wave 2, #25 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #651 and #652
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PROSPER, PIPESIM, WellFlo
- Coverage before T1: NA1 to NA5+ (validation harness over 1,000 gates, armed literature anchors)

## How it was tested

The existing `/dev/nodal-analysis-studio` route now wraps the app in the
in-memory Supabase double. The default oil well was walked across all six
tabs at 1366 x 768, and the sensitivity and gas-lift sweeps were run. Key
numbers were then checked by hand.

## Verdict

**Demo-ready after T1 (no S1).** The engine answers are right:

- **Composite IPR:** qb = 1.2 x 800 = 960 and qmax = 960 + 1.2 x 2400 / 1.8
  = 2,560 STB/D, as shown.
- **Operating point:** the IPR at 2,205 psia gives 1,185.6 STB/D (app 1,186).
- **Gilbert choke:** 435 x 0.8^0.546 x 400 / 12^1.89 = 1,406 psia (app
  1,404).
- **Gas lift:** the economic point at 1,000 Mscf/d is where the marginal
  gain drops below 0.05 STB/d per Mscf/d.

The main deliverable, the nodal system plot, was drawn wrong. Its axes were
sized to the operating point alone, so it stopped at 1,200 STB/D and 2,400
psia. That cut the IPR off above its operating pwf and hid everything past
the crossing.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| NODAL-T1-001 | S2 | System plot axes sized to the operating-point Scatter: IPR cut at 2,400 psia, plot ending at the operating rate | Explicit domains: x to the end of the curve (AOF), y just above the reservoir pressure; a VLP rising past it at low rates is clipped |
| NODAL-T1-002 | S3 | Legends overlapped the x-axis titles on the System, Inflow, Outflow and sweep charts | Shared legend band and axis-label height on all six charts |
| NODAL-T1-003 | S3 | Economic point KPI ran value and rate together ("1,000 Mscf/d 1,471 STB/D") | Value with unit, the rate as a sub-line |
| NODAL-T1-E1 | Enhancement | Harness saved to the live table | Harness on the in-memory double |

## Observations (not changed)

- The Chokes tab uses its own rate (400 STB/D) rather than the system
  operating rate; a "use operating point" link would help.
- Sweep axes use Recharts' auto ticks (140, 210, 280 psia).
- The low-rate end of the VLP is coarse (few points below 300 STB/D).

## Tests

`e2e/nodal-analysis-t1.spec.js` (operating rate 1,186; system axes past
the AOF and Pr; economic point sub-line). The existing
`nodal-analysis-studio.spec.js` still passes.
