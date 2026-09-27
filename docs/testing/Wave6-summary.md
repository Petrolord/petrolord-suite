# Wave 6 summary (Senior Testing Programme, economics and downstream, 2026-09-27)

Thirteen apps (#71 to #83): six Economics & Project Management studios and
seven Midstream & Downstream studios. Each was tested at 1366 x 768 with
its figures checked by hand. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- the full jest suite green before merge. The only failure was
  `assuranceHubRender`, which already fails on main.

## One harness

`/dev/studio/:app` (`src/dev/StudiosHarness.jsx`) runs all 13 studios on
the in-memory Supabase double. It has two additions:

- worked seeds, with closed-form answers, for the AFE and Project
  Management cases;
- a per-app map of edge-function stand-ins. The Report Autopilot model
  call is answered by a fixed writer, so the flow around it can be tested.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 71 | AFE & Cost Control | #700 | S2 | The customer's operator share was labelled "Petrolord (Operator)"; partner type blank |
| 72 | Decision Tree Builder | #701 | S3 | Branches ran through the EMV labels |
| 73 | NPV Scenario Builder | #702 | S2 | Every chart read $0.0MM (the MM was divided twice); inputs clipped; exposure contradicted the cash flow |
| 74 | Probabilistic Breakeven | #703 | S2 | CAPEX 1000 displayed as "100" |
| 75 | Project Management Pro | #704 | S1 | Portfolio SPI and CPI of 1.00, trend chips and "92% schedule health" were invented; the stage tracker was stuck on Concept for every project type |
| 76 | Technical Report Autopilot | #706 | S3 | Clipped KPI fields; dropzone copy; led to #707 |
| 77 | Crude Assay & Blending | #708 | S3 | Distillation ticks at the data ends; placeholder crude unlabelled |
| 78 | Energy & Utilities Efficiency | #709 | S3 | Composite curves smoothed; the trap cost basis was unstated |
| 79 | Fuel Pricing & Supply Chain | #711 | S2 | Ten hidden inputs drove the lane costs; the landed floor was headlined as the pump price |
| 80 | LPG & CNG Rollout | #713 | S3 | Raw-million cost axis |
| 81 | Product Blending Optimizer | #714 | S3 | Ungrouped money, -0.00, stray legend |
| 82 | Refinery Planning & Scheduling | #715 | S3 | -$18.36M variance before any actual; internal ids on screen |
| 83 | Terminal & Depot | #716 | S2 | Every stock came through a hidden, unreplaceable strapping table |

Every app is Demo-ready after T1. The downstream engines were right
everywhere:

- API and SG blending, Refutas, Watson K and CII;
- combustion stoichiometry, choked trap flow and the pinch cascade;
- LP recipes and shadow prices;
- Erlang C queues.

The defects were in what the screens did with the answers.

## Suite-wide: #707, toasts had been invisible since April

The Horizons re-import (f6ec2b9db, 2026-04-21) swapped the shadcn Toaster
for sonner's. Nothing calls sonner, and 215 files call `useToast`, so
every save confirmation, error and validation toast rendered nowhere for
five months. `toast()` now forwards to the sonner Toaster that App.jsx
mounts. This is the largest user-facing fix in the wave: errors that were
silent now show.

## Shared pieces

- `niceTicks` in `src/utils/chartTheme.js` gives round axis ticks at a 1,
  2, 2.5 or 5 step, with a jest gate. It is used across the crude assay,
  energy, fuel, LPG and pinch charts.
- Project Management: `StageTracker` takes each template's stages, and
  `stageProgress` reads percent complete, across all eleven project types.

## Held for the owner

- One production zip after the Wave 6 merges, cut with
  `cut_suite_zip.sh`. The toaster fix alone justifies it.
- Environment: the wt-w2 dev server shares `node_modules/.vite` with the
  staging container through the node_modules symlink. A new dependency
  optimised by one server can break the other. Staging was probed healthy
  after the only incident. Consider a separate `cacheDir` for secondary
  dev servers.
- Engine follow-up (after NAPE): `screening.js` `maxExposure` semantics
  (from #702).
