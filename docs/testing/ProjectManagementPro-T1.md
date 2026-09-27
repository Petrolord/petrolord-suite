# Project Management Pro: senior test T1

- App: Project Management Pro (`/dashboard/apps/economics/project-management-pro`)
- Wave / position: Wave 6, #75 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700 to #703
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: earned value management (PV time-phased to an as-of date, EV, AC, SPI, CPI) and stage-gate tracking
- Coverage before T1: EVM engine goldens (projectControls) and the EC6 page tests; no human walk

## How it was tested

I used `/dev/studio/project-management` at 1366 x 768. The harness project
is a Field Development project with $10MM BAC and three costed, dated tasks:

- FEED: $1MM, done, $1.1MM actual.
- Procurement: $4MM from Mar to Dec 2026, 50% complete, $2.2MM actual.
- Construction: $5MM from Jul 2026 to Jun 2027, 10% complete, $0.4MM actual.

It also carries two risks (scores 16 and 6), one issue and one resource. I
walked the portfolio, all four analytics tabs, every project tab, Add
Task, Update and Report.

## Verdict

**Demo-ready after T1. It was S1 before: the portfolio page showed
invented performance figures.**

- EV = 1.0 + 4.0 x 0.5 + 5.0 x 0.1 = $3.5MM. AC = $3.7MM, so CPI = 0.946.
- On 2026-09-27, PV = 1.0 + 4.0 x 210/305 + 5.0 x 88/364 = $4.963MM, so
  SPI = 0.71. The progress form shows PV $4,962,890 and SPI 0.71, and the
  portfolio now agrees. On 2026-09-01 the same case gives SPI 0.821 (the
  jest gate).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| PM-T1-001 | S1 | The portfolio showed SPI 1.00 and CPI 1.00 for every portfolio (projects carry no index, so the fallback of 1 won). It showed 0 critical risks (the risk list was never passed in) and 0/0/0 health (Green/Amber/Red counted in a status field that holds "Active"). Four trend chips (5.2%, -2.1%, 0.8%, -10%) were constants. | The summary fetches the portfolio's tasks and risks and runs the earned value engine per project. SPI is 0.71 and CPI 0.95, with one open risk scoring 15 or more. Health uses the usual bands (both indexes at 0.95 or better is on track, either below 0.90 is critical), and projects without data are counted as not measured. The chips are gone. |
| PM-T1-002 | S1 | The Analytics overview had "Schedule Health 92%" as a literal and three more constant chips. It called a simple mean "weighted by budget", and its status pie drew nothing. | Schedule health is the on-track share of measured projects (0% here) and progress is budget-weighted. The pie shows CPI/SPI health. The charts use the white standard with integer count ticks. |
| PM-T1-003 | S2 | The stage tracker drew Concept to Close-out for every project type and never found the template stage it was given (Prospecting, Appraisal Planning, Planning). Every project sat on "Concept" for ever, and nothing in the studio advances `projects.stage`. | Each dashboard passes its template. The current stage is the first stage with unfinished work, so the harness sits on Detailed Design with Concept and FEED passed. |
| PM-T1-004 | S2 | Stage progress counted only tasks marked Done, so a stage with its task 50% complete read 0% and "Pending". | Progress is the mean percent complete (Done counts as 100). This applies to all six stage managers. |
| PM-T1-005 | S2 | On the Gantt, every second task was white text on a light grey row. The dark theme set CSS variables the library never reads. | The Gantt sits on the white chart standard with dark text and the logo. |
| PM-T1-006 | S3 | The Report button on the field development, brownfield and decommissioning dashboards had no handler. | It is now an Export menu (PDF or CSV of the task register). |
| PM-T1-007 | S3 | "Open high risks" counted scores over 10, including closed risks, while the donut's High band is 15 or more. The top-risk list painted a score of 6 red. The progress form opened on Green beside an SPI of 0.71. The resource card said "Assigned" instead of the person's name. | One band everywhere: open risks scoring 15 or more. Scores are coloured by band. The RAG default follows the measured health and can be overridden. The resource card shows the name. |
| PM-T1-008 | S3 | The risk heatmap axes ran 0 to 6 on a 1 to 5 scale, and the budget and type charts were dark. | The heatmap runs 1 to 5 with the scale named, on the white standard. |

## Tests

- `src/components/projectmanagement/__tests__/pmT1.test.jsx` calls the
  real helpers:
  - `summarisePortfolio` against the hand SPI and CPI, and not 1;
  - the closed and low risks excluded;
  - the health bands;
  - `currentStageOf`, `stageProgress` (50, not 0) and the task report
    rows.
- `e2e/project-management-t1.spec.js` checks:
  - CPI 0.95, SPI below 0.9, one critical risk and no trend chips;
  - schedule health 0%;
  - the tracker on Detailed Design and the stage row Active;
  - Procurement readable on the Gantt.
- Project management and economics page jest: 55 pass.
