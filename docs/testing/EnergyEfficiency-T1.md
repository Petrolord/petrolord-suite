# Energy & Utilities Efficiency Studio: senior test T1

- App: Energy & Utilities Efficiency Studio (Midstream & Downstream)
- Wave / position: Wave 6, #78 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #708
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - combustion atom balance;
  - flue gas loss efficiency (LHV);
  - choked trap flow;
  - condensate return;
  - energy intensity;
  - problem-table pinch analysis.
- Coverage before T1: DS8 engine goldens and the page tests; no human walk

## How it was tested

I used `/dev/studio/energy-efficiency` at 1366 x 768 on the defaults. I
then supplied the inputs the studio deliberately does not default:

- radiation loss 2%;
- minimum safe O2 1.5%;
- trap discharge coefficient 0.7;
- treatment cost 1.5/t;
- emission factor 56.1 kgCO2e/GJ.

## Verdict

**Demo-ready after T1, at S3. Every figure hand-checks.** The first tab
opens on missing-input messages by design: the radiation loss and the O2
floor come off plant charts and are never defaulted.

- Fuel 0.9 CH4 / 0.08 C2H6 / 0.02 N2:
  - O2 = 1.8 + 0.28 = 2.08 kmol;
  - air = 2.08 / 0.2095 = 9.93 kmol, or 287.5 kg over a 17.405 kg fuel
    mole, which is 16.53 kg/kg;
  - CO2 1.06 and H2O 2.04 kmol.
- The dry flue gas O2 balance gives 36% excess air at 6% O2 and 15% at 3%.
  Dry gas loss is 370 kg x 1.1 x 195 K over 836 MJ, or 9.5%. Moisture adds
  1.67% and radiation 2%, so efficiency is 86.8%, and 88.4% tuned. The
  saving is 1.76% of 500,000 GJ, which is 8,793 GJ/yr.
- Choked trap: Cd A sqrt(k rho P (2/(k+1))^((k+1)/(k-1))) = 28.1 kg/h. That
  is 246 t per trap and 9,846 t for 40, costing 246,155 at 25/t. Carbon is
  9,846 x 2.7 / 0.85 x 56.1 = 1,755 t.
- Condensate:
  - extra water 20 x 0.3 x 8,760 = 52,560 t/yr;
  - water 31,536;
  - treatment 78,840;
  - fuel 16,841 GJ x 8 = 134,727.
- Intensity is 1.08 PJ over 1.5 Mt, or 720 MJ/t.
- Pinch (dTmin 20): the cascade gives 10, -12.5, -105, +135, -82.5 and
  -12.5 kW. Qh,min is 107.5 kW and Qc,min 40 kW, the pinch is at 80 C
  shifted (90/70 C), and 380 kW is recovered.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| EE-T1-001 | S3 | The composite curves and the grand composite were drawn smoothed (monotone). Composites are straight segments between kink temperatures, and smoothing bent them and moved where the closest approach appeared to be. | Straight segments. The legend uses the Suite standard, the axis titles have their own band, and the grand composite ticks are round (0 to 140 kW, 25 to 150 C). |
| EE-T1-002 | S3 | The same trap repair read 246,155 on the trap card and 250,209 on the savings register, with nothing saying why. The card prices the steam at the steam cost; the register values it as boiler fuel (31,276 GJ x 8). | The card says "at your steam cost per tonne", and the register says every row is valued as fuel at the ledger price, which is why a trap row can differ from the card. |

## Tests

- `e2e/energy-efficiency-t1.spec.js` checks:
  - 2.080 kmol O2;
  - 36% and 15% excess air;
  - 28.1 kg/h per trap;
  - both basis notes;
  - 107.5 kW and a 90/70 C pinch;
  - composite paths with no Bezier segments;
  - round grand composite ticks.
- Energy efficiency page jest passes.
