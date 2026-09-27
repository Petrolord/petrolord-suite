# Recovery Factor Estimator: senior test T1

- App: Recovery Factor Estimator (Reservoir Management)
- Wave / position: Wave 7, #85 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus the Wave 6 stack and #718
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - volumetric OOIP;
  - drive-mechanism analog bands;
  - the API (Arps, 1967) solution-gas and water-drive correlations.
- Coverage before T1: recovery factor calculation tests (48 with the component suites); no human walk

## How it was tested

I used `/dev/studio/recovery-factor` at 1366 x 768 on the sample:

- 1,200 acres x 45 ft;
- 22% porosity, 28% Sw, NTG 0.85, Boi 1.30;
- water drive.

I checked the analog band and then the API water-drive correlation.

## Verdict

**Demo-ready after T1, at S3. Every figure hand-checks.**

- OOIP = 7758 x 1200 x 45 x 0.22 x 0.72 x 0.85 / 1.3 = **43.39 MMSTB**.
  The 35 / 50 / 75% water-drive band gives **15.19 / 21.69 / 32.54
  MMSTB**.
- Arps water drive at k 150 md, uw 0.5 cp, uo 0.9 cp, pi 4,200 psia and
  pa 1,500 psia:
  - (0.1218)^0.0422 = 0.9150;
  - (83.3)^0.0770 = 1.4057;
  - 0.28^-0.1903 = 1.2741;
  - 2.8^-0.2159 = 0.8007;
  - 0.54898 times these is **72.0%**, or 31.26 MMSTB. The wide-scatter
    warning is shown.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RF-T1-001 | S3 | Em dashes throughout the copy: the method buttons ("API — water drive"), the gas methods, the OOIP formula note, the drive table caveat and the correlation warnings. An em dash also served as the empty-value mark. | Reworded ("API (1967): water drive", "Gas: water drive", full stops). Empty values read "-". |
| RF-T1-002 | S3 | The reserves chart ticked at 0, 9, 17, 26 and 34 with no axis title. | Round ticks through niceTicks in MMSTB or Bscf, with the unit on the axis. |
| RF-T1-003 | S3 | The correlation input labels were not tied to their inputs. | Labels linked. Unitless fields (z factors) no longer print "()". |

## Tests

- `e2e/recovery-factor-t1.spec.js` checks:
  - 43.39 and 21.69 MMSTB;
  - ticks 0 to 40;
  - API water drive at 72.0%;
  - a labelled k field;
  - no em dash anywhere on the page.
- Recovery factor jest passes (48 in the filtered run).
