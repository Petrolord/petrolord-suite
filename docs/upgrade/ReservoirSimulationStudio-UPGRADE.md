# Reservoir Simulation Studio: upgrade, Step 1 and the Step 2 analysis

Reservoir round of the app upgrade programme, app 8
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Branch `feat/sim-u1`,
2026-10-04. Lens: PL1 to PL12 (`docs/scope/AppUpgrade-BestPractices.md`) and
RL1 to RL12 (`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`). Finding
IDs `SIM-U1-nnn` (Step 1) and `SIM-U2-nnn` (Step 2).

How it was checked: the app on the `/dev/reservoir-simulation-studio` harness
in Chromium (Playwright) at 1366x768, 1440x900 and 390x844 in light and dark;
the code; and OPM Flow 2026.04 itself, run in an isolated compose project of
the worker image (`simverify-sim`; the live worker was not touched and no
live run was queued). The harness completes runs with summaries the worker
code built from real OPM Flow runs on 2026-10-04.

## 1. What changed, in six lines

1. **The report** (the app had none): identification, run provenance, what
   the deck holds, the builder inputs with sources, headline results, the
   material balance per component and the convergence statistics from the
   simulator's PRT, limits and flags, six figures on the calendar axis.
2. **The worker reads the PRT** (`simworker/prt.py`). The owner redeploys the
   worker; until then the report prints "not reported by this build".
3. **Intakes by id**: PVTO, PVDG and PVTW from a Fluid Systems Studio
   project (pvt-1), SWOF and SGOF with Pc from a SCAL Studio project (kr-1),
   with provenance as deck comment lines and "source changed since".
4. **Saved state**: the builder form is saved with the case (it was lost on
   a tab switch); record sharing adopted; decks and runs stay with the owner
   and the UI says so.
5. **Units, datum, doors**: the Suite unit profile at the builder fields,
   the results, the CSV and the report; METRIC decks read as METRIC; the well
   datum module for deviated wells; the deck and history doors on hostile
   files.
6. **Honesty**: failed runs keep their exit code; active cells recorded;
   blank inputs refused instead of hidden defaults; "complete" now says
   whether the balance closes.

## 2. Step 1 results

Grades before and after (P pass, Pa partial, F fail, NA). Before is the gap
matrix grade where it graded the check, confirmed or corrected here.

| Check | Before | After | Findings | Evidence after |
|---|---|---|---|---|
| PL1 Labels mean what the textbook says | Pa | P | 015, 003 | METRIC decks no longer printed under FIELD labels; the PVT caption names the correlations the engine ran (test calls `blackOilMethods`) |
| PL2 Hostile file set | Pa | P | 011, 012 | `e2e/fixtures/simulation/hostile/` (9 files), `simDoors.test.js` (13), e2e PL2 |
| PL3 Units, datums, frames | F | P | 010, 013, 015 | Unit profile on fields, results, CSV, report; one known value per conversion (`simIntakes.test.js`); TVDSS stated; datum module |
| PL4 No claim without the event | Pa | P | 002, 016, 027 | Status words from the PRT; "Generate replaces" stated; owner-only stated |
| PL5 Real saved state | F | P | 005, 018 | Form in the context, saved with the case; e2e PL5 (tab and case switch); version 1 forms migrate (`migrateBuilderForm`) |
| PL6 Real browser | Pa | P | 028 | e2e PL6, six viewport and theme runs, white charts, no sideways scroll; 390 tab strip scrolls (028, shared shell) |
| PL7 The report a reviewer can sign | F | P | 001 | `simReport.test.js` (16) read back with poppler; goldens |
| PL8 The practitioner's day | Pa | Pa | 025, 027 | Walk below; colleague runs and corner point go to Step 2 |
| PL9 The chain | F | P | 003, 004 | e2e RL11: Fluid and SCAL projects by id into the deck; intake tests compare with the producers' own exports |
| PL10 Real scale | NA | NA | | SPE9 (9,000 cells) runs in 16 s on the worker; the 200,000 cell cap is the worker's; nothing heavy in the browser |
| PL11 Inputs a person can type | Pa | P | 006 | Text inputs keep "-" and "2."; SI fields keep the draft while typing; blank refused by name |
| PL12 House standards | Pa | P | 017, 019 | Copy without dashes or arrows; `EMPTY_VALUE`; ChartFrame with the mark; route protected (#828) |
| RL1 Every input on the page with unit and source | F | P | 001, 006 | Inputs table, every row value, unit, source; applies only when the form made the deck that ran (SHA-256) |
| RL2 Composite inputs show components | F | Pa | | Surface densities and PVTW are written from named sources; the deck builder has no other composite. Pc from J prints a, b, Swirr, k, porosity, IFT, angle |
| RL3 Lumped results split | F | P | 020 | Material balance per component; allocation fractions kept and printed |
| RL4 Identification | F | P | 001 | Company, field, licence, reservoir, analyst, case, model period, analysis type, run |
| RL5 Data and operations summary | Pa | P | 024 | Deck summary: grid, schedule, history phase, EQUIL, wells table |
| RL6 Every claimed result has its plot | F | P | 001 | Six figures, conditional ones say why; history match with the history phase shaded |
| RL7 Basis named | Pa | P | 009, 014, 015 | Calendar axis; deck units and display units named; TVDSS; absolute pressure; surface volumes |
| RL8 Strengths kept, no claim without event | Pa | P | 002, 007, 022 | Balance and convergence from the PRT; "not reported by this build" for older runs; negative-control tests |
| RL9 Limits printed | Pa | P | 023 | "Limits of this analysis" and "Flags on this run" |
| RL10 Import doors | Pa | P | 011, 012 | Shared tabular reader; read-back for both doors |
| RL11 Intakes with senders, provenance travels | F | P | 003, 004 | pvt-1 and kr-1 by id, cards, deck comments, report |
| RL12 Screen, report, saved project one model | F | P | 005, 009 | Report tab and PDF from one model; figures from the Results series builder (point counts held); CSV from the summary in the display units |

## 3. Findings

| ID | Sev | Check | What was true | Found by | Fix and proving test |
|---|---|---|---|---|---|
| SIM-U1-001 | S2 | RL1, RL4, RL6, PL7 | No report at all. | Gap matrix, confirmed | `src/utils/simstudio/reportModel.js`, `reportFigures.js`, `reportExport.js` on the kit; Report tab; `simReport.test.js`, goldens `spe1-template`, `builder-default`; e2e RL |
| SIM-U1-002 | S2 | RL8, PL4 | "Latest run complete." meant only that flow exited and the summary parsed. The worker never read the PRT: no material balance, no convergence. | Code | Worker `prt.py` (prt-1 diagnostics in summary.json); `runStatus.js` words; the report's balance and convergence tables; `test_prt_parse.py` (13), `test_prt_gate.py` (4, against the run's own summary vectors); `simReport.test.js` negative control (a balance that does not close is flagged and never called closing) |
| SIM-U1-003 | S2 | RL11, PL1 | The Fluid card said "correlations from Fluid Studio" while the builder ran Standing and Beggs-Robinson fixed in code, with no intake. | Gap matrix, confirmed | `builderIntakes.js` `takePvtIntoForm`; FluidIntake card; PVTO/PVDG/PVTW are Fluid Systems Studio's own export blocks (`simIntakes.test.js`, character for character, negative control on drop). Sender: "Send to Reservoir Simulation Studio" in Fluid Systems Studio (`?fluidProject=<id>&tab=builder`); the RL11 static guard lists the new reader |
| SIM-U1-004 | S2 | RL11 | "Relative permeability (Corey, SCAL Studio model)" was a typed form; no intake. | Gap matrix, confirmed | `takeKrIntoForm`; ScalIntake card; SWOF/SGOF are SCAL Studio's own export rows with Pc from the J and its own Swirr (`simIntakes.test.js`). Sender: "Send curves and Pc to Reservoir Simulation Studio" on SCAL's Export tab (saves first, `?scalProject=<id>&tab=builder`) |
| SIM-U1-005 | S2 | PL5, RL12 | The builder form was component state of the tab: a tab switch (not only a reload) reset it to the defaults; a deck could not be traced to its inputs. | Browser, wider than the gap matrix | Form in `SimStudioContext`, autosaved with the case; migration file `20261004180000_sim_cases_builder_form.sql` NOT APPLIED (until then a JSON file beside the deck, owner only); Generate records the deck SHA-256; e2e PL5 |
| SIM-U1-006 | S2 | RL1, PL11 | Blank inputs took hidden defaults; a blank OWC or GOC became a contact at 0 ft, which put the whole reservoir below the OWC (water filled). | Code, wider than the gap matrix | `makeReader` refuses blank or unreadable inputs by name, all at once; a blank contact is placed outside the grid by the composer and the report says so (`simIntakes.test.js`) |
| SIM-U1-007 | S3 | RL8 | A failed run lost its exit code, elapsed time and log path (written on the cancelled path only), so the Runs tab offered no log for a failed run. | Bring-up defect, confirmed; the log path is wider | Worker `base_fields` on every failure; Runs tab Exit column and failure line; `test_failed_run_keeps_exit_code_elapsed_and_cells` |
| SIM-U1-008 | S3 | RL5 | `sim_runs.active_cells` was never written. | Bring-up defect | From the PRT grid line; Runs tab Cells column; report grid row |
| SIM-U1-009 | S3 | RL7, RL12 | The CSV was the worker's: FIELD only, no units row, thinning not said. | Gap matrix | `resultsCsv.js` from the summary in the display units, `#` provenance lines, units row (e2e RL) |
| SIM-U1-010 | S2 | PL3, RL7 | Oilfield only; no unit profile. | Gap matrix | `simUnits.js` on the registry; builder fields convert at the door, state stays FIELD; results, CSV, report in the display units; a new case opens in the profile's system, a saved one keeps its own |
| SIM-U1-011 | S3 | PL2, RL10 | Per-well history door: ISO dates and dot decimals only; units in headers ignored. | Gap matrix | On `parseTabular`: any delimiter, comma decimals, day-first dates (asked when unsettled), header units converted (m3/d, scf/d, MMscf/d), read-back (`simDoors.test.js`) |
| SIM-U1-012 | S3 | PL2, RL10 | Deck door: the last .DATA in a pick silently became the main deck; nothing said what was read; PYACTION found only by the worker after upload. | Code | `deckUpload.js` `planDeckUpload`: refuses two mains, binary files, PYACTION, PATHS, over 25 MB; reads back main deck, units, grid, wells, includes not picked (`simDoors.test.js`, e2e PL2) |
| SIM-U1-013 | S3 | PL3 | Deviated wells had their own "KB to datum" shift. | Gap matrix | Depth reference kind and elevation, or the registry well's datum through `readWellDatum`; old forms migrate (shift s becomes elevation -s; the same deck, tested with a negative control) |
| SIM-U1-014 | S3 | RL7 | Results X axis in days from the start. | Browser | Calendar axis on screen and in the report (`series.js`) |
| SIM-U1-015 | S2 | PL1, RL7 | A METRIC deck's results were labelled STB/d and psia (the numbers were sm3/d and bar). | Code | The worker records the RUNSPEC unit keyword; the app reads the deck when an older run lacks it; `vectorView` converts from the deck's system (`simIntakes.test.js` pins bar to kPa and psia) |
| SIM-U1-016 | S3 | PL4 | Generate silently replaced a template or uploaded deck as the case's deck. | Browser | Stated above the button |
| SIM-U1-017 | S4 | PL12 | "CASE" printed twice in the rail; arrows in UI copy. | Browser | Fixed |
| SIM-U1-018 | S3 | PL5 | Record sharing (`sim_cases`, applied 2026-10-02) not adopted. | Plan | Sharing bar; "(shared with me)" in the picker; a colleague reads runs and reports and, holding the check-out, edits the form; decks and runs stay with the owner and every screen says so |
| SIM-U1-019 | S4 | PL12 | SPE9 template said "Runs in a few minutes" (16 s measured). | Bring-up note | Fixed |
| SIM-U1-020 | S3 | RL3 | History allocation fractions were component state, not kept, not printed. | Gap matrix | `form.history.fractions`, printed in the report inputs |
| SIM-U1-021 | S4 | RL8 | The failure text repeated each error line (PRT excerpt and stderr tail). | Bring-up defect | Lines de-duplicated (test) |
| SIM-U1-022 | S3 | RL8 | The worker ran flow with terminal output off; OPM Flow 2026.04 then leaves the chopped steps and the end-of-run statistics out of the PRT. | Found while building | Terminal output on, stdout to a scratch file; gate runs flow through the runner |
| SIM-U1-023 | S3 | RL9 | Limits were one line on the Deck tab. | Gap matrix | Report limits and flags |
| SIM-U1-024 | S3 | RL5 | No schedule or deck summary with the results. | Gap matrix | `deckSummary.js`; report "What the deck holds" and wells table |
| SIM-U1-025 | S3 | RL11 | The SCAL demo project saves its gas-oil set at Swc 0.2 beside a fitted oil-water set at 0.18; SCAL Studio's own SWOF/SGOF export refuses that pair. | e2e with the Waterflood fixture | Kept and stated: the deck writes the gas-oil set at the oil-water Swc and the card, the deck notes and the report say so. The pairing itself is a SCAL item (Step 2, SIM-U2-014) |
| SIM-U1-026 | S4 | RL7 | OPM Flow 2026.04 heads its cumulative gas columns "MMSCF" and prints them in 10^6 Mscf. | Running flow | Not ours; the parser's scale is held by the gate against WGPT and WGIT of the same run, so a simulator bump that changes it fails the deploy gate |
| SIM-U1-027 | S3 | PL8 | A colleague cannot queue a run (`sim_enqueue_run` is owner-only) or write deck files (owner storage folder). | Plan | Kept, stated on the Runs, Deck and Builder tabs and in the rail; Step 2 (SIM-U2-008) |
| SIM-U1-028 | S4 | PL6 | At 390 px the header tab strip scrolls; the Report tab is off screen until scrolled. | Browser | Open: shared Studio header |
| SIM-U1-029 | S4 | RL8 | The benign `_after_fork` TypeError logged on every run. | Bring-up | Open: not touched (worker process model) |
| SIM-U1-030 | S3 | RL8 | The bundled templates did not ask for the fluid-in-place report, so their runs could never state a balance. | Building the report | RPTSOL and RPTSCHED FIP added to the SPE1 and SPE9 templates (reporting only, noted in the decks and ATTRIBUTION); the SPE1 template still matches the opm-tests reference at every report step (worker gate) |

30 findings: 26 fixed, 1 kept and stated (025), 1 kept by design and stated (027), 2 open S4 (028, 029). No S1. S2: 001, 002, 003, 004, 005, 006, 010, 015, all fixed.

### The practitioner's walk (PL8)

- *Reservoir engineer with Petrel RE*: opens SPE1, runs, reads rates on a
  calendar, reads the balance and convergence in the status line and the
  report, exports the PDF and the CSV. Would now: match BHP history (no
  WBHPH), compare two runs side by side, view pressure in 3D: Step 2.
- *Graduate engineer*: builds a model from a Fluid project and a SCAL
  project by id, sees what came from where on the cards, generates, runs.
  Would now: an aquifer from the Material Balance fit: Step 2.
- *Manager*: opens a colleague's shared case read-only, reads the report.
  Would now: queue a run on it: owner-only, stated (Step 2).

## 4. The report as built

Sections, in order: header (case, company, field, licence, reservoir,
analyst, model period, analysis type, run, display units, generated);
headline results; material balance; convergence (and the time steps cut,
when any); run provenance; what the deck holds; wells; Model Builder inputs
and their sources (or why not); limits of this analysis; flags on this run;
figures: field production rates, cumulatives, reservoir and bottomhole
pressure, water cut and GOR, injection rates, history match (each drawn or
replaced by its reason). Sample: `/root/sim-report-sample.pdf` (SPE1
template run stored by the worker code, 5 pages).

### The worker change (owner action)

`worker/sim-worker/simworker/prt.py` (new), `main.py`, `results.py`,
`runner.py`; README section "What the worker reads from the PRT". The
isolated gate (`docker compose -p simverify-sim --profile verify ...`):
**48 passed** (result in section 7). Owner redeploys:

    cd /root/petrolord-suite && git pull --ff-only origin main
    cd worker/sim-worker && ./deploy.sh

`deploy.sh` builds, runs the gate (SPE1 golden included) in the image that
is about to serve and starts only on a pass. Until then, runs carry no
diagnostics and the app says "not reported by this build". Runs made before
the redeploy keep saying so; run them again for a balance.

### What changes numbers

- Generated decks gain `RPTSOL 'FIP=1'` and `'FIP=1' 'WELLS=1'` in RPTSCHED
  and comment lines: reporting only (the worker gate runs the builder deck;
  the SPE1 template matches the reference at every report step).
- A blank OWC or GOC was a contact at 0 ft and is now outside the grid: a
  form saved with a blank contact generates a different (correct) deck.
- A typed J Swirr is used as typed; blank keeps the old Swirr = Swc.
- Results shown in SI when the profile is metric (display only); METRIC
  decks now labelled as METRIC (display only).
- The four generated worker fixtures were regenerated deliberately (comment
  lines, RPTSOL, RPTSCHED only).

### Engines

Engines PR #308 (`feat/sim-u1-fip-report`, merged by the programme lead; the Suite is pinned at engines main dc614f1 with 0 deviations): opt-in
`spec.report.balance` and `spec.notes` in `composeDeck`; a spec without them
composes byte for byte as before (the Ekene RC5 checksum gate holds).

## 5. What the gap matrix had wrong or thin

- The builder form was lost on a tab switch, not only on a reload.
- Blank inputs did worse than take defaults: a blank contact became 0 ft.
- Failed runs lost their log path too, so no log button for a failed run.
- RL1 "F" for PVT is right, and the caption was wrong as well as thin: it
  named "Fluid Studio" with no intake behind it.
- The PRT holds the balance only when the deck asks for it, and the worker's
  terminal-output flag hid the convergence statistics: the owner question 12
  default needed two worker changes and a deck change, not one.
- METRIC decks were mislabelled; the matrix did not see it.

## 6. Where validation is weaker than asked

- The material balance closure is checked against the same run's summary
  vectors (an independent channel inside OPM Flow) and on three real PRTs;
  there is no published balance-error benchmark to hold it against. The 1e-4
  "closes" threshold is a Petrolord convention, stated as such.
- METRIC balances are not computed (the PRT table units were not checked on
  a METRIC run).
- Record sharing was not walked with two real accounts; the harness has no
  sharing back end. The `builder_form` column is a file only: a colleague's
  form edit cannot be saved until the owner applies it.
- No run was queued on the live worker (brief): the worker change is proven
  in the isolated image only.
- RL2 stays Pa: the builder has few composites; PVTW slopes come from the
  pvt-1 block as Fluid Systems Studio states them.

## 7. Gate and test results

- Worker, isolated compose project `simverify-sim`: 48 passed (SPE1 golden,
  chaos, generated decks, Fluid and SCAL exports, PRT parsing, PRT gate
  against summary vectors, templates).
- jest (in band): simstudio suites, Simulation page smoke and theme, deck
  builder S3/S4/S5, Fluid and SCAL keyword exports, Well Test goldens and
  `src/__tests__`.
- e2e `e2e/simulation-upgrade.spec.js`: 10 tests, local pass on the harness.

## 8. Step 2 analysis

### 2a Competitor parity (Petrel RE with ECLIPSE and INTERSECT, tNavigator, CMG)

Sources read: SLB Petrel RE product sheet (2015); tNavigator modules brochure
(2021, via a reseller); CMG IMEX product page; OPM Flow 2026.04 and 2023-04
release notes. ECLIPSE keyword rows are general knowledge (the ECLIPSE sheet
did not load). The central fact: OPM Flow 2026.04 already reads most of the
keywords below, so an uploaded deck can use them today; parity is lost in
what the Model Builder writes and what the app shows.

| Capability | Petrel RE / ECLIPSE | tNavigator | CMG | Petrolord after U1 |
|---|---|---|---|---|
| Corner-point grids, faults | yes | yes | yes | deck only; builder layer-cake |
| LGR | yes | yes | yes | deck only |
| Grid from the geomodel | upscaling | yes | yes | Earth Modeling writes GRDECL; no Simulation intake |
| PVT and SCAL tables from studies | yes | yes | yes | pvt-1 and kr-1 by id (U1) |
| Hysteresis, Stone, end-point scaling | yes | yes | yes | deck only; builder writes none |
| Regions (SATNUM, PVTNUM, FIPNUM) | yes | yes | yes | one region |
| Analytical and numerical aquifers | yes | yes | yes | deck only; MBAL fits aquifers and cannot send them |
| VFP tables, THP control | yes | yes | yes | none; Nodal Analysis exists |
| Group controls, well limits | yes | yes | yes | none in the builder |
| Pressure history match, mismatch | yes | yes | CMOST | rates only, overlay only |
| Assisted HM, uncertainty batches | yes | yes | CMOST | one run at a time (quota) |
| 3D results, streamlines | yes | yes | yes | grid preview only |
| Run compare, restarts | yes | yes | yes | none |
| Balance, convergence, report | yes | yes | yes | yes (U1) |

### 2b Deferred backlog

WBHPH pressure matching; corner-point grids; realisation batches (quota
decision); hysteresis and three-phase kr from SCAL (owner: this round);
the Waterflood deck sender; colleague run queueing (owner-only RPC today);
the `_after_fork` log noise; the SCAL gas-oil Swc pairing.

### 2c Suite integration

Senders into Simulation today: Fluid (pvt-1), SCAL (kr-1), Material Balance
(cumulatives), Mapping (surfaces). Missing: Material Balance aquifer, Nodal
VFP, Earth Modeling grid (GRDECL exists), Waterflood pattern deck. Out of
Simulation: nothing; a `sim-forecast-1` sender to Forecast Scenario Hub and
Petroleum Economics Studio (the run's field profile) would close the loop
the other Reservoir apps closed this round.

### One ranked backlog

| # | ID | Item | Size | Batch | Why |
|---|---|---|---|---|---|
| 1 | SIM-U2-001 | Pressure history match: WBHPH and observed BHP in the history import, worker whitelist, overlays, a mismatch table per well and vector in the report | M | A | The first thing a reviewer of a history match asks; rates alone are matched by construction under WCONHIST |
| 2 | SIM-U2-002 | `sim-forecast-1` sender: the run's field oil, gas and water profile to Forecast Scenario Hub and Petroleum Economics Studio by id, with the run's provenance | M | A | Closes the chain every other Reservoir app closed this round |
| 3 | SIM-U2-003 | Three-phase kr choice (STONE1, STONE2, default) and Killough hysteresis from SCAL (imbibition sets in kr-1), written by the builder | M | A | Owner: hysteresis and three-phase belong to this round; OPM already reads them |
| 4 | SIM-U2-004 | Analytical aquifer in the builder, sent from a Material Balance fit (Carter-Tracy or Fetkovich: AQUCT, AQUFETP) | M | A | MBAL fits aquifers that Simulation cannot use |
| 5 | SIM-U2-005 | Run compare: two runs of a case side by side on the Results tab and in the report | S | A | Every sensitivity is a pair of runs |
| 6 | SIM-U2-006 | Group controls and limits: GCONPROD/GCONINJE with voidage targets, WECON | M | B | Waterflood and VRR send voidage targets |
| 7 | SIM-U2-007 | Waterflood deck sender: a pattern from Waterflood Design Studio into the builder (grid, wells, rates, kr-1 and pvt-1 it holds) | M | B | Deferred from Waterflood |
| 8 | SIM-U2-008 | Colleague run queueing: an enqueue function that accepts a member holding the check-out, runs under the owner's folder and quota | M | B | Needs a migration and the second engineer (security definer change) |
| 9 | SIM-U2-009 | VFP from Nodal Analysis Studio, THP control | M | B | Production engineers own the lift curves |
| 10 | SIM-U2-010 | Corner-point grid with faults from Mapping and Earth Modeling (GRDECL intake) | L | C | The biggest parity gap; heavy engine work |
| 11 | SIM-U2-011 | Realisation batches with a tornado | L | C | Quota decision first |
| 12 | SIM-U2-012 | 3D results viewer (restart arrays by step) | L | C | Large; the preview exists |
| 13 | SIM-U2-013 | End-point scaling and regions (SATNUM, PVTNUM, FIPNUM) | M | C | Needs rock types in SCAL first |
| 14 | SIM-U2-014 | SCAL saves the gas-oil set at the oil-water Swc (or says it does not) | S | B | SIM-U1-025, a SCAL fix |
| 15 | SIM-U2-015 | METRIC balance: check the PRT table labels on a METRIC run and compute it | S | B | SIM-U1 left METRIC unverified |
| 16 | SIM-U2-016 | `_after_fork` log noise (SIM-U1-029) and the 390 px tab strip (SIM-U1-028) | S | C | Small, no user impact |

Batches proposed: A = 001, 002, 003, 004, 005 (NAPE-safe, no schema);
B = 006, 007, 008 (with the owner), 009, 014, 015; C = 010, 011, 012, 013, 016.

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Redeploy the worker now (PRT reading, exit codes, unit system)? | Yes, as soon as this PR merges: `cd /root/petrolord-suite && git pull --ff-only origin main && cd worker/sim-worker && ./deploy.sh` |
| 2 | Apply `20261004180000_sim_cases_builder_form.sql` (one nullable jsonb column, product table, no policy change)? | Yes, staging first; until then forms save beside the deck for the owner only |
| 3 | Colleague run queueing (SIM-U2-008) changes a security-definer function. Build it? | After NAPE, with the second engineer |
| 4 | Realisation batches need a quota (today 2 in flight, 10 per day). | Keep the quota; batches after NAPE with a per-org quota of 20 runs per day |
| 5 | A gas-oil set saved at another Swc is written at the oil-water Swc and said. Refuse instead? | Keep (stated everywhere), and fix the pairing in SCAL (SIM-U2-014) |
| 6 | The 1e-4 relative "closes" threshold for the material balance. | Keep, stated as a Petrolord convention; the error is always printed |

## 9. Batch decision (programme lead, 2026-10-04)

Recorded verbatim.

Owner-question defaults in force: worker redeploy after merge (owner); builder_form migration staging first (owner); colleague run queueing after NAPE with the second engineer; batch quota stays 2 in flight and 10 a day; the gas-oil set is written at the oil-water Swc until SCAL's pairing fix; the 1e-4 balance threshold stays, stated.

BUILD in this order, one commit per item:
- Batch A: 002 `sim-forecast-1` sender to Forecast Scenario Hub and Petroleum Economics Studio (follow wf-forecast-1 exactly: calendar periods, units, basis, deck SHA-256 and run id, "source changed since", the cash-flow engine gated to ignore the provenance record); 001 BHP history match (WBHPH in the deck from observed bottomhole pressure, with a mismatch table by well and an RMS figure in the report; observed pressures through the existing import door); 005 run compare (two or more runs of a case, overlaid on the calendar axis, a difference table, in the report); 003 three-phase oil relative permeability (Stone I or II and the OPM default) from SCAL's kr-1 two-phase sets, choice stated in the deck and report; 004 analytical aquifer from a Material Balance case through mbal-1 (Carter-Tracy or Fetkovich as OPM supports, the parameters' source printed; validate the keyword mapping on a known case).
- Batch B if time remains: 014 SCAL gas-oil Swc pairing (fix in SCAL so the gas-oil set is saved at the oil-water Swc, then drop the Simulation warning for paired sets); 015 METRIC balance; 007 Waterflood deck sender (wf-forecast-1 pattern to a builder starting deck).
- DEFERRED (record reasons): 006 group controls and WECON, 008 colleague run queueing (owner: after NAPE), 009 VFP from Nodal, all of Batch C.

Branch `feat/sim-u2`. Step 2 results are recorded per item in section 10.

## 10. Step 2 build (feat/sim-u2)

| ID | Item | State | Proving test | Isolated gate |
|---|---|---|---|---|
| SIM-U2-002 | `sim-forecast-1` sender to Forecast Scenario Hub (profile case) and Petroleum Economics Studio (production file), read by case and run id | Done | `simForecastContract.test.js` (12): on OPM Flow's own summaries the step rates integrate to the run's FOPT (closure < 1e-5), years sum to Np exactly, prediction plus history equals the run, METRIC pinned (1 sm3 = 6.289811 STB), the hub case reproduces Np, `computeCashFlow` ignores the record; negative controls (no FOPR, thinned without FOPT, Arps without the profile kind, a filter without the key, a deck changed after the run); e2e U2-002 | Not needed (no deck change) |
| SIM-U2-001 | BHP history match: a bhp column at the per-well door (psia, psig, bar, barg, kPa, MPa), WCONHIST item 10 and WCONINJH item 5, WBHPH; the report's mismatch table by well (points, observed range, RMS, mean, largest) and a figure | Done | `simU2Decks.test.js` (8: door conversions pinned, refusals, deck text, negative control without the column; one point per observed period against the time-weighted WBHP, hand values; the form as the source with WBHPH checked against it); engines `sim.u2.test.js`; e2e U2-001 (door, deck, run, report, PDF) | `test_u2_deck.py`: OPM Flow reports WBHPH equal to every observation and carries the last one forward through a period that gives none (found by the gate; the app therefore takes the observed periods from the builder form and checks WBHPH against it); the S4 rate-only deck has no WBHPH. 50 passed |
| SIM-U2-005 | Run compare: two or more completed runs of a case (first picked is the base), one vector overlaid on the calendar axis, a difference table (cumulatives, end rates and pressure, end date, balance, deck), in the report as a table and a figure | Done | `simRunCompare.test.js` (5: two real OPM runs, difference parsed back; a missing cumulative is the integrated step rates, equal to FOPT within 1e-5; negative controls: one run, a thinned series; SI overlay pinned; PDF read back); e2e U2-005 | Not needed (no deck change) |
| SIM-U2-003 | Three-phase oil kr: Stone I (STONE1), Stone II (STONE2) or the simulator default, built by OPM Flow from the two-phase sets (typed or kr-1 from SCAL); a choice is written to the deck with a comment line, the report names the model of the deck that ran (deck row, assumptions, inputs). Killough hysteresis not built (needs imbibition sets in kr-1; deferred) | Done | engines `sim.u2.test.js` (keyword placement, refusal, explicit default byte for byte); `simU2Decks.test.js` (fixtures, deck notes, deck reading, report words, refusal); e2e U2-003 | `test_u2_deck.py`: three decks of a model where all three phases flow (FGOR rises above 1.2x, water produced) run with no simulator error; STONE1 and STONE2 change the run against the default (largest relative difference in FOPR or FGOR 1.5 and 1.3 percent) and differ from each other. 51 passed |
| SIM-U2-004 | Analytical aquifer: Fetkovich (AQUFETP) or Carter-Tracy (AQUCT with AQUTAB), typed or taken by id from a Material Balance case (mbal-1 now carries `aquifer`: the numbers the last run used, fitted first, with sources), joined to a face (AQUANCON); CT influence function is the MBAL engine's own `carterTracyPD` (exported, unchanged); k written as k x mu(PVTW) / mu(aquifer) because OPM takes mu from PVTW; AAQR/AAQT/AAQP kept by the worker; Results charts, report inputs, assumption and figure | Done | `simAquiferValidation.test.js` (known case: Dake 1978 Ex. 9.2 aquifer, Ahmed REH Ex. 10-10: the MBAL engine marched on OPM's own field pressure against OPM's AAQT. Fetkovich: yearly influx after the first year within 1 percent (0.2), cumulative at four years 0.6 percent; CT: every step after the first month within 1.5 percent (0.4 to 0.8), 0.4 at four years; negative controls W given as Wei, k unscaled: 20 and 10 percent off); `simU2Decks.test.js` (deck text, refusals, mbal-1 mapping, edits named); engines `sim.u2.test.js`, `mbal.carterTracyPD.test.ts`; e2e U2-004 (MBAL Dake case by id into the deck, run, results, report, PDF) | `test_u2_deck.py`: both decks run with no simulator error; Fetkovich AAQP = p0 - AAQT / (ct W) within 0.05 psi at every step (V0 and ct read in the units written); AAQR integrates to AAQT. OPM Flow 2026.04 does not handle FAQR/FAQT (found by the gate), so the per-aquifer vectors are used. 53 passed |
| SIM-U2-014 | SCAL gas-oil Swc pairing: SCAL Studio holds the gas-oil set at the oil-water Swc (the field follows and is read-only); a project saved with two Swc opens moved, a gas-oil fit at a sample's own Swc is written at the oil-water Swc; the move is kept (`curves.goSwcPairing`) and stated on the Curves tab and in the report; the Simulation warning no longer appears for a paired block (an old saved block still warns) | Done | `scalGoSwcPairing.test.js` (4: open-and-move, the saved block taken by Simulation with no adjustment or warning, negative control the old workspace, the provider's setters); SCAL goldens (schema1-manual: its gas-oil set moved from 0.2 to the oil-water 0.22, deliberate); e2e scal U2-001/U2-002 updated (field read-only, follows, no refusal) | Not needed |
| SIM-U2-015 | METRIC balance: the worker reads a METRIC run's PRT tables (balance sheet SM3; cumulative table MSCM for oil and water, MMSCM for gas, as OPM Flow 2026.04 prints them) and computes the balance; the report converts every PRT volume from the unit it printed (balance, headline fallbacks, OOIP, pore volume); FWPT and FGPT kept when a deck asks | Done | `test_prt_parse.py` (a METRIC PRT closes per component; negative control MMSCM read as 10^3 sm3 leaves gas open); `simMetricBalance.test.js` (3: oilfield and SI display, sm3 to STB 6.289811 and to Mscf pinned, negative control) | `test_u2_deck.py`: a hand-written METRIC box (tests/integration/fixtures/metric/METRIC_BOX.DATA) runs; the balance is computed and closes; the scaled cumulative table equals the run's FOPT, FWIT, FWPT and FGPT within the printed rounding. 56 passed |
| SIM-U2-007 | Waterflood deck sender: "Start a model in Reservoir Simulation Studio" in Waterflood Design Studio; the Builder reads the pattern by id (wf-forecast-1 with the saved project) and writes the quarter five-spot element (11 x 11, a quarter of the area, thickness, porosity, thickness-weighted layer permeability), the injector at a quarter of the pattern rate over Bw, a producer liquid rate that balances it, the start date and length, and takes the kr-1 and pvt-1 projects the pattern holds by id; what the pattern does not hold is listed on the card, in the deck notes and the report. Line drives refused for now | Done (five-spot only) | `simWfStart.test.js` (2: element size and rates from the contract, intakes by id, deck notes and fixture; negative controls a line drive, no Fluid project); e2e U2-007 (Waterflood harness to Simulation by id, generated, run) | `test_u2_deck.py`: BUILT_WF.DATA runs, injects the stated 191.75 STB/d, water breaks through, the balance closes |
