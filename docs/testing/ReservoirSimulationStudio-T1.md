# Reservoir Simulation Studio: senior test T1

- App: Reservoir Simulation Studio (`/dashboard/apps/reservoir/reservoir-simulation-studio`)
- Wave / position: Wave 2, #23 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #649 and #650
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Eclipse Office / Petrel RE, tNavigator, CMG Builder
- Coverage before T1: S0 to S5 (worker pytest 26/26 including the SPE1 golden gate; Suite jest on adapters and importers)

## How it was tested

The app needs the OPM Flow worker, which polls the production queue, so it
could not be walked end to end in a harness before T1. T1 built
`/dev/reservoir-simulation-studio` on the in-memory Supabase double. The
double now also fakes storage and RPC, plus a stand-in for the worker. The
stand-in applies the enqueue RPC's checks, claims the run, then completes
it with a summary that OPM Flow really produced.

Before the walk, both decks were run offline with the local worker image
(OPM Flow 2026.04, no network, no credentials): the SPE1CASE1 template and
the Builder's default deck (worker fixture BUILT.DATA). Their summary.json
files were built by the worker's own `build_summary`. A deck containing
`HARNESS_FAIL` fails, which exercises the failure path. The live worker and
queue were not touched.

The walk covered the Deck, Builder, Runs and Results tabs at 1366 x 768 in
three flows: SPE1 template to run, Builder generate to run, and a failing
deck.

## Verdict

**Demo-ready after T1 (no S1).** The run path and the charts are correct
against what flow produced:

- **SPE1:** a 20,000 STB/d plateau to about day 950, then decline to 5,558
  STB/d at 10 years, with GOR rising from 1.27 to about 21 Mscf/STB (the
  published SPE1 shape).
- **Builder default:** FOPR held at 4,000 STB/d, FOPT 7.31 MMSTB at 5
  years, FPR falling from 4,199 to 3,287 psia.

The defects are in how results are presented.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| RSIM-T1-001 | S2 | Results opened on an empty "Pick a completed run" even right after a run completed | Opens the newest completed run; a user pick stays |
| RSIM-T1-002 | S2 | Noise-level vectors on auto axes: the dry model's water cut (1.7e-5) and water rate (0.07 STB/d) plotted as rising trends | Zero-based axes with a floor per unit (frac 0.1, STB/d 10, Mscf/d 100); nice axis maxima; small ticks with sensible decimals |
| RSIM-T1-003 | S3 | Day axis ticks at 950 / 1900 / 2850 / 3800, running past the end of the run | Round day ticks ending at the last report step |
| RSIM-T1-004 | S3 | Case picker labelled "Project" inside the Case section | "Case" throughout the picker |
| RSIM-T1-005 | S3 | Deck size wrapped as "4 K B" in the run-status rail | Wraps between words only |
| RSIM-T1-006 | S3 | Em dashes across toasts, titles, template names and chart titles | Rewritten |
| RSIM-T1-E1 | Enhancement | No way to walk the app without the production worker | Harness with storage and RPC fakes and a worker stand-in fed by real flow output |

## Observations (not changed)

- The shipped SPE1 template still carries the upstream comment "This deck
  is currently not supported by the OPM simulator flow due to lack of
  support for DRSDT"; flow 2026.04 runs it. It is ODbL upstream text, so it
  was left as is. Consider a Suite note above it.
- The Case section shows "Case" twice (section label and picker label), as
  other studio apps show "Project" twice.
- Owner S1 live-queue gate (from S1) remains the owner's step.

## Tests

`e2e/reservoir-simulation-t1.spec.js`: SPE1 run with results auto-opened;
Builder deck run with a zero-based water cut axis; a failed run with its
flow error. The existing simstudio jest suites also pass.
