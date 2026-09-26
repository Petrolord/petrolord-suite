# Risked Reserves Valuation: senior test T1

- App: Risked Reserves Valuation (`/dashboard/apps/reservoir/risked-reserves-valuation`)
- Wave / position: Wave 1, #4 (Senior Testing Programme)
- Build tested: main after Earth Modeling T1 (#633)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: exploration portfolio practice (Rose & Associates risk and value, GeoX, REP); SPE PRMS on risked volumes
- Coverage before T1: R3 wiring, help guide; no human walk

## Verdict

**Not Demo-ready; rebuilt.** The app did not value risked reserves. It ran
its own NPV Monte Carlo over five variables with no geological chance of
success anywhere, then called P(NPV > 0) the "chance of success". An
exploration committee reading it would take a price-and-cost spread for a
risk figure. It also duplicated the canonical NPV and Monte Carlo modules,
which the Suite conventions forbid. The rebuild makes it the valuation layer
over the ReservoirCalc Pro prospect inventory: commercial chance against the
MEFS, EMV after the exploration well, break-even Pg, the risked expectation
curve and a portfolio, closed form and oracle-validated.

## Scorecard (before, after)

| Dimension | Before | After | Why |
| --- | --- | --- | --- |
| Technical correctness | 1 | 5 | No Pg; mislabelled chance; now engine + Python oracle + negative control |
| Industry parity | 1 | 4 | Pc, MEFS, EMV, break-even Pg, expectation curve, portfolio; dependence between prospects is after NAPE |
| Workflow and UX | 2 | 4 | One table, one chart, one readout; bad inputs named per row |
| Data interoperability | 0 | 4 | Imports the RCP risked inventory; value per barrel from EPE |
| Outputs and reporting | 1 | 4 | CSV of every input and output |
| Robustness | 2 | 4 | Reversed P90/P10 refused with the rule; old sampler split into two lobes silently |
| Performance | 4 | 5 | Closed form, instant |
| Learnability | 3 | 4 | Guide rewritten around the committee questions |

## Findings

### S1 blockers

**RRV-T1-001 No geological risk.** Pg was not an input; every iteration
assumed a discovery. The output is an unrisked development NPV spread.

**RRV-T1-002 "Chance of success" was P(NPV > 0).** A price and cost spread
presented as the prospect's chance of success.

### S2 majors

**RRV-T1-003 Input convention reversed.** Boxes labelled P10/P50/P90 were
read as low/mode/high of a triangle; petroleum-convention entry (P10 high)
fed the inverse a negative width and sampled two disjoint lobes, never the
mode.

**RRV-T1-004 Duplicate NPV and Monte Carlo.** Its own cash flow and sampler
beside the canonical modules (Reservoir Engineering module section 5).

**RRV-T1-005 Disconnected from the risking.** ReservoirCalc Pro holds the
prospect inventory with Pg and success-case volumes; nothing flowed across.

**RRV-T1-006 No MEFS, no EMV, no break-even.** The committee's three numbers
were absent.

### S3 minors

**RRV-T1-007 Nothing saved and no export.**

**RRV-T1-008 Tornado swung P10 to P90 of a triangle whose ends were the
bounds,** overstating the swing against the true 10th and 90th percentiles.

## Built (all batches)

| Finding | Outcome |
| --- | --- |
| 001, 002, 006 | Engines #265 `engines/prospect/valuation.js`: lognormal success case, Pc = Pg x P(V >= MEFS), EMV after the well, break-even Pg, expectation curve, portfolio; oracle `tools/validation/prospect/oracle_valuation.py`, negcontrol 9/9 red |
| 003 | Petroleum convention throughout; P90 >= P10 refused with the rule |
| 004 | Old engine, test and components deleted; no NPV or MC implementation left |
| 005 | Import from ReservoirCalc Pro (Pg as risked, else the factor product) |
| 007 | Prospects and economics kept per browser; CSV export |
| 008 | Tornado retired with the old model |

After NAPE: dependent prospects (shared charge or seal risk) in the
portfolio; value per barrel as a function of field size from EPE runs.

## Tests

- Engines: `__tests__/prospect.valuation.test.js` (goldens from the oracle), negcontrol 9/9 red.
- Suite: `src/pages/apps/riskedreserves/__tests__/` (store, workstation against the engine), help guide pins, `e2e/risked-reserves.spec.js` on `/dev/risked-reserves`.
