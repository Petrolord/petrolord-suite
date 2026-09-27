# NPV Scenario Builder: senior test T1

- App: NPV Scenario Builder (`/dashboard/apps/economics/npv-scenario-builder`)
- Wave / position: Wave 6, #73 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700 and #701
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: screening DCF (revenue, royalty, tax, capex, opex), tornado and spider sensitivity, Monte Carlo P90/P50/P10
- Coverage before T1: NPV gates (28) including the EC3 percentile fix; no human walk

## How it was tested

I used `/dev/studio/npv` at 1366 x 768 with the quick-mode defaults:

- 5,000 bopd at a 15%/yr decline, $75/bbl, 10% discount;
- CAPEX $150MM over two years, $2MM/yr fixed OPEX, per-barrel OPEX;
- 10% royalty and 30% tax.

I ran the calculation and walked the dashboard, cash flow, sensitivity
and risk.

## Verdict

**Demo-ready after T1. It was S2 before: inputs were unreadable, the
exposure figure contradicted the cash flow, and every chart read $0.0MM.**

- Year 1 revenue: 5,000 x 365 x 75 = $137MM. Year 1 NCF is +$17MM after
  $75MM capex, so the cumulative is never negative. There is no exposure,
  no IRR and no payback, as the IRR and payback cards say.
- Lifetime revenue is about 137 / (1 - 0.85) = $880MM, matching the
  waterfall's gross revenue. NPV is $188MM. The Monte Carlo EMV is
  $187MM, with P90 113, P50 185 and P10 268 ($MM).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| NPV-T1-001 | S2 | "Max Exposure $17" sat beside "the cumulative cash flow is never negative". The engine's `maxExposure` is the lowest cumulative cash flow (+$17MM in year 1), and the screen printed its absolute value as exposure. The Excel summary and the scenario comparison did the same. | Exposure is max(0, -lowest cumulative): $0MM here, and the true dip when the cumulative goes negative. This applies on the card, in Excel and in the comparison. |
| NPV-T1-002 | S2 | Every chart axis and tooltip read "$0.0MM" (waterfall, cash flow, tornado and spider; the risk histogram showed $0MM). The engine works in $MM, and the charts divided by 1e6 again. | The charts treat values as $MM: waterfall to $1,000MM, tornado ±$120MM, histogram $43MM to $320MM. |
| NPV-T1-003 | S2 | Quick-mode inputs were clipped at 1366: CAPEX 150 read "15", royalty 10 read "1(" and tax 30 read "3(". The user could not see their own inputs. | Input cards stack below 2xl, so each field is full width. |
| NPV-T1-004 | S3 | NPV, exposure and the P90/P50/P10 cards showed no unit ("$188") except in full-precision mode. A controlled-input warning fired on load. | "$MM" always shown, as a separate element so full-precision values stay pasteable. Inputs start controlled. "Best case P50" is kept, because it is the owner's Suite percentile convention. |

## Tests

- `e2e/npv-scenario-t1.spec.js` checks:
  - that CAPEX 150 is visible and wide;
  - NPV $188 $MM and exposure $0 $MM;
  - a $750.0MM tick and at most the one zero tick;
  - $MM on the risk cards, with no console warning.
- NPV, lib and percentile jest: 775 pass, with the unit expectation
  updated.
- Engine follow-up (after NAPE): rename or redefine `maxExposure` in
  `screening.js` as a non-negative exposure.
