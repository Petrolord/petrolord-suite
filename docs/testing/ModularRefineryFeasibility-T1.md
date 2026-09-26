# Modular Refinery Feasibility: senior test T1

- App: Modular Refinery Feasibility Studio (`/dashboard/apps/midstream-downstream/modular-refinery-feasibility`)
- Wave / position: Wave 2, #30 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #653 to #657
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Nelson-style screening, vendor modular refinery feasibility decks
- Coverage before T1: DS3 and DS4 builds and a page smoke test

## How it was tested

A new harness, `/dev/modular-refinery-feasibility`, runs the app on the
in-memory Supabase double. I walked the default hydroskimming case (10,000
bpd, $80 crude, firm supply) at 1366 x 768 and checked the figures by hand.

## Verdict

**Demo-ready (no S1 or S2).** The figures agree:

| Figure | Hand calculation | Result |
| --- | --- | --- |
| Gross value | 0.03 x 55 + 0.20 x 108 + 0.13 x 100 + 0.32 x 104 + 0.30 x 58 | 86.93 $/bbl |
| Margin | 86.93 - 80 - 3.5 | 3.43 $/bbl |
| Fixed opex per barrel | 12M / (10,000 x 340) | 3.53 $/bbl |

Because fixed opex exceeds the margin, simple payback never comes, and the
app says so. The scaling curves also match at 2,000 bpd:

- Modular: 10,000 x 0.2^-0.1 = $11,750/bpd.
- Stick-built: 10,000 x 0.2^-0.4 = $19,037/bpd.

The defects are in how the results are presented.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| MRF-T1-001 | S3 | Product slate and price inputs showed engine keys ("lpg", "fuelOil") | Refinery names (LPG, Fuel oil) |
| MRF-T1-002 | S3 | Negative money printed as "$-97.4MM" and "$-2.57" | Sign first: "-$97.4MM", "-$2.57" |
| MRF-T1-003 | S3 | Scale chart: the top legend collided with the reference-line label, the y title overlapped the ticks, and the tooltip style was spread as props | Legend in the shared bottom band, labelled reference plant, clear y title, proper tooltip style |
| MRF-T1-E1 | Enhancement | No harness | `/dev/modular-refinery-feasibility` |

## Observations (not changed)

- The IRR shows "n/a" without a reason. On this case there is no sign
  change, so an IRR does not exist.

## Tests

`e2e/modular-refinery-t1.spec.js` checks the slate names, signed money and
margins. I updated the page smoke test to the signed format. MRF jest:
13/13.
