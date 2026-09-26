# Fiscal Regime Designer: senior test T1

- App: Fiscal Regime Designer (`/dashboard/apps/economics/fiscal-regime-designer`)
- Wave / position: Wave 1, #9 (Senior Testing Programme)
- Build tested: main after Basin T1 (#637), EC7 PIA compliance (#632) live
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Palantir FISCAL, Wood Mackenzie GEM fiscal models, PIA 2021
- Coverage before T1: EC2 / EC3 engine repairs, fiscal truth and naming waves, EC7 PIA 2021 templates

## Verdict

**Demo-ready after T1.** The engine, the PIA 2021 templates and the metric
naming were settled in the EC waves; this test found the problems a visitor
meets in the first minute. The default regime was named "Nigerian PIA
(PSC)" but carried invented terms (a 20 percent RRT and an R-factor split
that the PIA does not have), on a stand at NAPE in Lagos. The production
and price inputs had no headers or units once filled, and the gas rate,
which the engine reads as Mcf/d, defaulted to 50: no gas at all beside
10,000 bopd, where a reader would assume 50 MMscf/d. The results column ran
off the right of a laptop screen.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FIS-T1-001 | S2 | Default regime labelled as the PIA with non-PIA terms (open owner item) | Renamed "Sample PSC (R-factor split)"; the PIA 2021 terms stay under Load Template |
| FIS-T1-002 | S2 | Production and price inputs unlabelled once typed; units absent; gas 50 Mcf/d default | Headers and units (bopd, Mcf/d, bbl/d, decline %/yr; from year, $/bbl, $/Mcf); default gas 50,000 Mcf/d |
| FIS-T1-003 | S3 | Results column overflowed at 1366 px (2/5 + 3/5 + gap) | Right column `flex-1 min-w-0`; table scrolls inside its card |
| FIS-T1-004 | S3 | No dev harness | `/dev/fiscal-regime-designer` |
| FIS-T1-E1 | Enhancement | Multi-year price deck editor with add and remove rows; gas at MMscf/d | After NAPE |

## Tests

`e2e/fiscal-regime-t1.spec.js`; fiscal and economics jest suites green.
