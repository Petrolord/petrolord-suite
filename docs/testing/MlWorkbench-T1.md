# ML Workbench: senior test T1

- App: ML Workbench (Data & AI)
- Wave / position: Wave 7, #90 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #725
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: a table with an exact known relation, PHI = (2.65 - RHOB) / 1.65, validated by group k-fold over whole wells; a perfectly separable class to probe the logistic path
- Coverage before T1: ML jobs, workflows, report and smoke tests (48); no human walk

## How it was tested

I used `/dev/studio/ml-workbench` at 1366 x 768 and uploaded
`e2e/fixtures/ml-density-porosity.csv`. It holds 4 wells x 30 samples,
with RHOB uniform on 2.2 to 2.6, GR uniform on 20 to 120, PHI exact, and
SAND = 1 where GR < 60. I ran:

- OLS of PHI on RHOB;
- logistic SAND on GR;
- the diagnostics tab.

## Verdict

**Demo-ready after T1, at S3. The engine recovers the exact relation and
refuses what it should.**

- OLS: held-out R² = **1** on every fold. The pooled RMSE is 2.9e-7, which
  is the six-decimal rounding in the file. The standardised intercept is
  mean PHI (0.1606).
- Logistic on a completely separated class: every fold is refused, with
  the right remedy ("add an L2 penalty or remove the separating feature").
  It does not return infinite coefficients.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| ML-T1-001 | S3 | Folds defaulted to 5. On a 4-well table the run was refused ("k must be a whole number from 2 to 4"), although the field's own hint says "2 to the number of wells". | Folds are capped at the number of wells when a table loads; a smaller k the user chose is kept. |
| ML-T1-002 | S3 | A refused run showed only on the Validation results tab, so "Fit and validate" looked dead from the Model tab. | The refusal is repeated under the button. |
| ML-T1-003 | S3 | The depth track's axis ended on the data (1015, 1030, 1058). | Round ticks through niceTicks. |

## Tests

- `e2e/ml-workbench-t1.spec.js` checks:
  - the fixture is uploaded and k defaults to 4;
  - no refusal;
  - "k = 4 ... 120 held-out rows ... R² 1";
  - depth ticks on multiples of 5.
- ML jest: 48 pass.
