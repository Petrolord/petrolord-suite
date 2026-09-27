# Lessons Learned: senior test T1

- App: Lessons Learned (Assurance)
- Wave / position: Wave 7, #99 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #734
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: a lessons register with capture, validation by someone other than the author, applicability scope, application tracking and search
- Coverage before T1: lessons jest; no human walk

## How it was tested

I used `/dev/assurance/lessons` on the Assurance harness. I captured
"Export pump failed during the startup sequence" with only what happened,
then walked the Register, Search, Reports and Dashboard.

## Verdict

**Demo-ready after T1, at S3.**

- It captures as **LL-2026-001, Draft, This asset**. The page says it
  cannot be validated until it has what happened, why and what to do, and
  the toast says it is a draft until somebody other than the author
  validates it.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| LL-T1-001 | S3 | Search with no words typed, and only a draft in the register, said "Nothing matches. Every word has to appear somewhere in the lesson. Try fewer words". The cause was the default "Published lessons only" filter. | The empty result names its cause: the published-only filter hiding unpublished lessons (with how to include them), the words, or the other filters. |
| LL-T1-002 | S3 | The author picker's first option ("Yourself, or type the name of somebody without a Suite account") was cut off in its column. | "Yourself (or type a name)". |

The developer-history empty states this app shared with the other
Assurance apps were removed in #734.

## Tests

- `e2e/lessons-learned-t1.spec.js` checks:
  - the lesson captures as LL-2026-001 with the validation note;
  - Search explains the published-only filter, with no "Try fewer words";
  - unticking the filter shows 1 of 1 lesson.
- Lessons jest passes.
