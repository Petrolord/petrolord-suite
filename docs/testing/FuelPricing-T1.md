# Fuel Pricing & Supply Chain Studio: senior test T1

- App: Fuel Pricing & Supply Chain Studio (Midstream & Downstream)
- Wave / position: Wave 6, #79 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #709
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - cargo-to-nozzle landed cost and pump build-up;
  - an FX re-pricing sweep;
  - truck lane costing and fleet sizing;
  - forecourt queueing.
- Coverage before T1: fuel pricing engine goldens and the page tests; no human walk

## How it was tested

I used `/dev/studio/fuel-pricing` at 1366 x 768 on the defaults: 37,000 t
of PMS at $700/t FOB, density 745, 0.5% ocean loss and 1,550 local per
dollar. Every regulated rate was left blank, as the studio ships. I walked
both tabs and edited the lane.

## Verdict

**Demo-ready after T1. It was S2 before: the lane costs were driven by
inputs nobody could see.**

- 37e6 kg / 0.745 x 0.995 = **49,416,107 L**. $25.9M / that = **$0.52412/L**,
  or **812.39** at 1,550.
- Lane:
  - the cycle is 800 km / 40 + 2 + 1.5 + 1 = **24.5 h**, so 12 / 24.5 =
    0.49 trips per truck per day;
  - diesel is 800 x 0.38 x 1,150 = 349,600;
  - maintenance and tyres are 800 x 70 = 56,000;
  - depreciation is 11.25M / (0.49 x 300) = 76,563;
  - a trip costs **607,163**, which over 44,910 L is **13.520/L**.
- Fleet: 180,000 / 45,000 = 4 trips a day, over 0.49 = 8.17 trucks. That
  rounds up to **9** at **90.7%**, with 18,367 L/day spare.
- Station:
  - 60,000 x 0.12 / 30 = 240 sales/h;
  - service is 30/40 + 1.5 = 2.25 min, so 6 nozzles serve 160/h, which
    is **150%** and an unbounded queue (flagged);
  - usable stock is 42,000 L, or 0.70 days;
  - reorder ullage is 31,500 L, too small for a 45,000 L load (flagged).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FP-T1-001 | S2 | Ten inputs had no box but drove the results: loading and discharge hours, driver, overhead, tolls, maintenance and tyres, working hours and days, and handling time per sale. The FX sweep range was hidden too. The trip cost and nozzle utilisation were built on values nobody could see or change. | Every one is now an input in the lane, station and cap sections. |
| FP-T1-002 | S2 | The headline read "Pump price 812.39 per litre" with 16 rates missing. That figure is only the landed floor, as the line beneath it said. | The headline reads "Pump price at least ..." until the build-up is complete. |
| FP-T1-003 | S3 | The FX chart used a category axis, so its ticks printed raw sweep values (1266.6666666667). Its Y steps were 350, and the legend sat on top. | A number axis with 200-step ticks from 1,000 to 2,600, a round Y axis and the Suite legend. |

## Tests

- `e2e/fuel-pricing-t1.spec.js` checks:
  - the floor headline;
  - FX ticks from 1000 to 2600 with no decimals;
  - a 24.50 h cycle and a 607,163 trip;
  - loading 3 h moves the cycle to 25.50 h;
  - every newly exposed input is present.
- Fuel pricing jest passes.
