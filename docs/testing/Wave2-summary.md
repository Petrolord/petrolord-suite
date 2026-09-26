# Wave 2 summary (Senior Testing Programme, 2026-09-26)

Sixteen apps (#18 to #33), each tested on a dev harness at 1366 x 768,
with figures checked by hand or against a known source. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- the full jest suite green before merge. The only failure was
  `assuranceHubRender`, which already fails on main.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 18 | Fluid Systems Studio | #646 | S1 | Glaso Rs about 100x low |
| 19 | Material Balance Studio | #647 | S2 | No way to edit a case; picker wording |
| 20 | Decline Curve Analysis | #648 | S1 | "Remaining reserves" included the oil already produced (about 3x high) |
| 21 | Forecast Scenario Hub | #649 | S1 | "EUR" was the horizon cumulative; time to limit repeated the horizon |
| 22 | Well Test Analysis Studio | #650 | S1 | Auto Horner window fitted the storage hump (k 23 md against 85) |
| 23 | Reservoir Simulation Studio | #651 | S2 | Results opened empty; noise plotted as trends |
| 24 | FDP Accelerator | #652 | S1 | Rail printed an NPV of $1,421MM as "$1K" |
| 25 | Nodal Analysis Studio | #653 | S2 | System plot axes sized to the operating point, IPR cut off |
| 26 | Well Cost & Time Estimator | #654 | S2 | Lump AFE item names unreadable |
| 27 | VOI Analyzer | #655 | S2 | Tree labels printed over node EMVs |
| 28 | Capital Portfolio Studio | #656 | S2 | Frontier clipped its own optimum |
| 29 | Flare Gas to Value | #657 | S3 | Presentation only (credit axis, labels) |
| 30 | Modular Refinery Feasibility | #658 | S3 | Engine keys shown, sign after the $ |
| 31 | Carbon Footprint & Abatement | #659 | S2 | Emissions chart drew nothing; equal-width MAC curve |
| 32 | Electrofacies Studio | #660 | S2 | Uploaded logs not proposed; clusters in unrelated colours |
| 33 | Data Quality Studio | #661 | S2 | Clean 24-hour column called frozen; charts had no axes |

Every app is Demo-ready after T1.

## Suite-wide pieces added

- `src/dev/InMemorySupabase.jsx` is a Supabase double used by every Wave 2
  harness. It covers tables, auth, edge functions, RPC and storage. The
  restore is deferred a tick so the StrictMode re-run stays in memory.
- `src/dev/DevAuth.jsx` provides a stand-in signed-in user. `AuthContext`
  is now exported, for dev harnesses only.
- The Reservoir Simulation harness uses a worker stand-in fed by OPM Flow
  2026.04 output that was really produced offline (SPE1, and the Builder's
  default deck).
- Two guard tests:
  - `tooltipStyleProp.test.js`: 48 tooltips in 35 files spread
    `TOOLTIP_STYLE` as props, and all were fixed.
  - `wrappedAxes.test.js`: an axis wrapped in a component is never drawn.

## Held for the owner

- One production zip after the merges. It supersedes nothing still pending
  (Wave 1 is live at a01f01cd6). Cut with `cut_suite_zip.sh`, purge, and
  check `/version.json`.
- Platform note, carried over from Wave 1: about 40 app routes lack
  `ProtectedAppRoute`.
- Engine observations, after NAPE:
  - FSH: modified hyperbolic (terminal decline).
  - MBAL: the free-intercept regression.
