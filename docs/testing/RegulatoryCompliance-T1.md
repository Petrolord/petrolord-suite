# Regulatory Compliance: senior test T1

- App: Regulatory Compliance (Assurance)
- Wave / position: Wave 7, #97 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main plus #728 to #732
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: obligations whose status is derived from dates, lead time, lifecycle and evidence (Expired, Overdue, Due soon, On track, Compliant), with filings rolling the due date by frequency
- Coverage before T1: Assurance jest (compliance status engine included); no human walk

## How it was tested

I used `/dev/assurance/regulatory` on the Assurance harness. I added an
annual permit obligation and moved its due date through +10, -5 and +90
days, watching the live status preview. I created it at +10 days,
recorded a filing, and walked the Register, Directory, Reports and
Dashboard.

## Verdict

**Demo-ready after T1, at S3. The status logic is right and explains
itself.**

- With a 30-day lead time the preview reads **Due soon** at +10 days,
  **Overdue** at -5 and **On track** at +90.
- It creates as **OBL-2026-001**, due 7 Oct 2026. A filing on 27 Sep
  rolls the Annual due date to **7 Oct 2027**, and the toast says so.
- After filing it reads On track rather than Compliant. That is the owner's
  AS15 rule: evidence counts only in the current period, and the filing
  belongs to the period the roll-forward just closed.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RC-T1-001 | S3 | With one status present, the "Where the register stands" donut was drawn with its 2-degree padding gap, so a register 100% On track read as a ring with a slice missing. Document Control, Peer Review and MOC had the same donut. | Padding only between two or more slices, in all four dashboards. |

## Tests

- `e2e/regulatory-t1.spec.js` checks:
  - the preview reads Due soon, Overdue, On track and Due soon;
  - it creates OBL-2026-001;
  - the filing rolls Next due forward exactly one year;
  - the dashboard donut is a single sector.
- Assurance jest passes.
