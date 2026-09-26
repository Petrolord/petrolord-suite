# Well Intervention Planner: senior test T1

- App: Well Intervention Planner (`/dashboard/apps/production/well-intervention-planner`)
- Wave / position: Wave 4, #54, the last app in the wave (Senior Testing Programme; production)
- Build tested: main 2cc369f76 plus #681 and #682
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Chan (SPE 30775) water-control diagnostics, skin-removal nodal uplift, screening economics
- Coverage before T1: Suite intervention gates (synthetic rate-named histories); engine interventionDiagnostics; no human walk

## How it was tested

I used `/dev/production/intervention` on the seeded spine at 1366 x 768
with HP-1 linked (180 days, watercut 20% rising 0.1% a day, three shut-in
days). I walked diagnosis, screening and value (the plan run).

## Verdict

**Demo-ready after T1. It was S1 before, because the diagnosis could
never run on real spine data.**

- The skin floor: ln(1,800 / 0.354) - 0.75 = 7.78, so -7.8 is right.
- Chan reading on HP-1: normal displacement, derivative slope 1.17, low
  confidence. The screen says why: within 0.25 of the channelling
  boundary, where the reading is soft by construction. Three shut-in days
  were dropped.
- Value:
  - flow efficiency 7.78 / (7.78 + 7) = 53%, so the PI rises x 1.90 at
    zero skin;
  - the nodal uplift is 200 stb/d, against a naive 372 x 0.90 = 334 stb/d,
    and the gap is shown and explained;
  - NPV is $11.35MM on 250 Mbbl.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| WIP-T1-001 | S1 | The Chan history read only `oil_rate_stbd` / `water_rate_stbd` / `gas_rate_mscfd`, which are the well-test column names. The daily ledger (`po_daily_production`) carries `oil_stb` / `water_stb` / `gas_mscf` with `hours_on`, so every ledger row read as NaN. A 180-day history was refused as "not enough ... a handful of days", which ruled out every water treatment on every real well. The gates passed because their fixtures used rate names. | The ledger shape is read as volume x 24 / hours on (no hours, no rate). A gate feeds ledger-shaped rows (including a 12-hour day) and checks they match the rate-named series. Negative control: disabling the ledger read turns it red. |
| WIP-T1-002 | S3 | "No production history on the spine for this well" showed before any well was picked. "180 producing days" counted the shut-in days. | "Pick a well to read its production history.", then "180 days of production history on the spine". |
| WIP-T1-003 | S3 | Chart y-axis titles were clipped ("Ratio and its deriv...", "emental rate (stb/d)"). The diagnostic controls were misaligned. | Wider left margin; controls top-aligned. |

## Wave 4 copy sweep

Prose "--" dashes were removed from the Production help guides (flow
assurance, network, intervention): paired dashes became parentheses and
the rest commas or semicolons, each read through.

## Tests

- `e2e/well-intervention-t1.spec.js` checks:
  - the pick-a-well prompt;
  - the 180-day history, diagnosed with no refusal;
  - PI x 1.90 and the 334 stb/d spreadsheet contrast.
- Intervention and context jest: 47 pass (with the new ledger gate).
  Production components and utils: 433 pass.
