# LPG & CNG Rollout Studio: senior test T1

- App: LPG & CNG Rollout Studio (Midstream & Downstream)
- Wave / position: Wave 6, #80 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #711
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - LPG blend properties on their proper bases;
  - vaporizer duty;
  - bottling queue;
  - Little's Law cylinder float;
  - CNG real-gas bank inventory;
  - a per-km conversion case.
- Coverage before T1: LPG/CNG engine goldens and the page tests (83 in the filtered run); no human walk

## How it was tested

I used `/dev/studio/lpg-cng` at 1366 x 768 on the defaults, across the LPG,
CNG and conversion tabs.

## Verdict

**Demo-ready after T1, at S3. Every figure hand-checks.** The maximum fill
ratio is required and is not defaulted, by design (it is a code limit).

- Blend: 0.4 / 0.6 by liquid volume.
  - At about 507 and 584 kg/m3 that is 202.8 + 350.4 kg, which gives a
    density of **553.6** and 0.433 propane by mole.
  - M is **52.05** and latent heat **399.7 kJ/kg** on mass.
- Vaporizer: 500 x 399.7 / 3600 = **55.5 kW**, and 66.6 kW with 20% margin.
  It is a floor with two terms missing, as it says.
- Bottling:
  - 2,400 x 2.5 min / 480 min is 12.5 Erlangs, and 12.5 / 0.9 = 13.9, so
    **14** positions;
  - 16 x 0.9 = 14.4 working, 12.5 / 14 = **89.3%**;
  - capacity is 14.4 x 480 / 2.5 = **2,765** a day.
- Float: 21 + 1 + 2 + 1 = **25 days**. 25 x 2,400 = **60,000** in
  circulation, plus 10% is **66,000**.
- CNG: rho = PM / RT = 250e5 x 17.38 / (8314 x 288.15) = 181.4 kg/m3, so
  **272.0 kg** per 1.5 m3 ideal and **333.6 kg** at Z 0.8154.
- Conversion:
  - 12 / 100 km x 40,000 km = 4,800 units at 950, which is **114/km**;
  - by energy equivalence 4,800 x 32 / 48 = 3,200 units at 500, which is
    **40/km**;
  - the saving is 2.96M - 40k maintenance = **2,920,000** a year.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| LPG-T1-001 | S3 | The conversion cost chart's axis printed 6000000, 4500000 and so on, with no axis title, and its legend was on top. | Compact 1.5M-step labels, a "cost a year" title and the Suite legend. |
| LPG-T1-002 | S3 | The cylinder cycle chart ticked at 0, 6, 12, 18 and 24 days. | Ticks at 0, 5, 10, 15, 20 and 25 through the shared niceTicks. |

## Tests

- `e2e/lpg-cng-t1.spec.js` checks:
  - M 52.05, 55.5 kW, 89.3% and 66,000;
  - day ticks 0 to 25;
  - banks of 333.6 and 272.0 kg;
  - a 2,920,000 saving with 4.5M labels and no raw millions.
- LPG/CNG jest passes.
