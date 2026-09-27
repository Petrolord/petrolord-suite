# Wave 5 summary (Senior Testing Programme, facilities and process safety, 2026-09-27)

Sixteen apps (#55 to #70): thirteen Facilities studios and three Process
Safety studios. Each was tested at 1366 x 768 with its figures checked by
hand. For each app:

- a T1 report under `docs/testing/<App>-T1.md`;
- every finding fixed in the same PR;
- the full jest suite green before merge. The only failure was
  `assuranceHubRender`, which already fails on main.

## One harness

`/dev/facilities/:app` (`src/dev/FacilitiesHarness.jsx`) runs any of the
16 studios on the in-memory Supabase double. All 16 load with no console
errors.

## Verdicts

| # | App | PR | Before T1 | Headline defect |
| --- | --- | --- | --- | --- |
| 55 | Compressor Station Designer | #684 | S3 | Third tab hidden at 1366; sweep bars over the axis |
| 56 | Control Valve & Choke Sizing | #685 | S2 | Default valve could not pass its own duty (99% open, 138% of the velocity limit) |
| 57 | Corrosion & Integrity | #686 | S3 | Engine numbers in exponent form; summary overflow |
| 58 | Facility Layout Mapper | #687 | S1 | Unusable: dead CARTO tiles, no Leaflet CSS, react-leaflet 4 never drew placed equipment |
| 59 | Flow Metering Designer | #688 | S3 | Cd curve axes |
| 60 | Gas Processing Studio | #689 | none | Hand checks only |
| 61 | Heat Exchanger & Cooling | #690 | S3 | Engine keys and developer text on screen |
| 62 | Pipeline & Line Sizing | #691 | S2 | Liquid sweep recommended a line spending about 700 psi (no pressure budget) |
| 63 | Produced Water Treatment | #692 | S3 | Caveat named an engine argument; droplet chart labels |
| 64 | Pump Station Designer | #693 | S3 | Flow axis ticks |
| 65 | Relief & Flare Studio | #694 | S3 | Blowdown time axis |
| 66 | Separator & Slug Catcher | #695 | none | Hand checks only |
| 67 | Storage Tank & Venting | #696 | S2 | 3/16 in minimum plate on a 120 ft tank (API 650 requires 5/16 in) |
| 68 | Consequence Modelling | #697 | S3 | Log axes in mixed exponent form |
| 69 | LOPA & SIL | #698 | S3 | Proof-test axes; flag language in the credit reason |
| 70 | QRA Studio | #699 | S3 | F-N tick jumble (duplicate keys); enum badges |

Every app is Demo-ready after T1. The Process Safety engines matched the
Yellow Book and Purple Book worked examples exactly.

## Suite-wide pieces

- Shared StudioHeader: the title absorbs the squeeze, so every tab stays
  visible at 1366. The Full precision label sits on one line.
- The chart-standard legend band is swept across the facilities
  studios.
- Engine notes capitalise their first letter across the valve, metering,
  line sizing, relief, tank and heat exchanger studios. Developer phrasing
  ("this repository", input keys) is translated at display.
- The Well Spacing map was also missing the Leaflet stylesheet, and is
  fixed.

## Held for the owner

- One production zip after the Wave 5 merges. Cut it with
  `cut_suite_zip.sh`, purge the CDN, and check `/version.json`. It covers
  Waves 3 to 5 if earlier zips were not uploaded.
- Engine follow-ups for `petrolord-engines`, after NAPE. Each is shown
  correctly in the Suite today:
  - `corrosion.js`: H2S note numbers in exponent form;
  - `heatTransfer.js`: HELD notes written for developers;
  - `producedWater.js`: DISSOLVED_OIL_NOTE names an argument;
  - `pumps.js`: `staticSuctionLiftFt` naming;
  - the tank engine does not carry the API 650 minimum-thickness table.
