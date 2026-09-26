# Decision Studio: senior test T1

- App: Decision Studio (`/dashboard/apps/economics/decision-studio`)
- Wave / position: Wave 1, #11 (Senior Testing Programme), the last Wave 1 app
- Build tested: main after EPE T1
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: DecisionTools Suite / Palisade reports, board decision-brief practice
- Coverage before T1: D5 (brief model tests), EC4 repairs; no walk (needs saved runs and auth)

## How it was tested

A dev harness (`/dev/decision-studio`) with real evidence: two Monte Carlo
runs on the Ekene demo case computed by the engines `runEpeMonteCarlo`
(seed 42, 1000 iterations; oil price 65 to 85 and 50 to 100, capex and
production spreads), the hand-derived drill-or-farm-out tree (EMV 43) and
the four-project portfolio from the brief model tests, served through an
in-memory Supabase while mounted.

## Verdict

**Demo-ready after T1.** The chain works end to end (pick evidence, compare
cases, S-curves, one-page PDF). The defects were in how money read at the
scale of a real Nigerian marginal-field case: the two runs both showed
"P50 $1.4M" (they are 1.37 and 1.35), negatives read "$-0.4M", and the
S-curve's NPV = 0 line was unlabelled with ticks at -5.1M, -1.6M, 1.9M.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| DS-T1-001 | S2 | One decimal in $M: small cases indistinguishable | Two decimals under $10M (`fmtMMUsd`, `fmtMM`) |
| DS-T1-002 | S3 | Sign after the currency symbol ("$-0.4M") | "-$0.39M" |
| DS-T1-003 | S3 | S-curve NPV = 0 line unlabelled; odd ticks | Labelled; round ticks |
| DS-T1-004 | S3 | No harness | `/dev/decision-studio` (optional `userOverride` prop, harness only) |
| DS-T1-E1 | Enhancement | Note when P50 sits well below the deterministic base (skewed inputs) | After NAPE |

## Tests

`briefModel.test.js` (money format), decision jest 32, `e2e/decision-studio-t1.spec.js` (compare, S-curves, PDF export).
