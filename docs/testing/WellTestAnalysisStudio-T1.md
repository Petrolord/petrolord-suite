# Well Test Analysis Studio: senior test T1

- App: Well Test Analysis Studio (`/dashboard/apps/reservoir/well-test-analysis-studio`)
- Wave / position: Wave 2, #22 (Senior Testing Programme)
- Build tested: main plus DCA T1 (#648) and Forecast Scenario Hub T1 (#649)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: KAPPA Saphir, IHS WellTest, PanSystem
- Coverage before T1: WT1 to WT10 (validation harness 115/115, Lee and Earlougher literature gates)

## How it was tested

The existing `/dev/well-test-analysis-studio` route now wraps the app in
the in-memory Supabase double. Two data sets were used:

- The built-in sample buildup (homogeneous, truth k 85 md, skin 6.5, C
  0.015 bbl/psi, tp 36 hr).
- Lee (1982) Example 2.1, imported as CSV through the UI, with the book's
  reservoir inputs.

All six tabs were walked at 1366 x 768.

## Verdict

**Not Demo-ready before T1: one S1; now Demo-ready.**

The engines are right:

- Auto-fit recovers k 84.5, skin 6.42 and C 0.0150 on the sample.
- Diagnostics shows a plateau k of 83.0.
- Lee Example 2.1 through the UI gives k 48.0 md, skin 1.43 and p* 1950.3
  psi (book: 48, 1.43, 1950).

The Specialized tab was not. With the Horner window left on "auto", the
line was fitted through every point, storage hump included. On the sample
that gave k 23.1 md, skin -2.68 and r² 0.90, reported as the headline
answer. The rail next to it named the detected radial window but did not
use it. Separately, the right rail and the Report showed the untouched
starting match (k 50, skin 0) as derived results before any match was
made.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WTA-T1-001 | S1 | "Auto" Horner/MDH window fitted all points: k 23 md against 85 on the sample | Empty bounds use the detected radial-flow regime, mapped from equivalent time back to shut-in time (sample: 83.0 md, skin 6.15, r² 1.000); the panel states the hours used; a warning banner if no radial flow is found and the full range is used |
| WTA-T1-002 | S2 | Derived kh, Δp skin and flow efficiency (rail, Report, PDF) came from the default match (k 50, skin 0) before any match | Derived values use the match only once it has been adjusted or fitted, otherwise the semilog line; source stated in the rail and the Report; Report and PDF omit an untouched match ("Not matched yet") |
| WTA-T1-003 | S3 | kh and CD printed as "2.25e+3", "3.80e+3", "1.10e+3" | Three significant figures written out: 3,800 md·ft, CD 1,100 |
| WTA-T1-004 | S3 | Report quoted a sqrt(t) slope fitted through a test with no linear flow | Quoted only when linear flow is detected or the window is set |
| WTA-T1-005 | S3 | Match tab kh and CD read the derived values, not the working match | Match tab KPIs come from the working match |
| WTA-T1-006 | S3 | Help said storage data "biases k high" (it steepens the line and pulls k low); sqrt panel said fracture models "arrive with WT3" | Help and panel copy corrected |
| WTA-T1-E1 | Enhancement | Harness saved to the live table | Harness on the in-memory double |

## Observations (not changed)

- The header title wraps to two lines at 1366 (shared StudioHeader, all studio apps).
- RTA has no sample data set; its acceptance stays on the WT9 fixture spec.

## Tests

`e2e/well-test-analysis-t1.spec.js`: the sample's auto window within 5
percent of truth, the report without a match, and fit then report; Lee
Example 2.1 through the UI. The existing `well-test-analysis-studio.spec.js`
still passes. The welltest jest suites also pass.
