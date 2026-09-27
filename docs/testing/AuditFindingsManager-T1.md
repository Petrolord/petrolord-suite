# Audit & Findings Manager: senior test T1

- App: Audit & Findings Manager (Assurance)
- Wave / position: Wave 7, #100 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #735
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: an audit programme, checklists of numbered questions with criticality, audits run against them, and findings that follow from nonconformant answers (a critical one must raise a finding)
- Coverage before T1: Assurance jest; no human walk

## How it was tested

I used `/dev/assurance/audit` on the Assurance harness. I built checklist
CHK-01 "Pressure vessel inspection" with one Critical question (1.1),
activated it, planned audit "HP separator inspection" against it, and
answered 1.1 Nonconformant.

## Verdict

**Demo-ready after T1, at S3. The protocol rules are right.**

- A question needs a number ("Number the item, such as 1.1"). A checklist
  with no questions says an audit cannot be run against an empty protocol.
- The audit plans as **AUD-2026-001** and needs a lead auditor.
- A Nonconformant answer needs evidence ("a nonconformity is an assertion,
  and this is the evidence for it"). A Critical nonconformance then shows
  **Needs one** in the Finding column, and the audit lists "1 critical
  nonconformance with no finding: 1.1" before it can report.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| AU-T1-001 | S3 | On the audit page the checklist table sat beside the audit card from lg up, so at 1366 its Answer buttons were past the card edge and needed a sideways scroll to find. The Findings, ISO audit and finding, NCR and lesson detail pages have the same split. | The columns stack until 2xl on all six detail pages, so the Answer and Raise a finding buttons are on screen. |
| AU-T1-002 | S3 | The dashboard's "Start a programme" and "Build a checklist" opened lists with their forms closed and a second button to press. | They open the forms directly. |

## Tests

- `e2e/audit-manager-t1.spec.js` checks:
  - the checklist form opens from the dashboard;
  - one critical question, then AUD-2026-001;
  - the Answer button inside 1366 px;
  - Nonconformant needs evidence, then "Needs one" and the reporting
    blocker.
- Assurance jest: 464 pass.
