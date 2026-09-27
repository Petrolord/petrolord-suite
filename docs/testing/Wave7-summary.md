# Wave 7 summary (Senior Testing Programme, reservoir, ML and assurance, 2026-09-27)

Seventeen apps (#84 to #100), the last wave of the plan:

- six Reservoir studios;
- two Data & AI workbenches;
- nine Assurance apps. The Risk Heatmap is a tab of the Risk Register.

Each was tested at 1366 x 768 with its figures checked by hand, or, for the
workflow apps, its rules exercised end to end. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- full jest green before merge. The only failure was `assuranceHubRender`,
  which already fails on main.

## Harnesses

- `/dev/studio/:app` gained the reservoir and ML slugs.
- `/dev/assurance/:app` (`src/dev/AssuranceHarness.jsx`) is new. It runs
  the Assurance apps in a nested MemoryRouter at their real paths, so their
  absolute links work, with:
  - an organization and members;
  - every Assurance table;
  - all twelve code-number RPCs;
  - the migrations' column DEFAULTs;
  - the generated risk scores.

  The in-memory double gained column defaults, generated columns, `.or()`
  and `.not()`.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 84 | EOR Screening | #718 | S3 | Sample button label overflow (all Taber 1997 counts correct) |
| 85 | Recovery Factor Estimator | #719 | S3 | Em dashes; 9-step reserves ticks |
| 86 | SCAL Studio | #720 | S3 | Height at Sw 0.5 read a grid row (32.5 for 31.8 ft); 0.25 labelled 0.3 |
| 87 | VRR Monitor | #721 | S2 | "Balanced" status at VRR 0.95 against the user's 1.00 to 1.20 band |
| 88 | Waterflood Design Studio | #723 | S3 | Breakthrough on the monthly step (1.3 for 1.17 yr); clipped axis titles |
| 89 | Well Spacing Optimizer | #725 | S2 | No Bo: every volume and dollar in reservoir barrels (28% high) |
| 90 | ML Workbench | #726 | S3 | Default 5 folds refused on a 4-well table |
| 91 | Forecasting ML Workbench | #727 | S2 | Forecast charts drew no axes (recharts dropped a wrapper) |
| 92 | Risk Register | #728 | S3 | Dashboard heatmap overflowed; unnamed dropdowns |
| 93 | Document Control | #729 | S3 | Reviewer picker crushed to "Choo" |
| 94 | Peer Review Manager | #730 | S3 | Out-of-view validation made submit look dead (fixed in five forms) |
| 95 | Management of Change | #731 | S2, platform | The shared Textarea was white with light text: typed text invisible |
| 96 | QA Plan | #732 | S1, platform | The second toast store (50 files) had no Toaster |
| 97 | Regulatory Compliance | #733 | S3 | Single-status donuts drawn with a gap (four dashboards) |
| 98 | ISO Compliance | #734 | S3 | 17 empty states recounted the app's history ("used to show thirty invented clauses") |
| 99 | Lessons Learned | #735 | S3 | Empty search blamed the words, not the published-only filter |
| 100 | Audit & Findings Manager | #736 | S3 | Answer buttons past the card at 1366 (six detail pages) |

Every app is Demo-ready after T1. The reservoir engines matched their
literature exactly:

- Taber, Martin and Seright (1997);
- Arps (API 1967);
- Buckley-Leverett with Welge;
- Dykstra-Parsons (probability-plot V);
- Craig's areal sweep;
- Leverett J;
- Standing's Bo.

The ML engines recovered exact relations: held-out R² of 1, and Arps and
damped trend returning the true decline. They also refused the separable
logistic case with the right remedy. The Assurance rules held throughout:
residual per axis, appetite, the AS15 current-period rule, critical
nonconformances needing findings, evidence for nonconformities, and author
independence.

## Suite-wide fixes this wave

- **Toasts (#732):** `src/hooks/use-toast`, a second copy of the shadcn
  store, now reaches the sonner Toaster, as #707 did for the first copy. A
  jest gate covers both, and there is no third.
- **Textarea (#731):** readable everywhere, matching Input.
- **Recharts wrapper:** axes inside a custom component are dropped. I
  scanned the Suite and the forecasting charts were the only case.
- `niceTicks` (chartTheme) applied across reservoir, ML and Assurance
  charts.

## Held for the owner

- One production zip after the Wave 7 merges. It carries the two toast
  fixes and the Textarea fix, which every app benefits from.
- Engine follow-ups for `petrolord-engines`, after NAPE:
  - `waterflood/vrr.js` classifyVRR could take the operator's band (its
    labels carry em dashes);
  - `scal.js` `pcFromJ` with `n: 0` divides by zero (callers use `n: 1`).
- Feature follow-up: ISO clause templates per standard.
