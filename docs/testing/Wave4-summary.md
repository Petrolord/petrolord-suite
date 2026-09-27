# Wave 4 summary (Senior Testing Programme, production, 2026-09-26)

Eleven Production apps (#44 to #54; Nodal was tested in Wave 2), each
tested at 1366 x 768 with the figures checked by hand. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- the full jest suite green before merge. The only failure was
  `assuranceHubRender`, which already fails on main.

## One harness for the whole module

`/dev/production/:app` (`src/dev/ProductionHarness.jsx`) runs any
Production studio on the in-memory Supabase double. It sits over a seeded
po_* spine (`src/dev/productionSpineSeed.js`) with closed-form histories,
so every figure has a hand answer:

- HP-1 oil;
- HP-2G gas;
- HP-3I injector;
- 180 days of history;
- monthly tests sitting exactly on Gilbert;
- a deferment;
- allocation factors;
- field totals at 95/100/98%;
- saved well models.

The double gained `!inner` embeds, dotted filters and `range()` offsets.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 44 | Artificial Lift Advisor | #672 | S1 | Rod ladder read pump liquid against the oil rate, so "Works" at 43% of target (engines #269) |
| 45 | Choke & Wellhead | #673 | S2 | One rate used as liquid (Gilbert) and oil (tubing, IPR); an impossible below-line point |
| 46 | ESP Design | #674 | S2 | Electrical hints printed "--"; float-noise rate axis |
| 47 | Flow Assurance | #675 | S3 | Presentation (ticks, U unit, no-touch hint) |
| 48 | Gas Lift Design | #677 | S2 | Default design multipointed; summary counted warnings it never showed |
| 49 | Gas Well Performance | #678 | S3 | Presentation (ticks, clipped labels) |
| 50 | Production Allocation | #679 | S2 | Period factor mixed all-date metered with carried-date theoretical (1.027 against 0.925) |
| 51 | Production Network | #680 | S2 | Separator sweep silently dropped failed pressures; cold starts |
| 52 | Production Surveillance | #681 | S2 | Forecast volume re-counted the history (engines #271) |
| 53 | Rod Pump Design | #682 | S1 | Default design lifted a quarter of its liquid duty with every indicator green |
| 54 | Well Intervention Planner | #683 | S1 | Chan diagnosis never read the spine ledger's columns, so it always refused |

Every app is Demo-ready after T1.

The recurring theme was the seam between oil and liquid rates (owner
item 19): AL, Choke and Rod Pump all had it in a different place.

## Suite-wide pieces

- Two engine fixes, both through the engines repo, with a negative control
  and vendoring:
  - #269, the rod ladder judged liquid against liquid (a37d31d);
  - #271, the surveillance forecast starts at the last fitted date
    (a844abe).
- The Data & AI engine pin moved with each vendoring.
- The shared SelectTrigger clamps its label to one line (suite-wide).
- The shared StudioHeader gives the title a floor, truncates it, and lets
  the tab row scroll.
- Chart legend band and axis-title height swept across 23 production chart
  files.

## Held for the owner

- One production zip after the Wave 4 merges. Cut it with
  `cut_suite_zip.sh`, purge the CDN, and check `/version.json`. It
  supersedes the Wave 3 zip if that has not been uploaded yet.
- Engine follow-ups for `petrolord-engines`, after NAPE:
  - `networkSolve`: a robust solve across a well's shut-in switch (217
    psia on the default network);
  - gas lift interference message grammar ("valve(s) 1 are");
  - gas lift `limitedBy` text uses the "X, not Y" form.
