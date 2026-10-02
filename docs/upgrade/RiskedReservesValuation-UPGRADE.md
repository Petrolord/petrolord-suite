# Risked Reserves Valuation: comprehensive upgrade

App 4 of the Reservoir round of the app upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`), with the reviewer-lens re-check
of ReservoirCalc Pro (recorded in `docs/upgrade/ReservoirCalcPro-UPGRADE.md`,
section "RL re-check"). Step 1 (the two lenses: practitioner PL1 to PL12,
`docs/scope/AppUpgrade-BestPractices.md`, and reviewer RL1 to RL12,
`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run and fixed on
2026-10-02 on branch `feat/rrv-u1`. Step 2 is analysis only.

- Route: `/dashboard/apps/reservoir/risked-reserves-valuation` (ProtectedAppRoute, slug `risked-reserves-valuation`), help at `/help`.
- Harness: `/dev/risked-reserves` (in-memory ReservoirCalc Pro inventory and in-memory account). New: `?table=off` (the database before the migration), `?saved=1`, `?shared=1`, `?legacy=1`, `?chain=1` (ReservoirCalc Pro's own Prospect Risking panel above the workstation on one inventory).
- Engine: `packages/engines/engines/prospect/valuation.js` (vendored, unchanged). No Monte Carlo and no NPV code was added: the report's parts are built from the engine's own exports.
- Earlier cycles: T1 rebuild (2026-09-26), design rollout 3E, RCP-U1-003/004 and U2-012 (handoff fixes), H8 (honesty sweep). All still hold: the T1 jest suites and `e2e/risked-reserves.spec.js` pass unchanged.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Fixtures (PL5, PL9) | `riskedreserves/services/rrvFixtures.js` | Two prospects as Prospect Risking saves them today (unit, basis, source block), one as the G5 release saved it (no unit, no basis), the browser list as the T1 build wrote it, and the chain harness run |
| Store (RL11, RL12, PL3, PL5, PL11) | `__tests__/rrvU1Store.test.js` (21) | Blanks never zero, the handoff block, the fingerprint, edits, a change upstream, refresh, saved state and merge, unit anchors, the CSV header |
| Report parts (RL2, RL3, RL6) | `__tests__/rrvU1Math.test.js` (23) | EMV parts and outcomes close on `valueProspect` to 1e-9; the mean of the value curve is the engine EMV; negative controls |
| Report (RL1 to RL12) | `__tests__/rrvU1Report.test.js` (22), golden in `__fixtures__/reportGolden/` | The PDF built by the function the button calls, read back with the Report Kit test side |
| Workstation | `__tests__/rrvU1Workstation.test.jsx` (19) | Table and browser fallback, the move on first save, upstream change after a reload, two tabs, units, typing, Report tab, sharing, remove and undo |
| Migration | `__tests__/rrvMigration.test.js` (6), `tools/validation/rrv-valuations/` | File shape guard; scratch Postgres runner; pentest |
| `.pld` | `src/lib/portability/__tests__/rrvValuationFamily.test.js` (3) | Round trip with and without the prospect |
| Kit | `src/lib/reportKit/__tests__/reportKitBars.test.js` (7) | The bar chart and line label rows |
| Browser | `e2e/risked-reserves-upgrade.spec.js` (11) | The chain, saved state, handoff, doors, three viewports in both themes; PDF read back with pdftotext |

Negative controls are inside the tests: the engine alone values a blank Pg as
zero; EMV parts without the development term miss by more than 25 $MM; a
value curve without the development cost has another mean; removing an
inputs row fails the completeness guard; the pentest fails with the guard
trigger dropped, with the read policy opened, and with a PUBLIC storage
policy that reads the table.

## Step 1: the two lenses

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed | 006 | Quantity table below. Volumes are oil equivalent and were labelled MMbbl. |
| PL2 Hostile inputs | NA for files, pass for the door | 003 | No file importer. The doors are the ReservoirCalc Pro handoff (legacy, raw STB, gas, metric, in-place rows all covered by fixtures) and typed fields. |
| PL3 Units, datums, frames | Failed, fixed | 009 | Suite unit profile adopted: MMboe or 10^6 m3 oe, value per boe or per m3; state in one system; anchors tested. No depths in this app. |
| PL4 No claim without the event | Failed, fixed | 001, 003, 007 | "Saved" was never said because nothing was saved; a cleared Pg valued as zero; defaults shown as inputs. Save state, storage note and assumption wording now come from the event. |
| PL5 Real saved state | Failed, fixed | 001, 014 | The T1 browser list opens and moves to the account; reload; two tabs; a row deleted elsewhere. |
| PL6 Real browser | Failed, fixed, one kept | 011, 021 | Axis title over tick labels; portfolio line cut at phone width. Three viewports, both themes, no page errors (e2e). |
| PL7 Report a reviewer can sign | Failed, fixed | 002 | There was no report. See RL1 to RL9. |
| PL8 Practitioner's day | Gaps recorded | 015, 019, 022 | Persona walks below. |
| PL9 The chain | Failed, fixed | 004, 005, 012, 013 | Chain e2e from ReservoirCalc Pro's panel to the report; `.pld`. |
| PL10 Real scale | Pass | none | Closed form: 500 prospects valued in 14 ms, one report model in 29 ms (jest, this box). |
| PL11 Inputs a person can type | Failed, fixed | 003 | Clearing, "2.", "-", a comma decimal; a blank is never zero. |
| PL12 House standards | Pass after fixes | 006, 018 | Copy, `EMPTY_VALUE`, white chartTheme and ChartLogo, route protected (re-checked), help updated. |
| RL1 Inputs with unit and source | Failed, fixed | 002, 007 | Every engine input has a row (completeness guard, app and kit); defaults print as assumptions; a blank prints n/a. |
| RL2 Composites show components | Failed, fixed | 010 | Chance factors, their product and the Pg used; "entered as a total" when they differ. |
| RL3 Lumped results split | Failed, fixed | 002, 008 | Unrisked and risked volumes; EMV in three terms with the formula; three outcomes closing on the EMV. |
| RL4 Identification | Failed, fixed | 002 | Company (organisation, editable), prospect, licence or block, play, analyst, type, source, basis, saved state, build, units, time. An old valuation prints n/a. |
| RL5 Data and operations summary | NA | none | No history or periods in a prospect valuation. The handoff table plays this part (what was received, when, what was edited). |
| RL6 Plots | Failed, fixed | 002, 019 | Volume and value expectation curves, chance factor bars; the sensitivity figure states why it is absent; conditional figures say why. Screen and PDF share the series builder. |
| RL7 Basis named | Failed, fixed | 006, 008 | Percentile convention, success case against risked, recoverable against in place, oil equivalent and the gas conversion, the engine and assumptions behind a sent value per barrel. |
| RL8 Strengths kept, honest status | Pass after fixes | 001 | Swanson cross-check and break-even Pg kept. H8 holds. Editing identification or a source note does not move a result; editing an input marks the valuation unsaved. |
| RL9 Limits printed | Failed, fixed | 002, 016 | "Limits of this analysis" and the flags on the prospect. |
| RL10 Import doors | NA | none | No file import. |
| RL11 Intake has a sender, provenance travels | Failed, fixed | 004, 005, 012 | Source record, time, unit, basis, convention, methods; survives a reload; edits marked; a change upstream said, with Refresh. |
| RL12 One model | Failed, fixed | 001, 002 | Report tab rows are the PDF rows; the saved row is the valuation itself and reads back to the same state. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Pg | Chance of a discovery of any size (geological success) | The handed-over Pg, or the product of the chance factors | Yes |
| P90 / P50 / P10 | Exceedance percentiles of the success case (PRMS) | Entered values; the lognormal passes through P90 and P10 | Yes; now printed with the convention |
| Success-case mean | Mean of the unrisked distribution | Lognormal mean; Swanson beside it | Yes |
| Risked mean | Pg x success-case mean | Same | Yes |
| MEFS | Smallest recoverable volume worth developing | An input; P(V >= MEFS) from the lognormal | Yes; flagged when it loses money at the stated value per barrel (016) |
| Pc | Pg x P(V >= MEFS) | Same | Yes |
| EMV | Chance-weighted value of outcomes after the well | Pg [u E(V; V >= MEFS) - D P(V >= MEFS)] - W | Yes; parts and outcomes now shown |
| Break-even Pg | Pg at which EMV = 0 | W over the value of a discovery | Yes |
| Volume unit | Oil equivalent when gas is converted | MMboe, labelled "MMbbl" before | Fixed (006) |
| Risked percentiles | Read from the risked expectation curve | Not shown before; zero when Pg is at or below the probability | Added |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Fix and proving test |
|---|---|---|---|---|
| RRV-U1-001 | S2 | RL12, PL5, PL4 | Valuations lived in one browser (`rrv.prospects.v1`): not on another device, not shareable, lost with the browser data. | One row per prospect and user in `rrv_valuations` (migration file below), a Save button with an honest state, the browser as fallback and draft, a visible note while the table is absent, and the move across on the first save. `rrvU1Workstation` "where a valuation is saved" (6), `rrvU1Store` "saved state" (6), e2e "saved state". |
| RRV-U1-002 | S2 | RL1 to RL9, PL7 | No report. The CSV was the only output. | The Risked Prospect Valuation Report on the Report Kit, with a Report tab that shows the same rows. `rrvU1Report` (22), golden, chain e2e. |
| RRV-U1-003 | S2 | PL11, PL4 | A cleared Pg was read as zero and valued (EMV = minus the well cost, no warning); a cleared MEFS or cost likewise. | A blank is named ("Enter Pg..."), never valued; typed text stays the user's while the field has focus. `rrvU1Store` "a blank is never read as zero" (negative control: the engine alone gives -W), workstation and e2e typing tests. |
| RRV-U1-004 | S2 | RL11 | The handoff kept Pg and three volumes. The source record, its time, unit, basis, percentile convention and methods were dropped, so nothing could be cited after the import. | A `handoff` block kept with the valuation and printed; edits marked with what was sent. `rrvU1Store` "what ReservoirCalc Pro handed over", report RL11 tests, e2e "handoff". |
| RRV-U1-005 | S2 | RL11, PL9 | A prospect risked again upstream went unnoticed: an in-place edit was skipped on import, and a re-added prospect came in as a second row with the same name beside the stale valuation. | The source record is read again by id on load and on Import; the row says what moved and offers Refresh, which keeps this app's inputs and follows a re-added record. `upstreamState`, `refreshFromRcp` tests; workstation "risked again" (3); e2e. |
| RRV-U1-006 | S3 | PL1, RL7 | Volumes converted to oil equivalent were labelled MMbbl on screen and in the CSV. | MMboe everywhere; the gas conversion stated. Report RL7 lexicon (`not.toMatch(/MMbbl/)`), CSV test. |
| RRV-U1-007 | S3 | RL1, PL4 | Default economics (MEFS 10, 8 $/bbl, 100, 25) were applied to every prospect and looked like inputs. | `touched` per input; an untouched default prints "Assumed: the starting default of ..." and raises a flag. Report RL1 and RL9 tests. |
| RRV-U1-008 | S3 | RL3, RL7 | The CSV left out the commercial case, the basis, the source and every convention. | Provenance header lines and seven more columns. `rrvU1Store` "the CSV says what it is" (3), e2e. |
| RRV-U1-009 | S3 | PL3 | No unit choice; the Suite unit profile was ignored. | `useAppUnits('rrv')`; values convert at the door, state in one system, the report and CSV follow. Unit anchors; workstation and e2e unit tests. |
| RRV-U1-010 | S3 | RL2 | The chance factors behind Pg were not carried. | `pgFactors` kept, printed as rows, a closing table and a bar figure; a Pg typed over them is said. Report RL2 tests. |
| RRV-U1-011 | S3 | PL6 | The Y axis title sat on the tick labels; at 390 wide the portfolio sentence was cut inside the scrolling table. | Chart margins and label placement; the portfolio line is its own wrapping row. e2e geometry assertion at three widths. |
| RRV-U1-012 | S3 | RL11 | A ReservoirCalc Pro prospect row named no project, reservoir or run (the first need of the "Re-run prospect" follow-up). | `inputs.source` written by Prospect Risking (project, reservoir, method, run time, seed, iterations, signature, in-place volumes, recovery factor, whether the volumes were edited). `rlRecheckReport` RL11 (3), chain e2e reads "seed 777" in the PDF. |
| RRV-U1-013 | S3 | PL9 | Valuations were in no `.pld` family (nothing was saved). | `rrv_valuations` in the geoscience family after `rcp_prospects`; linked to its prospect through the import. `rrvValuationFamily` (3). |
| RRV-U1-014 | S3 | PL5 | Import used the inventory as read when the page opened: a prospect risked in another tab was not found. | Import reads the inventory again. Workstation "two tabs", chain e2e. |
| RRV-U1-015 | S3 | PL8 | Remove was immediate with no way back. | Undo in the status bar restores the valuation as unsaved. Workstation "remove and undo". |
| RRV-U1-016 | S3 | RL9 | The starting defaults contradict each other: a 10 MMboe discovery at 8 $/boe with a 100 $MM development loses 20 $MM, yet 10 is the MEFS. | The report flags an MEFS below the size that pays. The defaults are left as they are (owner question 2). Report RL9 test. |
| RRV-U1-017 | S3 | Contract | Record sharing was not adopted. | Share for viewing on a saved valuation; "Shared with me" read-only, outside the portfolio, with Save a copy. Workstation "sharing". |
| RRV-U1-018 | S4 | PL12 | The help guide said everything is kept in this browser and gave volumes in MMbbl. | Guide rewritten for saving, sharing, the handoff, units and the report. Help guide suites. |
| RRV-U1-019 | S3 | RL6, PL8 | No sensitivity analysis: a committee asks what moves the EMV. | Open: U2-003. The report states the figure is absent and why. |
| RRV-U1-020 | S4 | PL5 | The harness seeded prospects with no unit or basis, so every walk showed the legacy warning. | Modern seeds; the legacy row is a fixture behind `?legacy=1`. |
| RRV-U1-021 | S4 | PL6 | At 390 wide the prospect table scrolls sideways inside its card. | Kept (the T1 decision): eight numeric inputs do not fit a phone. The page itself does not scroll. |
| RRV-U1-022 | S3 | PL8, RL11 | "Re-run prospect": the valuation can now refresh from a changed prospect, but cannot open ReservoirCalc Pro on the source project and run and re-run it. | Open: U2-006. The source block (012) is the first of the three needs. |
| RRV-U1-023 | S3 | RL7 | A typed value per barrel carries no discount rate, price deck or reference date; only a value sent by ReservoirCalc Pro prints its assumptions. | Partly fixed (the sent case prints engine and assumptions; a typed one prints its stated source and note). Open: U2-001. |

Totals: 23 findings. Fixed 19 (5 S2, 12 S3, 2 S4), partly fixed 1 (023),
open 2 (019, 022: both S3, Step 2), kept 1 (021). No S1. No S2 open.

### Persona walks (PL8)

**1. Exploration geoscientist from GeoX or RoseRA.** Risks the prospect in
ReservoirCalc Pro and opens the valuation. *Before:* Pg and volumes arrived
bare; a re-risk was missed. *Now:* the row cites the record and its time, the
factors are on the report, a re-risk is announced. Would now: shared and
local chance between prospects of one play (U2-004), several zones or
segments of one prospect aggregated (U2-005), a tornado on the EMV (U2-003).

**2. Commercial analyst.** Types the MEFS, value per barrel and costs.
*Before:* defaults looked like inputs; clearing Pg gave a number. *Now:*
assumptions are named and flagged; blanks are refused. Would now: the value
per barrel and the MEFS from a development case in the Petroleum Economics
Studio (U2-001, U2-002), value as a function of field size (U2-002).

**3. Exploration manager reading the report.** *Before:* a CSV. *Now:* a
six-page report with identification, sources, the chance of success, the EMV
in parts, plots and limits. Would now: a ranked portfolio page with
dependence between prospects (U2-007).

## The report

`services/rrvReportModel.js` builds one model; `RrvReportPanel.jsx` shows it
and `services/rrvReportExport.js` prints it through `createReport`.

1. Header: company, prospect, licence or block, play, analyst, analysis type, volumes from, volume basis, valuation saved (where and when), build, display units, generated time.
2. Headline results with the basis of each line.
3. Inputs, with unit and source: in-place volumes and recovery factor (recorded for the reader), success-case P90, P50, P10, each chance factor, Pg, MEFS, value per barrel, development cost, well cost.
4. Handoff from ReservoirCalc Pro: source record and id, record time, build, received time, unit sent and conversion, basis, percentile convention, how Pg was made, volumes method, project and reservoir, the Monte Carlo run, the economics sent, what was edited here, and the state of the source record now.
5. Chance of success: factors, product, Pg used, with the closing line.
6. Volumes: entered, fitted unrisked and risked P90, P50, P10 and mean; Swanson; mean if commercial.
7. Expected monetary value in its three terms, with the formula.
8. Outcomes of the well: dry, below the MEFS, commercial; chances to 100%, values to the EMV.
9. Portfolio context, when the analyst has other valued prospects, with the independence caveat.
10. Limits of this analysis, then the flags on this prospect.
11. Plots: expectation curve of volume (unrisked and risked, MEFS and percentiles marked), expectation curve of value (zero and EMV marked), chance factor bars, and the sensitivity figure as a one-line statement.

Sample: `/root/rrv-report-sample.pdf`, produced by the chain e2e
(`e2e/risked-reserves-upgrade.spec.js`, first test) through the Report tab's
Download button on the final code.

## The saved valuation

- Migration file `supabase/migrations/20261002151500_rrv_valuations.sql`, NOT APPLIED. Owner command, from the Suite primary checkout: `supabase db query --linked -f supabase/migrations/20261002151500_rrv_valuations.sql`.
- One new product table under the rules of `20261002100000`: the same sharing columns, the shared guard and log triggers, the four policies word for word those of `rcp_prospects` (checked in the scratch run), a row in `suite_record_tables`, anon and PUBLIC revoked, the storage-lesson check at apply time.
- Beyond the approved shape: one additive SELECT policy on `suite_record_changes` (`suite_record_changes_select_rrv`) so a reader of a valuation reads its history, as section 7 of `20261002100000` does for its tables. `rcp_prospect_id` is deliberately not a foreign key.
- Scratch Postgres (`tools/validation/rrv-valuations/run.sh`): 43 checks, pentest 83 of 83, three negative controls fail as they should.
- Linked database, 2026-10-02: one always-raising DO statement (grepped: no begin, commit or rollback line), `RRV-VALUATIONS PENTEST PASS (83 of 83 checks passed)`, rolled back by its own exception; read back: no table, no registration, no policy, no log row.
- Before it is applied the app asks the database, keeps valuations in the browser and says so; after, the first Save moves them.

## Kit additions (shared Report Kit)

- `src/lib/reportKit/bars.js`: a bar chart figure panel (`kind: 'bars'`), counted in the file by the test kit (`plotMarks().bars`, `expectFigureDrawn`).
- `plot.js`: `row` on a reference line label, so neighbouring labels do not overprint.
- Well Test goldens byte-identical before and after, and after the merge of main (Fluid Systems U1, which added `limits` and the completeness guard; both kept).

## What in the gap matrix was wrong or missing (4.12 and 4.14)

- 4.12 RL11 "a prospect re-risked in ReservoirCalc Pro is skipped on re-import": half right. An in-place edit is skipped; but Prospect Risking never edits in place, it adds a row, and that row was imported as a duplicate beside the stale valuation.
- 4.12 missed the S2 input defect (a cleared Pg valued as zero), the contradictory defaults (016) and the chart defect (jsdom cannot see it).
- 4.14 RL1: the deterministic PDF did not print area and gross thickness at all for the Simple method (the result did not echo them); the matrix recorded only missing units and sources.
- 4.14 RL6 and RL11 were confirmed as written. H8 and H9 hold.
- Section 5: the Reservoir sharing migration is applied on the live database (18 registered tables read on 2026-10-02), so the "no" in the record sharing column is now a matter of each app adopting the bar.

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources (public product pages and articles, read 2026-10-02; no manuals):
[GeoX play and prospect assessment](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/geox/geox-software-play-and-prospect-assessment),
[GeoX value assessment](https://www.software.slb.com/products/geox/geox-software-value-assessment),
[REP, LogiCom E&P](https://www.logicomep.com/products/rep/),
[RoseRA](https://www.roseassoc.com/software-oil-gas-prospect-play-portfolio/rose-risk-analysis-rosera/),
[PlanRA](https://www.roseassoc.com/planra/),
[Understanding the MEFS concept and aggregating targets, GeoExpro](https://geoexpro.com/understanding-the-minimum-economic-field-size-concept-and-aggregating-targets/).

| Capability | Leader and how | Ours | Gap |
|---|---|---|---|
| Play against prospect chance | GeoX: shared play risk assessed apart from local prospect risk. PlanRA: a group's Shared Chance and each prospect's conditional Local Chance, per chance component | One Pg, the product of independent factors | Missing |
| Dependent prospects | GeoX: risk dependencies and volume correlations between segments and prospects. PlanRA: degree of shared dependence per component | Independent only, said on screen and in the report | Missing |
| Multi-zone or multi-segment prospect | RoseRA: zones, fault blocks and wells with chance dependency, aggregated to the prospect. GeoX: segments | One distribution per prospect | Missing (ReservoirCalc Pro U2-003) |
| Portfolio roll-up | GeoX: probabilistic aggregation, hub and concession clusters. PlanRA: aggregate resources, value and chance | Sum of risked means and EMVs; chance of at least one | Partial (no distribution of the total, no dependence) |
| Economic threshold | REP: an economic minimum gives a chance of economic success on top of technical success | MEFS and Pc | Parity; MEFS is typed and not tied to the economics (016) |
| Value | GeoX: full-cycle value models mirroring the subsurface risks and uncertainties, after-tax | One NPV per barrel and one development cost | Partial (no value by field size, no fiscal terms here) |
| Sensitivity | REP and RoseRA: tornado and reality checks | Break-even Pg only | Missing |
| Report and audit | All: printable assessments | Report with sources, handoff and limits | Parity or ahead on provenance |
| Integration | GeoX database links value to resource assessments | Prospect read by id from ReservoirCalc Pro, change noticed, `.pld` | Parity in principle; no return link to the source run (022) |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Dependent prospects in the portfolio | T1, STATUS | Still wanted (U2-004, U2-007) |
| Value per barrel by field size from economics runs | T1, STATUS, plan row 4 | Still wanted (U2-001, U2-002) |
| "Re-run prospect" | RCP owner item 3 | First need built (012); the rest is U2-006 |
| ReservoirCalc Pro U2-003 segments with dependencies | RCP doc | Still wanted; belongs upstream (U2-005) |
| ReservoirCalc Pro U2-010 play and prospect chance | RCP doc | Still wanted (U2-004) |
| ReservoirCalc Pro U2-016 portfolio Monte Carlo | RCP doc | Still wanted (U2-007); uses the canonical `src/lib/monteCarlo.js` |
| ReservoirCalc Pro U2-014 sharing | RCP doc | Done upstream; adopted here (017) |

### 2c. Suite integration

Reads: `rcp_prospects` (own and shared, by id), the unit profile, the
organisation name. Writes: `rrv_valuations`. `.pld`: geoscience family.

| Finding | Kind | Detail |
|---|---|---|
| Earth Modeling to ReservoirCalc Pro to here | chain holds | The model's prospect contract reaches ReservoirCalc Pro (U2-004); its provenance is in the project, and the prospect now names the project and run (012). The model id itself is not in the prospect's source block: add it when U2-006 is built. |
| Petroleum Economics Studio | upstream missing | No sender. A development case there should publish NPV per barrel, the MEFS implied (the smallest size with NPV at or above zero), discount rate, price deck and date. Canonical NPV only. |
| Basin and Charge | upstream consumed | The charge record reaches the report through the handoff (`bfCharge`). |
| Capital Portfolio Studio / decision apps | downstream missing | A valued prospect (Pc, EMV, well cost) could be offered as a project to the portfolio apps. |
| Return link to ReservoirCalc Pro | missing | A valuation cannot open its source project and run (022). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Value per barrel and development cost from a Petroleum Economics Studio case: a sender there, an intake here with engine, discount rate, price deck and date as provenance | M | Closes the one input a reviewer cannot trace; the NAPE chain ends in economics | A |
| 2 | U2-002 | MEFS derived from the same case (smallest size with NPV at or above zero), shown beside a typed MEFS; value per barrel by field size (three sizes, interpolated) | M | Removes the contradiction of 016 and the "one value for every size" limit | A |
| 3 | U2-003 | EMV sensitivity: a tornado of the inputs over stated low and high cases, on screen and as Figure 4 | S | The committee's "what moves it"; the kit already draws bars | A |
| 4 | U2-006 | "Re-run prospect": deep link into ReservoirCalc Pro on the source project and reservoir, re-run with the recorded seed, update the prospect; a link back from the valuation row | M | Completes the handoff both ways | A |
| 5 | U2-004 | Play and prospect chance: group prospects into a play with shared chance per component and conditional local chance; chance of at least one and expected discoveries follow | M | GeoX and PlanRA risking structure; with ReservoirCalc Pro U2-010 | B |
| 6 | U2-007 | Portfolio roll-up as a distribution: aggregate risked volumes and value with the canonical Monte Carlo, shared chance from U2-004, P90, P50, P10 of the campaign; a portfolio page in the report | L | Aggregation parity; needs U2-004; with ReservoirCalc Pro U2-016 | B |
| 7 | U2-008 | Rank and compare: sort by EMV, Pc, EMV per well dollar; a ranked table in the report | S | The manager's page | B |
| 8 | U2-009 | Send a valued prospect to Capital Portfolio Studio as a candidate project | M | Downstream use of the EMV | B |
| 9 | U2-005 | Multi-zone and multi-segment prospects aggregated with dependence (upstream, ReservoirCalc Pro U2-003), received here as one distribution with its components | L | RoseRA and GeoX segment handling | C |
| 10 | U2-010 | Colleagues can edit a shared valuation (check-out), beyond view sharing | S | Team review of one valuation | C |
| 11 | U2-011 | Success-case distribution from the upstream run itself (percentile table) in place of the lognormal fit, when the run is available | M | Removes the lognormal limit for skewed or bimodal cases | C |
| 12 | U2-012 | Appraisal cost and a staged decision (drill, appraise, develop) | L | Decision tree beyond one well | C |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001, U2-002, U2-003, U2-006.
- **Batch B:** U2-004, U2-007, U2-008, U2-009.
- **Batch C:** U2-005, U2-010, U2-011, U2-012.

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Apply `20261002151500_rrv_valuations.sql`? It is the approved shape plus one additive reader policy on the change log. | Apply after a read of the file; no second engineer needed (no rule of its own, no shared table). The lead verifies and flips MIGRATIONS.md. |
| 2 | The starting defaults contradict each other (016). Change them? | Leave the numbers, keep the flag, and replace the default MEFS with the derived one when U2-002 is built. |
| 3 | Should colleagues be able to edit a shared valuation, or view only? | View only for now (U2-010 in Batch C). A committee reviews; the analyst edits. |
| 4 | Batch A needs a sender in the Petroleum Economics Studio (an Economics app). Build it in this round or in the Economics round? | In this round, as a small sender on the canonical NPV, because it closes the NAPE chain. |
| 5 | Play-level chance (U2-004) changes how Pg is entered in ReservoirCalc Pro. Before or after NAPE? | After NAPE. |
| 6 | Will a reviewer read the sample report before NAPE? | Yes if available: `/root/rrv-report-sample.pdf` with the RL checklist as the form. |
