# Consequence Modelling Studio: senior test T1

- App: Consequence Modelling Studio (`/dashboard/apps/process-safety/consequence-studio`)
- Wave / position: Wave 5, #68 (Senior Testing Programme; process safety)
- Build tested: main 3ad8894b4 plus #690 to #696
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: TNO Yellow Book (CPR 14E) source terms, Gaussian dispersion and solid-flame pool fire; Purple Book probits; Kinney-Graham TNT blast
- Coverage before T1: 244 consequence tests including the Yellow Book worked examples; no human walk

## How it was tested

I used `/dev/facilities/consequence` at 1366 x 768 with the opening
study: a benzene release into a bund, with the Yellow Book 6.6.3 fire
and the hydrogen gas case. I walked source term, dispersion, fire,
explosion and harm.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- Liquid release: 0.62 x 1.96e-3 m2 x sqrt(2 x 879 x 43,100 Pa) =
  10.6 kg/s.
- Plume (Briggs rural, class D) at 500 m:
  - sigma_y = 40 / sqrt(1.05) = 39.0 and sigma_z = 30 / sqrt(1.75) =
    22.7;
  - C = 5.86 / (pi x 5 x 39 x 22.7) = 421 mg/m3;
  - x 24.465 / 78.11 = 132 ppm.
- Pool fire: 4.58 kW/m2 at 100 m, against the Yellow Book example's
  printed 4,581 W/m2.
- Blast: 1,000 x 46 x 0.03 / 4.68 = 294.9 kg TNT, so Z = 100 / 6.657 =
  15.02.
- Harm:
  - Eisenberg: -14.9 + 2.56 ln(60 x 4.58^(4/3)) = 0.7775, so P = 1.2e-5;
  - HSC overpressure: 1.47 + 1.37 ln(0.878 psig) = 1.292.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CQ-T1-001 | S3 | Log axes mixed "1.0e6" with "10000" and carried a tick every few percent (11, 14, 17, 22 ...). Y-axis titles were clipped ("Concentration (mg/", "Peak side-on overpr"). The linear distance axis ended on 58 and 460. | One tick per decade, written 10, 100, 1k, 10k, 1M. Y titles fit and are centred. Linear distance rounded to 50 m. This is the shared studio chart, so all four charts benefit. |

## Tests

- `e2e/consequence-t1.spec.js` checks the release rate, the plume
  concentration with decade labels (no exponent form), TNT mass and the
  Eisenberg probit.
- Consequence jest: 244 pass.
