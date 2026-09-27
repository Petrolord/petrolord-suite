# Technical Report Autopilot: senior test T1

- App: Technical Report Autopilot (`/dashboard/apps/economics/technical-report-autopilot`)
- Wave / position: Wave 6, #76 (Senior Testing Programme; economics and downstream)
- Build tested: main 3280cf406 plus #700 to #704
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: a drafting tool that must write only from the facts supplied (edge function `report-autopilot`; the system prompt forbids invented figures)
- Coverage before T1: the report autopilot page and DOCX tests (80 with the economics smoke and help guides); no human walk

## How it was tested

I used `/dev/studio/report-autopilot` at 1366 x 768. The model call cannot
be graded by hand, so the harness stands in `report-autopilot` with a
fixed sentence per section, built only from the section brief and the
inputs. I checked:

- the brief;
- a KPI;
- the default seven drilling sections;
- the preview;
- the DOCX download;
- a saved project.

## Verdict

**Demo-ready after T1, at S3. The flow is sound: the EC6 rebuild moved
templates and the DOCX into the browser and bound the writer to the given
facts.**

- Seven sections go out, and seven come back in template order. The DOCX
  is built from exactly what is on screen.
- The word budget in the function is min(per-section, pages x 450 /
  sections). At standard detail that is min(320, 450 x pages / 7) words,
  as the Advanced Options note says.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RAP-T1-001 | S3 | The KPI placeholders were clipped at 1366 ("Measured quantity, fo" and "The value you measu"). | Short placeholders ("Quantity, e.g. ROP" and "Value"). The full hint moves to the tooltip, and each field is labelled for screen readers. |
| RAP-T1-002 | S3 | The dropzone read "Drag 'n' drop files here" and did not say that only text files are read. A PDF was refused only after it was dropped. | The dropzone names the readable types (TXT, CSV, TSV, MD, JSON, LOG) and says to paste PDF and spreadsheet figures into the notes. |
| RAP-T1-003 | S3 | The empty state promised "a comprehensive technical draft". That is a marketing claim at odds with a writer bound to the given facts. | The empty state now says the draft is written only from what the user gives it, and that a section with no facts behind it will say so. |
| RAP-T1-004 | S1, platform | Save confirmations and errors never appeared. Traced: since the Horizons re-import (2026-04-21) the Suite mounts only sonner's Toaster, and all 215 files that toast use the shadcn `useToast`. Every toast in the Suite has rendered nowhere since April. | Fixed in its own PR (the Suite Toaster mount), because it changes behaviour in every app. |

## Tests

- `e2e/report-autopilot-t1.spec.js` checks:
  - the new empty-state copy;
  - that the KPI placeholder fits its field (measured with canvas text
    metrics);
  - brief to preview (the Executive Summary on HD-1) with all seven
    sections;
  - a `.docx` download;
  - a save without page errors.
- Report autopilot, DOCX, economics smoke and help-guide jest: 80 pass.
