# Peer Review Manager: senior test T1

- App: Peer Review Manager (Assurance)
- Wave / position: Wave 7, #94 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 and #729
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: a technical review with a database-issued code, an author who cannot review their own work, a lead reviewer, stages, comments and an audit trail
- Coverage before T1: Assurance jest (464 across the nine apps); no human walk

## How it was tested

I used `/dev/assurance/peer-review` on the Assurance harness. I raised
"FDP review, Harness Field phase 2" (Field Development Plan, due 30 Nov
2026), with an author without a Suite account and myself as lead reviewer.
I first left the project blank.

## Verdict

**Demo-ready after T1, at S3.**

- It raises as **PR-2026-001, In Review, Medium**, with author and lead
  reviewer on the team (Team 2) and one audit entry.
- Validation is right: starting needs a target date ("or nothing can ever
  be reported as overdue") and a project. The author's independence from
  the reviewers is enforced.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| PR-T1-001 | S3 | A validation message sat beside its field, scrolled out of view above the submit buttons, so "Raise and start the review" looked dead. Document Control, MOC, the review detail and the regulatory directory had the same pattern. | A shared `focusFirstError` scrolls the first invalid field into view and focuses it, in all five forms. |
| PR-T1-002 | S3 | In the team row, Role and Discipline sat lower than Name (items-end against a stacked picker and name box), and the picker read "Somebody without a Suite account (ty...". | The row aligns from the top, with matching label boxes (all three controls within a pixel). The shared option reads "Not a Suite user (type the name)". |

## Tests

- `e2e/peer-review-t1.spec.js` checks:
  - the team controls are aligned;
  - a missing project shows its message and takes focus;
  - the review raises as PR-2026-001, In Review, Team (2);
  - no page errors.
- Assurance jest: 464 pass.
