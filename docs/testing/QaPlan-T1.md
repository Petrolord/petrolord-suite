# Quality Assurance Plan: senior test T1

- App: Quality Assurance Plan (Assurance)
- Wave / position: Wave 7, #96 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #731
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: a quality plan with an inspection and test plan (hold, witness and review points), non-conformances and corrective actions
- Coverage before T1: QA plan jest (62 with ui); no human walk

## How it was tested

I used `/dev/assurance/qa-plan` on the Assurance harness (now with every
numbering RPC the Assurance apps call). I submitted the new-plan form empty,
then created "Subsea tie-back quality plan" with a scope and one ITP item.

## Verdict

**Demo-ready after T1. It was S1 platform-wide before: this page's toasts,
and those of 49 other files, were invisible.**

- The plan creates as **QAP-2026-001 (Draft)** with 1 inspection point, 0%
  resolved and 0 hold points outstanding. Scope is required ("a plan with no
  scope cannot be audited against").

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| QA-T1-001 | S1, platform | "QAP-2026-001 created" never appeared. The page uses `@/hooks/use-toast`, a second copy of the shadcn toast store (50 files), with no Toaster to render it. It is the sibling of the #707 defect. | It forwards to the mounted sonner Toaster like the first copy. The jest gate covers both stores, and there is no third. |
| QA-T1-002 | S3 | On the plan page the ITP table sat beside the plan card from lg up, and at 1366 it scrolled its row-action column out of view. | The plan card stacks above the table until 2xl, so the whole table shows. |
| QA-T1-003 | S3 | An empty submit named the problem in a banner but left the user where they were. | The first invalid field (plan or ITP row) is scrolled to and focused. |

## Tests

- `e2e/qa-plan-t1.spec.js` checks:
  - an empty submit focuses the title;
  - the plan creates as QAP-2026-001, and the toast "QAP-2026-001 created"
    is visible;
  - the ITP table does not overflow.
- `src/components/ui/__tests__/toastBridge.test.js` covers the second
  store.
- QA plan and ui jest: 62 pass.
