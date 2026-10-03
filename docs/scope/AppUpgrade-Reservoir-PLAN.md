# Comprehensive app upgrade: the Reservoir round

Plan of record, 2026-10-02. The second module of the app upgrade programme,
after Geoscience (`docs/scope/AppUpgrade-Geoscience-PLAN.md`, all 12 apps
done and live at 8234bdc8c).

Owner instruction, 2026-10-02: "As we go into Reservoir module, I want you
to consider the feedbacks that have been provided in Reservoir module,
especially the last one on Well Test Analysis Studio. Think through similar
issues that may be applicable to other Reservoir apps as you move into
Step 0."

Companion docs:
- `docs/scope/AppUpgrade-BestPractices.md`: the practitioner lens PL1 to
  PL12, and its annex, the reviewer lens.
- `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`: the reviewer lens
  RL1 to RL12, from the Reservoir feedback.
- `docs/scope/AppUpgrade-Reservoir-GapMatrix.md`: the 13 live apps graded
  against it, with evidence.

## 1. What the audit found, in five lines

1. Eleven of the thirteen live Reservoir apps have no report. The two that
   have one are Well Test (repaired on 2026-10-02) and Material Balance
   (two pages of tables, no plot, no PVT, no aquifer inputs).
2. No app except Well Test can state where an input came from, because no
   app stores a source.
3. Fluid Systems Studio feeds PVT to six other apps. Its handoff reaches
   two of them, keeps correlation names in one, and is lost on a page
   refresh. Four consumers recompute PVT themselves with Standing and
   Beggs-Robinson fixed in code.
4. One app of thirteen follows the Suite unit profile. None uses record
   sharing. Three save nothing to the database.
5. Thirteen small honesty defects turned up on the way (gap matrix,
   section 6): a sync button that sends nothing, a decline rate shown on two
   bases 365 times apart, a report that can print an old run beside new
   inputs.

The engines hold up. As in Geoscience, what fails is everything around the
engine, and in Reservoir the weight is on the report.

## 2. The steps

The Geoscience round had two steps per app. Reservoir adds a Step 0 for the
module, done once, before the first app.

### Step 0: module foundations

Five pieces. 0a to 0d are shared code that every app round then uses; 0e is
a sweep of small defects that should not wait.

**0a. Platform contracts in every Reservoir app.** The contracts were built
during Geoscience and reached one Reservoir app. State today is in the gap
matrix, section 5.

| Contract | What "adopted" means | Work |
|---|---|---|
| Suite unit profile (`src/lib/units`) | A new project opens in the profile's system (`useProfileSystem`, as Well Test does); a saved project keeps its own; every input and import door states or offers its unit; every export prints in the display unit; state stays in one system | 12 apps. The registry already has pressure, liquid and gas rate, oil and gas FVF, viscosity, compressibility, GOR and permeability. Add what Reservoir needs and it lacks: decline rate with its time unit, gas FVF in RB/Mscf, productivity and injectivity index, capillary pressure and IFT. One PR for the registry, then adoption inside each app's Step 1 |
| Record sharing (`src/lib/recordSharing`) | The project picker lists own records, then "Shared with me"; view or edit one at a time with the check-out bar and history | The store and the bar are generic. Each table needs the sharing columns of migration `20261002100000`. One migration file for the Reservoir tables: `saved_fluid_studio_projects`, `saved_scal_projects`, `saved_dca_projects`, `saved_scenario_hub_projects`, `saved_well_test_projects`, `saved_waterflood_design_projects`, `saved_vrr_projects`, `saved_rf_projects`, `rb_cases` (children follow the case), `sim_cases`. File only; the owner applies it. Until then the bar shows its "not switched on" note, as it did in Geoscience |
| Well datum (`src/lib/wellDatum.js`) | A depth names its reference, and a well picked from the registry brings its datum | Well Test (has it for the registry proposal; add gauge depth), Simulation (replace its own "KB to datum" field), SCAL (FWL in TVDSS), Material Balance (contacts and the pressure datum), EOR Screening and Recovery Factor (label only) |
| e2e in CI | An `<app>-upgrade.spec.js` beside the existing T1 spec, on the `/dev` harness, in the six CI shards | Every app has a T1 spec and a harness today. The upgrade spec adds the report read-back, the hostile imports and three viewports |
| Route protection | Route wrapped in `ProtectedAppRoute` with an Active slug | Done for all 13 (PR #828). Step 1 only re-checks, and adds any new help or sub-route to the guard test |
| Saved state and `.pld` | The project saves to a table, is stamped with `stateVersion`, and travels in `.pld` | `rb_*` has no `.pld` family and no migrations in the repo. EOR Screening and Well Spacing save nothing. Risked Reserves saves to the browser. See owner questions 3 to 5 |

**0b. The shared report kit.** Extracted from the Well Test report so that
no app writes a report from scratch again. It is being built now on branch
`feat/report-kit`; this plan sets what it must hold:

| Piece | From | Contract |
|---|---|---|
| Header block | `buildReportHeader`, `buildIdentificationRows` | Label and value pairs in two columns; company, field, licence, well or reservoir, zone, interval, data dates, analysis type, analyst, display units, build, generated time; `n/a` for a blank |
| Inputs table | `buildInputsTable`, `sourceText`, `inputsFootnote` | Rows of name, value, unit, source and quality; a footnote that says which inputs entered the calculation |
| Summary tables | `flowSummaryHead` and `flowSummaryBody`, `buildCrossCheckRows`, the skin components table | Generic titled table with a caption line; a components table that asserts its own closure |
| Figures | `pdfPlot.js` (`drawPlot`), `reportFigures.js` | Vector plots on the house chart standard: linear, log and semilog axes, series, fitted lines, shaded and named windows, annotations, the Petrolord mark; a figure list where each entry is drawn or replaced by its "does not apply" line; an export with no figure entries throws |
| Limits block | new | "Limits of this analysis": method assumptions, correlation ranges, flags on out-of-range inputs |
| Page furniture | `wellTestReportExport.js` | Title, running footer with report name and "Page x of y", Latin-1 text (`pdfText`), full number formatting |
| Read-back test kit | `reportTestKit.jsx` | `readPdf` (pages, text per page, images, ink per box), `chartLogo`, a provider mount helper, and ready-made assertions: header fields, every input row has unit and source, figure captions and ink, status words |
| Completeness guard | new | A helper that takes the engine input object and the inputs model and fails when a key has no row (RL1) |

Acceptance for 0b: the Well Test report is rebuilt on the kit and
`wellTestReportR2.test.jsx` and `e2e/well-test-report-r2.spec.js` pass
without edits to their assertions. Then the Material Balance report moves
onto the kit as the second user, inside its own app round.

**0c. Input provenance and the PVT contract.**

*Input provenance model.* One small library and one component, lifted from
the Well Test "Input sources and quality" section:

```
inputMeta[key] = {
  source: 'lab' | 'correlation' | 'offset' | 'assumed' | 'handoff' | 'entered',
  method: '',        // the correlation or the lab test, when there is one
  note: '',          // free text: report number, offset well name
  from: null | { app, recordId, recordName, at, build },   // a handoff
  edited: false      // true when the value changed after the handoff
}
```

It lives in the project jsonb (no migration), opens as "Entered, source not
stated" on an old project, and is what the kit's inputs table prints. A
default the user never touched is `assumed` with the default named.

*PVT provenance contract* (`pvt-1`), published by Fluid Systems Studio:

| Field | Why |
|---|---|
| `schema: 'pvt-1'`, `source_app`, `project_id`, `project_name`, `generated_at`, `app_build` | The receiver can cite and re-open the source |
| `units` for every column, and standard and separator conditions | Bg is rb/scf on screen and rb/Mscf in one CSV today |
| `methods`: bubble point, Rs, Bo, co, dead, live and undersaturated oil viscosity, Z, gas viscosity, Bg, Bw, water viscosity, each with its correlation name; or the EOS name, C7+ scheme and viscosity model | Today only `pb_rs_bo` and `viscosity` travel |
| `basis`: flash or differential; `pb_source`: solved, typed or lab | A reviewer asks this first |
| `tuning`: none, or what was matched to which lab data, with the error after tuning | Dropped today |
| `range_flags`: each input outside its correlation's published range | On screen only today |
| the table itself | as now |

Delivery changes with it. Navigate state is lost on refresh, so a consumer
also reads the saved Fluid Systems project by id (the way four apps already
pull `saved_scal_projects`), and stores the contract block in its own
project. The receivers, in order: Well Test (exists; extend), Material
Balance (replace the hardcoded prefill), Simulation (carry it into deck
comment lines), VRR Monitor (pressure track), Waterflood Design (viscosities
and FVFs), then Nodal and Line Sizing outside this module.

A matching `kr-1` contract for SCAL Studio (model, end points, exponents,
fitted or entered, sample, lab or analog, drainage or imbibition, time) is
written in the SCAL round with the same shape.

**0d. The Step 1 lens for Reservoir** is PL1 to PL12 plus RL1 to RL12. One
Check column, both prefixes.

**0e. Honesty sweep.** The thirteen defects H1 to H13 of the gap matrix,
fixed in one PR with a failing-first test each. H7 (the Well Spacing NPV)
changes numbers and is listed under owner questions.

Exit for Step 0: the units registry PR, the sharing migration file, the kit
with Well Test on it, the provenance library and the `pvt-1` writer in Fluid
Systems Studio are merged and green; H1 to H13 are closed or carried by
name.

### Step 1: the two lenses, per app

As in Geoscience. Read the app's STATUS, T1 report, memory and its row of
the gap matrix first. Run PL1 to PL12 and RL1 to RL12. Defects are fixed and
merged on green, each with a test that fails without the fix. An app with
no report gets one here, on the kit: Step 1 is not done while RL1, RL4 or
RL6 is F.

Exit: every check has a recorded result; S1 and S2 findings fixed; the
report is read back in jest and in the e2e; the hostile file set, a saved
project fixture and the chain e2e exist; the unit profile and record sharing
are adopted.

### Step 2: advancement review, per app

Unchanged from Geoscience: 2a competitor parity from public documentation,
2b the deferred backlog, 2c Suite integration, merged into one ranked
backlog sized S, M, L. The programme lead chooses the batches under the
standing authority of 2026-09-28 and records the choice in the app's
upgrade doc.

One working doc per app, `docs/upgrade/<App>-UPGRADE.md`, finding IDs
`<APP>-U1-<nnn>` and `<APP>-U2-<nnn>`, branches `feat/<app>-u1` and
`feat/<app>-u2`.

## 3. Upgrade order

Principles, in priority order:

1. **Upstream first.** Fluid Systems feeds PVT to most of the module, so
   its provenance contract comes before any consumer's report can state a
   source.
2. **What a NAPE visitor opens** (early November 2026). An exploration and
   development audience opens prospects and their risked value, then
   material balance and decline analysis.
3. **Severity of the gaps found.** A report that exists and misleads ranks
   above a report that is missing.
4. **Shared code together.** DCA with Forecast Scenario Hub (one engine);
   Waterflood with VRR (one family of engines, one FVF question).

| # | App | Size | Why here | Benchmarks for 2a | Known inputs to Step 2 |
|---|---|---|---|---|---|
| 1 | **Fluid Systems Studio** | M (4.0k) | Source of PVT for six apps; the `pvt-1` contract is the keystone of the module. Worst gaps: no report, no identification, handoff drops names | PVTsim, Petex PVTP, Multiflash, whitson+ | Lab PVT report import; CVD; SRK; C7+ splitting; tuned-parameter uncertainty shown; lab against model plot |
| 2 | **Material Balance Studio** | L (9.1k) | Module flagship; has the one other report, built on the old pattern; the stale-run risk; first consumer of `pvt-1` | Petex MBAL, IHS Harmony | Fetkovich delta-p convention (paused, needs a sourced example); `rb_*` migrations and `.pld`; excluded timesteps in the UI; `aquifer_params` ignores unknown keys; EPE forecast handoff; `gas_cap_ratio_m` has no direct writer |
| 3 | **Decline Curve Analysis**, with **Forecast Scenario Hub** | M (5.2k + 0.6k) | Opened in every demo; no report; Di on two bases; a fake handoff. The hub shares the engine and needs the DCA sender | IHS Harmony, ARIES, PHDwin, whitson+ | Segmented fitting; rate against cumulative plot; Monte Carlo sample curves; unmounted legacy panels; modified hyperbolic; real handoff to economics |
| 4 | **Risked Reserves Valuation**, with the **ReservoirCalc Pro** RL re-check | S (0.5k) + re-check | The end of the prospect chain shown at NAPE; economics live in one browser; small | GeoX, REP, Rose and Associates | Dependent prospects; value per barrel from Petroleum Economics Studio; "Re-run prospect"; ReservoirCalc Pro U2-003, -010, -016 |
| 5 | **SCAL Studio** | S-M (2.0k) | Source of kr and Pc for five apps; the `kr-1` contract; before its consumers | Petrel RE SCAL, CYDAR, Sendra | Gas-oil export; SWOF and SGOF keywords; sample pedigree; hysteresis and three-phase are out by the owner's "thin-real" lock; Poston and Poe and the Leverett scan await owner PDFs |
| 6 | **Waterflood Design Studio** | M (3.5k) | Consumes kr and PVT; Hall plot defects; surveillance import | OFM, Sahara, tNavigator waterflood tools | Patterns beyond five-spot; Hall and Chan windows; PVT intake; Monte Carlo results saved |
| 7 | **Voidage Replacement Monitor** | S-M (2.2k) | Same FVF question as Waterflood; best importer in the module, least to fix there | OFM, Sahara, IHS Harmony | Ledger export; bubble maps; CRM allocation; link to Waterflood Surveillance and Material Balance pressure |
| 8 | **Reservoir Simulation Studio** | M (3.4k) | Consumes everything above; its report needs worker changes (material balance and convergence from the PRT file) | Petrel RE with Eclipse, tNavigator, CMG | Saved builder forms; WBHPH pressure matching; `sim_runs.active_cells`; failed runs lose exit code; corner-point grids; realisation batches (quota decision) |
| 9 | **Well Test Analysis Studio** | L (8.6k) | Two human rounds already; on the kit since Step 0; residual RL gaps are small. Full Step 1 and Step 2 here | KAPPA Saphir, PanSystem, whitson+ | Lab PVT table input; limited-entry model; deviated-well partial penetration; variable wellbore storage; Blasingame type curves; published check of Papatzacos |
| 10 | **Recovery Factor Estimator** | S (1.1k) | Screening tool; needs a one-page report and honest defaults | analog databases, TORIS-style screening | Multi-zone cases; analog benchmarking; RF handoff to ReservoirCalc Pro or the hub |
| 11 | **EOR Screening** | S (0.8k) | Sound on screen; needs saving, identification and a report | EORgui, published screening tools | Composition criteria screened; newer criteria sets beside Taber 1997 |
| 12 | **Well Spacing Optimizer** | S (1.5k) | Lowest exposure; its NPV must move to the canonical module | IHS Harmony, whitson+ spacing | Interference model; intake from DCA and Recovery Factor; no STATUS doc exists |

**Alternative considered: Risked Reserves first**, for NAPE. We did not
choose it as the default because its fix is small and does not depend on
Step 0c, so it can run in parallel with Fluid Systems as soon as the kit
lands. If the owner wants the prospect chain closed first, swap 4 to 1 and
leave the rest unchanged.

**Pipelining**, as in Geoscience: the next app's Step 1 runs while the
current app's Step 2 builds, at most two upgrade agents at once.

## 4. Cross-cutting items found while ranking

| Item | Owner app |
|---|---|
| PVT recomputed with fixed correlations in Material Balance, Simulation, VRR and Nodal | Fluid Systems (`pvt-1`), then each consumer |
| kr source dropped on arrival in Waterflood; Simulation has no SCAL intake | SCAL (`kr-1`), Waterflood, Simulation |
| No pressure datum anywhere in the module | Well Test, Material Balance, VRR (owner question 6) |
| Comma decimals and day-first dates misread by four importers | One shared parser in `src/lib/tabularFile.js`, adopted by Well Test, Material Balance, DCA, Waterflood, VRR, SCAL, Simulation |
| DCA holds Di per day; the hub and Well Spacing take percent per year | DCA (the sender states the basis) |
| `rb_*` tables have no migrations in the repo and no `.pld` family | Material Balance |
| Three apps save nothing to the database | Risked Reserves, EOR Screening, Well Spacing |
| A private NPV loop | Well Spacing |
| Missing-value text is '-', 'N/A' or blank in most apps | Every app, through the kit and `EMPTY_VALUE` |
| The reviewer lens applies to Nodal, Pore Pressure, Petrophysics and Economics reports | Their module rounds |

## 5. Constraints

- **NAPE (early November 2026).** Nothing here may break the demo-core apps
  before the freeze tag `nape-2026-demo`. Upgrade branches merge only when
  every check on the PR is green (jest shards, build, vendored-engines
  guard, six Playwright shards).
- Engine math validates against published references before promotion. A
  gate calls the engine and has a negative control.
- Engines PRs are opened by the app agent and merged by the programme lead
  after review. Until then the Suite vendors byte-identical with ledger
  rows in `packages/engines/VENDOR.json`.
- No new Monte Carlo or NPV implementations. `src/lib/monteCarlo.js` and
  `calculateEconomics` are the canonical modules.
- Shared tables keep the second-engineer rule. New and changed tables are
  migration files, staging first, logged in `MIGRATIONS.md`.
- `vrr.js` stays byte-stable (course oracle); new VRR math goes beside it.
- Copy: no em dashes and no "X, not Y" contrastives. Charts: white
  chartTheme and ChartLogo. Missing values: `EMPTY_VALUE`.

## 6. Load and CI rules

- The studio box has 4 CPUs and is shared. jest runs with `--runInBand
  --testTimeout=120000`; one production build at a time (check with
  `pgrep -f "^node .*vite build"`); Playwright with one worker; at most two
  upgrade agents at once.
- Each agent works in its own worktree with a private Vite server and its
  own `cacheDir`. `node_modules` is a symlink: no new dependencies, and it
  is never staged. Stage by path.
- Commit and push after every item. Sessions restart often; after a restart
  an agent is resumed only when its worktree has been quiet for 20 minutes
  and it has no live process.
- CI is the reference result. Run `src/__tests__` (the Suite-wide guards)
  before asking for a merge, as well as the app's own suites.
- A new e2e spec opens on the Suite unit profile (signed out: feet and
  degF) and seeds a metric view with `e2e/helpers/unitView.js` when its
  oracle is SI.
- No lingering monitors. Each agent reports once.

## 7. What stays owner-run

- Applying any migration to production (the sharing columns, any new
  table, the `rb_*` backfill).
- Deploying Edge Functions (`calculate-mbal`) and the simulation worker.
- Cutting and uploading the production zip, then the cache purge.
- Merging when the classifier blocks a merge.
- Shared-table changes, with the second engineer.
- Supplying paywalled references (Poston and Poe, the Papatzacos paper, a
  sourced Fetkovich example).

## 8. Progress

| # | App | Step 1 | Step 2 | Batches merged | Upgrade doc |
|---|---|---|---|---|---|
| 0 | Module foundations (0a to 0e) | planned 2026-10-02; report kit in progress on `feat/report-kit` | | | this plan |
| 1 | Fluid Systems Studio | Done 2026-10-02 on `feat/fluid-u1` (PR open, not merged): 30 findings, 21 fixed (6 S2, no S1), the report on the kit, the `pvt-1` writer with Well Test as first reader, units, record sharing, the P-T door on the shared reader; three engine corrections (entered bubble point, Bo above Pb, separator totals) | Analysis done: 23 items ranked; built 2026-10-03 on `feat/fluid-u2` (PR open): Batch A all eight, the table-top item the lead added, Batch B salinity in Bw, lab QC and registry identification; engines PR #299 (unmerged) | U1 merged (#859); U2 open | `docs/upgrade/FluidSystemsStudio-UPGRADE.md` |
| 2 | Material Balance Studio | Done 2026-10-02 on `feat/mbal-u1` (PR open, not merged): 29 findings, 25 fixed, 4 open (1 S1 fixed; 8 S2, of which 7 fixed and the missing injection term stated and open); the report rebuilt on the kit; the stale rule on a run snapshot; units; the import door on the shared reader; the `pvt-1` intake; `.pld` family; record sharing for viewing. Engine math unchanged; `calculate-mbal` deploy owed | Built 2026-10-03 on `feat/mbal-u2` (engines PR #300): Batch A all five (injection in the balance, engine PVT coverage warning, excluded timesteps, colleague editing, `mbal-1` sender to ReservoirCalc Pro) plus an S1 found on the way (Boi at the bubble point); Batch B all three (ReservoirCalc Pro volumetric intake, VRR pressure rows, one-page summary); C deferred with reasons. `calculate-mbal` deploy owed after merge | | `docs/upgrade/MaterialBalanceStudio-UPGRADE.md` |
| 3 | Decline Curve Analysis, Forecast Scenario Hub | Done 2026-10-03 on `feat/dca-u1` (PR open, not merged): 38 findings (28 DCA, 10 hub), 34 fixed, 4 open; 5 S2 fixed (fits per project shown on every well, a monthly volume column read as a daily rate, the group roll-up EUR and rate, the facility limit ignored, no report), no S1; the report on the kit; the `dca-forecast-1` sender read by id into Forecast Scenario Hub and Petroleum Economics Studio; one 365.25-day year in DCA, the hub and Well Spacing; units; the import door on the shared reader; record sharing with check-out in both apps. Engines PR #301 (group roll-up), not merged, vendored with ledger rows | Analysis done: 19 items ranked, batches A, B, C proposed; 6 owner questions. Built 2026-10-03 on `feat/dca-u2` (engines PR #302, unmerged, vendored with ledger rows): Batch A all six (U2-001 modified hyperbolic with a user-set Dmin, validated on CED P03-004; U2-002 rate-cumulative cross-check; U2-004 typed decline basis; U2-008 scenarios in the report; U2-018 hub report on the kit; U2-013 hub to EPE keeps its source) and Batch B U2-011 downtime and U2-005 batch fit; U2-003, U2-007, U2-006 and Batch C deferred | U1 merged (#868); U2 PR open | `docs/upgrade/DeclineCurveAnalysis-UPGRADE.md` |
| 4 | Risked Reserves Valuation, ReservoirCalc Pro RL re-check | done 2026-10-02 on `feat/rrv-u1`: 23 findings, 19 fixed, no S1, no S2 open; report on the kit; `rrv_valuations` migration file NOT APPLIED (owner-run); ReservoirCalc Pro re-check: 8 of 10 fixed | analysis done 2026-10-02: 12 items, batches A, B, C; 6 owner questions. Built 2026-10-02/03 on `feat/rrv-u2` (PR open, not merged): Batch A all four (U2-002 derived MEFS and value by field size on `calculateEconomics`, the Step 1 contradictory defaults closed; U2-001 value per barrel from a Petroleum Economics Studio run by id, sender `epe-unit-value-1` built there; U2-003 EMV tornado; U2-006 "Re-run prospect" into ReservoirCalc Pro and back), Batch B U2-008 ranking; U2-009 and Batch C deferred with reasons | Step 1 merged (#860); Step 2 PR open | `docs/upgrade/RiskedReservesValuation-UPGRADE.md`; `docs/upgrade/ReservoirCalcPro-UPGRADE.md` (RL re-check) |
| 5 | SCAL Studio | | | | `docs/upgrade/SCALStudio-UPGRADE.md` |
| 6 | Waterflood Design Studio | | | | `docs/upgrade/WaterfloodDesignStudio-UPGRADE.md` |
| 7 | Voidage Replacement Monitor | | | | `docs/upgrade/VoidageReplacementMonitor-UPGRADE.md` |
| 8 | Reservoir Simulation Studio | | | | `docs/upgrade/ReservoirSimulationStudio-UPGRADE.md` |
| 9 | Well Test Analysis Studio | two tester rounds done (#810, #852); RL residuals listed | | | `docs/upgrade/WellTestAnalysis-UPGRADE.md` |
| 10 | Recovery Factor Estimator | | | | `docs/upgrade/RecoveryFactorEstimator-UPGRADE.md` |
| 11 | EOR Screening | | | | `docs/upgrade/EorScreening-UPGRADE.md` |
| 12 | Well Spacing Optimizer | | | | `docs/upgrade/WellSpacingOptimizer-UPGRADE.md` |

## 9. Owner questions

Each could not be settled from the repo. The default is what the programme
does if no answer comes.

| # | Question | Recommended default |
|---|---|---|
| 1 | Order: Fluid Systems first, or the NAPE-facing Risked Reserves first? | As in section 3: Fluid Systems first, Risked Reserves in parallel once the kit lands |
| 2 | Record sharing for the ten Reservoir tables needs one migration with the columns and policies of `20261002100000`. Is that covered by the 2026-10-01 approval, and does it need the second engineer? | Covered. Same policy shape, written as a file, dry run and rolled-back pentest on the linked database, owner applies. The second engineer is asked only if a policy differs from the approved shape |
| 3 | Risked Reserves economics live in browser storage. New table, or columns on `rcp_prospects`? | A new product-prefixed table (`rrv_valuations`, one row per prospect and user, owner RLS, sharing columns), file only until applied; browser storage stays as the fallback with a visible note |
| 4 | EOR Screening and Well Spacing save nothing. Give them saved projects? | Yes: `saved_eor_screening_projects` and `saved_well_spacing_projects` through `createSavedProjectsService`, two migration files, in the `.pld` apps family |
| 5 | `rb_*` tables predate the conventions: no migrations in the repo, no `.pld` family. Backfill now? | Yes, in the Material Balance round: a DDL backfill file from the live catalog (the `epe_*` pattern of 2026-08-17) and a `.pld` family. It changes nothing live |
| 6 | Pressure datum. No Reservoir app has one. Add it as a stated input, or also correct pressures to datum? | Step 1: a datum depth and gauge depth as stated inputs, printed in the report, no correction applied and the report says so. Correction to datum with a fluid gradient goes to Step 2 of Well Test and Material Balance |
| 7 | Company on the report header: from where? | The organisation name from the org context, editable per project; operator and licence are typed |
| 8 | Production zips: one per app, or one at the end of the module? When is the NAPE freeze? | One zip when Step 0 and apps 1 to 4 are merged (the NAPE-facing set), a second at the end of the module. Freeze assumed 2026-10-26 unless the owner names a date |
| 9 | Well Spacing: replacing its private NPV with `calculateEconomics` will move its numbers. | Do it in Step 0e, state the before and after on the sample in the PR, and keep year-end discounting labelled |
| 10 | DCA's NPV and FDP "sync" cards send nothing. Remove, or make real? | Remove both in Step 0e. In the DCA round build one real sender to Forecast Scenario Hub and to Petroleum Economics Studio, with the basis and source on the payload |
| 11 | Will the second Well Test tester (or another reviewer) read the Material Balance and DCA reports before NAPE? | Yes if available: sample PDFs go to the owner as soon as each report is on the kit, with the RL checklist as the review form |
| 12 | Simulation report: material balance error and convergence come from the OPM PRT file, which needs a worker change and a worker deploy. | Build it in the Simulation round; the owner deploys the worker; until then the report prints "not reported by this build" |
| 13 | SCAL scope: the owner locked it "thin-real" (Corey and Leverett J). Does the upgrade stay inside that lock? | Yes for Step 1. Step 2 lists what a Petrel RE user would miss and the owner decides |
| 14 | Lab PVT import in Fluid Systems Studio: which lab report formats do customers hold? | Start with a plain table (CSV and xlsx, header-detected, units at the door) for CCE and DL; vendor formats when a customer file arrives |
| 15 | Paywalled references still needed: Papatzacos (SPE-13956-PA), Poston and Poe, a sourced Fetkovich example. | The owner supplies PDFs when convenient. Until then the gates stay as they are and say so |

## 10. Not verified in this plan

- Sizes are line counts of app code without vendored engines; effort is
  judged from them and from the gap matrix, without a spike.
- The competitor lists are starting points for 2a. No competitor
  documentation was read for this plan.
- Whether the record sharing store works unchanged on `rb_cases` (a case
  with child tables) and `sim_cases` (a storage bucket beside the row) is
  not tested. Earth Modeling and Seismolord are the nearest precedents.
- The report kit is specified here from the Well Test code; the kit branch
  was not read.
