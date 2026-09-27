# ISO Compliance: senior test T1

- App: ISO Compliance (Assurance)
- Wave / position: Wave 7, #98 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #733
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: management-system standards, a clause register whose conformity claims name their evidence, internal audits and findings to closure, and certification readiness as a list of blockers
- Coverage before T1: Assurance jest (including a no-invented-data gate); no human walk

## How it was tested

I used `/dev/assurance/iso` on the Assurance harness. From the dashboard I
added ISO 9001:2015, added clause 7.5 "Documented information", and walked
the Clauses, Internal audits, Findings and Reports pages.

## Verdict

**Demo-ready after T1, at S3.**

- A standard with no applicable clauses carries a blocker ("nothing to be
  ready with"), not a readiness percentage. Adding a clause counts it (1 of
  1 clause).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| ISO-T1-001 | S3 | Empty states and error panels in six Assurance apps told users the app's own history. Examples: "This app used to show thirty invented ones instead, titled 'Clause Title 1' to 'Clause Title 30'", "…five invented lessons and a total of 156 to every organization", and "This page used to show a different plan". That is developer notes in customer copy, 17 places in all. | Removed. Empty states say what to do; error panels say nothing is shown until the register loads and to try again. |
| ISO-T1-002 | S3 | The dashboard's "Add a standard" opened the Standards list with the form closed and a second "Add the first one" to press. | It opens the form directly. |

## Tests

- `e2e/iso-compliance-t1.spec.js` checks:
  - "Add a standard" opens the form;
  - a new standard shows 1 blocker;
  - the clause empty state has no history text;
  - a clause is added and counted.
- Assurance jest: 464 pass.
- Follow-up (feature, after NAPE): a clause template per standard (ISO
  9001 4.1 to 10.3 and so on) would save typing the register by hand.
