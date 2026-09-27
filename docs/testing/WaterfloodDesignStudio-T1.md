# Waterflood Design Studio: senior test T1

- App: Waterflood Design Studio (Reservoir Management)
- Wave / position: Wave 7, #88 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #721
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - Buckley-Leverett with Welge's tangent;
  - Dykstra-Parsons (probability-plot V) and Stiles;
  - five-spot forecast (Craig EAbt, Dyes-Caudle-Erickson growth);
  - Monte Carlo on the canonical module.
- Coverage before T1: waterflood engine and page tests (28 in the filtered run); no human walk

## How it was tested

I used `/dev/studio/waterflood` at 1366 x 768 on the defaults:

- Corey 0.2 / 0.2, krw 0.4, kro 1.0, exponents 2 / 2;
- viscosities 0.5 / 5 cp;
- five layers;
- a 40-acre, 25 ft five-spot at 800 rb/d.

I also ran the Monte Carlo with oil viscosity triangular 4 / 5 / 6.

## Verdict

**Demo-ready after T1, at S3. Every engine figure hand-checks.**

- Displacement:
  - M = (0.4/0.5)/(1/5) = **4.00**;
  - the tangent touches at Swf **0.468** (S = 0.4467), where fw =
    1/(1 + 0.3836) = **0.723** and fw' = 0.723 / 0.268 = **2.70**;
  - 1/2.70 = **0.37 PV** at breakthrough, average Sw 0.571 and recovery
    **46.4%**;
  - ED (1 - 0.2 - 0.2)/0.8 = **75%**.
- Layers: ln k regressed on the normal quantiles of plotting positions
  gives a slope of 4.354 / 3.835 = sigma **1.135**. V = 1 - e^-1.135 =
  **0.679**, and the median k is e^4.804 = **122 md**.
- Pattern:
  - OOIP 7758 x 40 x 25 x 0.22 x 0.8 / 1.25 = **1,092.3 Mstb**;
  - Craig EAbt at M = 4 is **53.9%**;
  - WiBT = 0.3708 x 1.7068 MMrb x 0.539 = **341.2 Mbbl**, so breakthrough
    is at 341,200 / 800 = 426.5 d = **1.17 yr**.
- Monte Carlo: Np P50 662.0 Mstb around the 661.5 base, with P90 as the
  low case per the convention.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WF-T1-001 | S3 | Breakthrough read 1.3 yr on the forecast and on the Monte Carlo P50. The monthly-stepped forecast flags the first step past WiBT (456.6 d); the true time is 426.5 d. | A shared `exactBreakthroughDays` gives (WiBT + fill-up) / rate for both: 1.17 yr. |
| WF-T1-002 | S3 | Axis titles were clipped on every chart (a negative left margin, and titles pushed with dy offsets): "WOR (rb/rb)" was cut off and the coverage title was a sliver. Axes ended on the data (95.02, 8.58, 650.2 to 675.4). The "Swf" marker label was clipped at the top. | Positive margins, a label band on X titles and centred Y titles across five result files. Round ticks through niceTicks on WOR, years and Np. |
| WF-T1-003 | S3 | The six-card KPI rows clipped their units at 1366 ("Mstl"). | Three per row below 2xl. |
| WF-T1-004 | S3 | Em dashes in every parameter label and in the empty-value mark. | "Swc, connate water"; "-" for empty values. |

## Tests

- `e2e/waterflood-t1.spec.js` checks:
  - Swf 0.468 and 46.4%;
  - V 0.679 with round WOR ticks;
  - breakthrough 1.17 yr and 1092.3 Mstb, with round year ticks;
  - a Monte Carlo run whose P50 breakthrough is about 1.1x;
  - no em dash on the page.
- Waterflood jest passes (28 in the filtered run).
