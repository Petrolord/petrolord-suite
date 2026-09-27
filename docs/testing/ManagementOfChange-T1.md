# Management of Change: senior test T1

- App: Management of Change (Assurance)
- Wave / position: Wave 7, #95 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #730
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: an MOC with a database-issued code, screening, then review and approval stages, impacts, actions and an audit trail
- Coverage before T1: Assurance jest; no human walk

## How it was tested

I used `/dev/assurance/moc` on the Assurance harness. I raised "Replace HP
separator relief valve" (Permanent, Facility or hardware, Harness CPF,
Medium risk, target 15 Nov 2026) and submitted it for screening.

## Verdict

**Demo-ready after T1. It was S2 platform-wide before: text typed into
most textareas in the Suite was all but invisible.**

- The change submits as **MOC-2026-001, Screening, Permanent, Medium**,
  offering Move to Review, Reject, Cancel and Move to Draft, with one audit
  entry.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| MOC-T1-001 | S2, platform | Typed text in the Proposed change and Justification boxes was light grey on white. The shared `Textarea` was the stock light component (bg-white, with dark: variants the Suite never switches on). Any textarea without its own background override (Report Autopilot, Peer Review, Document Control, MOC and more of the 75 files that use it) was white with the page's light text inherited. | `Textarea` matches `Input` (slate-800 background, slate-50 text). No caller overrides it with a light background, so no page loses contrast. |
| MOC-T1-002 | S3 | The header search placeholder was truncated ("Search changes, press Ente"). | "Search changes". |

## Tests

- `e2e/moc-t1.spec.js` checks:
  - the search placeholder fits;
  - the Justification textarea is not white and its text differs from its
    background (negative control: the old component fails);
  - the change submits as MOC-2026-001, Screening;
  - no page errors.
- Assurance and ui jest: 467 pass.
