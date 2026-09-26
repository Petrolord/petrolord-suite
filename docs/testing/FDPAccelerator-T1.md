# FDP Accelerator: senior test T1

- App: FDP Accelerator (`/dashboard/apps/economics/fdp-accelerator`)
- Wave / position: Wave 2, #24 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #650 and #651
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Aucerna Planning Space, GEP / PEEP-style FDP screening
- Coverage before T1: E3 slim rebuild (theatre modules removed), EC6 repairs (plan-own economics, reserves check), W3 full precision

## How it was tested

New harness `/dev/fdp-accelerator` on the in-memory Supabase double. The
worked example was loaded on every tab that offers one (Field Overview,
Subsurface, Wells, Facilities, Schedule, Economics). An FPSO concept (3
wells, 25 kbpd peak) and a $70/bbl base scenario were entered by hand, and
all twelve sections were walked at 1366 x 768.

## Verdict

**Not Demo-ready before T1: one S1; now Demo-ready.** The screening NPV
itself is consistent (the Economics tab and the engine agree: NPV $1,421.5MM
at 10 percent, IRR 58.9 percent, payback 2.6 years). The Plan status rail
beside it printed that NPV as **"$1K"**: formatCurrency took the $MM figure
for dollars. Around it were layout defects that hid controls at 1366, and
the Economics tab quoted an NPV on a profile booking 113 percent of the
plan's P50 oil without saying so (the Documents tab did say so).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FDP-T1-001 | S1 | Rail NPV "$1K" for an NPV of $1,421.5MM | `fmtMM`: "$1,422MM" on the rail and the same format on the Economics tile |
| FDP-T1-002 | S2 | Main column on a Radix ScrollArea: the Gantt widened it under the Plan status rail, hiding Load example / Add Activity | Plain scroller with `min-w-0`; the Gantt scrolls inside its own card |
| FDP-T1-003 | S2 | "Still to do" omitted concept and scenario while the NPV said both were missing | Both listed (9 items on an empty plan) |
| FDP-T1-004 | S2 | Economics tab showed the NPV of a 95.8 MMbbl profile against an 85 MMbbl P50 with no warning | The plan's own `planReservesCheck` warning shown beside the NPV |
| FDP-T1-005 | S2 | Reserves table inputs a few characters wide at 1366 ("Reservo", "6(", "0.:"); clearing a number stored NaN | Minimum input widths (table scrolls); empty stores 0 |
| FDP-T1-006 | S2 | Economic Indicators tiles clipped "$142" and "58.9%" | Economics and Sensitivity stack below 1536 px |
| FDP-T1-007 | S3 | Cash flow, tornado and risk charts on the dark theme without the logo | White ChartFrame standard with axis labels and $MM tooltips |
| FDP-T1-E1 | Enhancement | No harness | `/dev/fdp-accelerator` on the in-memory double |

## Observations (not changed)

- Module header buttons ("Load example", "Add Cost Item") wrap to two lines
  at 1366 with both rails open.
- The concept form collects its own CAPEX fields, but the plan NPV costs the
  Economics tab's cost items. The two can disagree; the text under the NPV
  names its basis. Worth one source of cost truth after NAPE.
- The example subsurface carries a summary P50 of 115 (oil plus gas added);
  nothing reads it, as the app uses the per-fluid table.

## Tests

`src/utils/fdp/__tests__/fdpT1.test.js` (fmtMM; reserves warning with a
negative control), the `openItems` test updated, and
`e2e/fdp-accelerator-t1.spec.js`. FDP jest 79/79.
