# Flare Gas to Value Studio: senior test T1

- App: Flare Gas to Value Studio (`/dashboard/apps/midstream-downstream/flare-gas-to-value`)
- Wave / position: Wave 2, #29 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #653 to #656
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: World Bank GFMR screening tools, vendor flare-to-value screens, 40 CFR 98.233(n)
- Coverage before T1: DS10 build (engine gated), existing jest

## How it was tested

New harness `/dev/flare-gas-to-value` on the in-memory Supabase double.
The default gas and four routes were walked at 1366 x 768, then the flare
footprint and abatement were completed. Inputs: destruction efficiency
0.98, methane GWP 28, and "Diesel" as the counterfactual (150,000 tCO2e
burned, 160,000 displaced).

## Verdict

**Demo-ready (no S1 or S2).** Every figure agrees with a hand calculation:

| Quantity | Hand calculation | App |
| --- | --- | --- |
| Heating value | 0.78 x 1010 + 0.09 x 1770 + 0.05 x 2516 + ... | 1,211 Btu/scf |
| Inerts | N2 0.02 + CO2 0.02 | 4.0% |
| Carbon number | | 1.30 per mol |
| CNG margin | 3.5e6 Mscf x 20 x 0.9 x 0.6 - 1.4M - 2.5M | 33.9M/yr |
| CNG value | 33.9M / 3.5e6 Mscf | 9.686 per Mscf |
| CNG capital | 30M x (10/8)^0.9 (modular exponent) | 36.67M |
| Flare CO2 | 4.19e6 kmol x (0.02 + 0.98 x 1.28) x 44 | about 234,700 t (app 234,628) |
| Methane slip | 4.19e6 x 0.78 x 0.02 x 16 | 1,047 t |
| Total | 234,628 + 28 x 1,047 | 263,944 tCO2e |
| Abatement | 0.9 x 263,944 - 150,000 + 160,000 | 247,550 t |
| Credit revenue at $5 | 247,550 x 5 | 1,237,750 |

The findings are in presentation.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FLARE-T1-001 | S3 | Credit chart on a category axis: $5, 15, 30 and 60 spaced evenly. Raw "45000000" ticks, no y title, and the tooltip style spread as props | Numeric price axis, $M ticks, axis titles, proper tooltip style |
| FLARE-T1-002 | S3 | Route inputs repeated the route name inside its own card ("Compressed natural gas Minimum volume", three lines each) | Short visible labels; the full name kept as the accessible label |
| FLARE-T1-003 | S3 | The capital column never said it scales at the 0.9 modular exponent (36.67M looked like a six-tenths error) | A basis note under the bid table |
| FLARE-T1-004 | S3 | "not stated" abatement shown in success green | Muted grey |
| FLARE-T1-E1 | Enhancement | No harness | `/dev/flare-gas-to-value` |

## Tests

- `e2e/flare-gas-to-value-t1.spec.js`: footprint, abatement, capital
  basis note, accessible route label.
- Flare jest: 18/18 pass.
