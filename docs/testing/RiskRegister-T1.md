# Risk Register: senior test T1

- App: Risk Register (Assurance; the Risk Heatmap tile opens its heatmap tab)
- Wave / position: Wave 7, #92 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #727
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: 5 x 5 likelihood-impact scoring with bands (Low 1-4, Medium 5-9, High 10-14, Critical 15-25), a residual carried per axis at inherent until assessed, and appetite against a target
- Coverage before T1: risk register and scoring tests (86); no human walk

## A harness for the Assurance apps

`/dev/assurance/:app` (`src/dev/AssuranceHarness.jsx`) runs the nine
Assurance apps on the in-memory Supabase double:

- a nested MemoryRouter that starts at the real
  `/dashboard/apps/assurance/...` paths, so the pages' absolute links work;
- one organization (DevAuth now takes one) and two members;
- every Assurance table, starting empty;
- the code-number RPCs stood in;
- the create-table DEFAULTs mirrored.

The double gained column defaults, generated columns (recomputed on insert
and update) and `.or()`, so what the pages read back matches Postgres.

## How it was tested

I recorded one risk: likelihood 4, impact 4, residual 2 x 3, target 6. I
walked the dashboard, the register, the heatmap, the reports, the builder
and the detail page.

## Verdict

**Demo-ready after T1, at S3. The scoring and appetite logic is right.**

- Inherent 4 x 4 = **16, Critical**. It counts as live and critical, sits
  at (4, 4) on both heatmaps and heads the "highest scoring" list.
- Residual 2 x 3 = **6, Medium**: **within appetite** (target 6), and
  "controls account for 10 of the 16 points".
- A new risk takes the table's DEFAULT status Open, which is live.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RR-T1-001 | S3 | The dashboard's Inherent Risk Profile heatmap ran past its card at 1366; the fifth likelihood column was cut. | A compact cell size for the one-third dashboard card. The full heatmap tab keeps the large cells. |
| RR-T1-002 | S3 | The form's five dropdowns (category, likelihood, impact and both residual axes) had no accessible names; screen readers read five unnamed comboboxes. | Each trigger carries its label. |

## Tests

- `e2e/risk-register-t1.spec.js` checks:
  - it records the risk through the named dropdowns;
  - 16 - Critical;
  - the heatmap card does not overflow (negative control: without the
    compact size it fails);
  - on the detail page, 6 - Medium, within appetite and 10 of 16 points;
  - no page errors.
- Risk register jest: 86 pass.
