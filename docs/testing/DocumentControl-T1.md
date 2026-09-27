# Document Control: senior test T1

- App: Document Control (Assurance)
- Wave / position: Wave 7, #93 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Waves 6 and 7 part 1 merged) plus #728
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: controlled documents with database-issued numbers, revisions, reviewer tasks (any rejection rejects), review dates from the issue date and period, and a master register
- Coverage before T1: document control tests; no human walk

## How it was tested

I used `/dev/assurance/document-control` on the Assurance harness (see
RiskRegister-T1). I registered "Harness ERP" (HSE, Procedure, Internal,
24-month review) with a reviewer, saved it as a draft, opened the send
for review panel, and walked the Library, Approvals and Reports.

## Verdict

**Demo-ready after T1, at S3.**

- The draft registers as **DOC-2026-001, Rev 01, Draft, Internal**. Its
  next review is "Not set" until it is published, as the form explains (the
  review date comes from the issue date and the period).
- The reviewer picker offers the other member and not the author.
- Reports: "1 controlled document, 0 published, 0 overdue for review",
  with one Draft bar under HSE and one Procedure bar. (Full-page
  screenshots catch these bars mid-animation; on screen they draw.)

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| DC-T1-001 | S3 | In the narrow Review card on "Register a controlled document", the reviewer row was three columns (picker, role, remove), so the member picker was about 60 px wide and read "Choo". | The picker has its own full-width row; role and remove sit beneath it. The same component on the detail page reads well too. |

## Tests

- `e2e/document-control-t1.spec.js` checks:
  - the reviewer picker is wider than 150 px;
  - saving a draft gives DOC-2026-001 Rev 01;
  - the report counts one controlled document;
  - no page errors.
- Document control jest passes.
