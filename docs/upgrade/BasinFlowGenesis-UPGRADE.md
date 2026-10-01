# Basin & Charge Modeling: comprehensive upgrade

App #11 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-10-01 on branch `feat/bf-u1`. Step 2 (advancement review) is
analysis only; batches are chosen before anything is built.

- Route: `/dashboard/apps/geoscience/basinflow-genesis` and its `/help`, both in `ProtectedAppRoute` (verified on main after #828, `src/App.jsx`).
- Harness: `/dev/basinflow-genesis` (in-memory backend seeded with the oracle reference basin). New for this upgrade: a dated, deviated registry well KETA-2 with a lithology log (`REGISTRY_WELLS_DEV`, `REGISTRY_INTERVALS_DEV`), the Send to Basin case.
- Earlier cycles: G7 (07-14, oracle-locked engines), BF0 to BF3 (09-06), T1 (09-26, time axis, windows, events chart), W4C theme (09-28), unit profile (#830). Their fixes hold.
- Carried in: plan row 11 (route protection, `bf_wells` in `.pld`, eroded section on the burial history BF-T1-E3, trap and migration modelling, orphan bf_* tables, v1 limits); Stratigraphy U2 handoff (one model per well updated in place, ICS 2026/06 with chart versions, STRAT-U2-020 decompaction deferred to here); the reviewer-block report of PP-U1-008 and RCP-U1-019; the saved-row realism of PP U1 (live rows read first).
- Engines first: engines PR [#294](https://github.com/Petrolord/petrolord-engines/pull/294) (`fix/basin-present-day`), vendored at its head aeddb4b (guard clean, 1123 paths). **Re-pin to the merge commit once #294 merges** (the tree is identical; only the commit line in `VENDOR.json` and `VENDOR.manifest` changes).

## Live data read first (read-only queries, 2026-10-01)

- `bf_wells` is the only bf_* table: the orphans (`bf_projects`, `bf_team_members`, `bf_activity_log`, `bf_comments`, `bf_versions`, `bf_jobs`, plus `calibration_results`, `expert_mode_settings`) were dropped by `20260714150000_drop_orphan_legacy_tables.sql` (applied 2026-07-14). The STATUS "Q3 pending" line was stale. Recommendation: nothing to drop.
- `bf_wells`: 4 rows, 3 users, last edit 2026-09-01; none from Stratigraphy, none with scenarios. RLS on, one policy (`auth.uid() = user_id`, all commands, no WITH CHECK clause: the USING clause applies to inserts). Recommendation: add the standard 4-policy split with WITH CHECK and a rolled-back pentest when the table is next touched (no DDL here).
- `location_coords` is a Postgres `point`. `select '{"x":1,"y":2}'::point` fails with 22P02: every Send to Basin of a well with coordinates was refused (BF-U1-004).
- One live layer is labelled shale but carries the sandstone preset (k 3.5, phi0 0.49, c 0.00027) written out by the pre-G7 layer factory; every live layer has the ages 10 to 0 Ma (BF-U1-011, -014).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Engine (PL1) | engines `__tests__/basin.test.js` (2 new), oracle anchor A13, `fractional_age_basin` goldens | The schedule ends at 0 with a short last step; a 150.5 Ma basin with a 0.3 Ma layer matches the oracle; the existing goldens regenerate byte-identical |
| Services and doors (PL1 to PL5, PL9) | `src/pages/apps/BasinFlowGenesis/__tests__/upgradeU1.test.js` (16) | ICS column end to end, batch equals single run, hostile calibration headers, the live stale-preset row, the input key, model notes, coverage and fit bound, NaN inputs, the point literal, the KETA-2 registry build, chart flags, the re-send merge |
| App state and screens (PL4, PL5, PL8, PL11) | `__tests__/upgradeU1Ui.test.jsx` (5) | Saved scenarios loaded and kept, a switch drops the result, a guided run is a new model run from its own inputs (and no stray default model), source rock and properties edited in Expert mode, age boxes clear and retype, no misfit without a run, the stale-result note |
| Report (PL7) | `__tests__/upgradeU1Report.test.js` (3, node, real jsPDF, pdftotext) | Reviewer block, inputs, the golden present-day source row in ft and F, Latin-1 only; no run, no calibration and unknown erosion said |
| Chain (PL9) | `src/lib/portability/__tests__/bfModelFamily.test.js` (2) | A basin model package brings its tied well; on import the tie and each layer's provenance point at the new well |
| Scale (PL10) | `__tests__/upgradeU1Scale.test.js` (1) | 60 layers over 300 Ma: 301 steps, about 20 s at load 7 on the 4-CPU box, on the main thread |

Negative controls: the new suites were copied onto a clean origin/main worktree and run there (results in the table "Negative controls" below). The engine tests fail 2 of 2 against the old loop.

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed (1 S1) | 001, 024, 025 | Quantity table below. "Present day" was the state at the basal age's fraction. |
| PL2 Hostile inputs | Failed, fixed | 010, 017 | TVD and TOC columns read as temperature; degF and ft in headers ignored; negative depths accepted. |
| PL3 Units, datums, frames | Pass after fixes | 009, 010 | Unit profile (#830) verified: depth and temperature follow the profile (`useAppUnits('basin')`), the units bar is a session view. Heat flow mW/m2, conductivity W/(m K), compaction per km, radiogenic microW/m3 now shown at the layer. Registry thicknesses are TVD. |
| PL4 No claim without the event | Failed, fixed | 003, 012, 013, 014 | A result from another model or other inputs was shown as current; misfit 0.000 in green with no run; "Calibrated" with no run; unknown erosion skipped silently; a fit on the search bound called a fit. |
| PL5 Real saved state | Failed, fixed (S2) | 002, 011, 022 | Saved scenarios wiped on every open; earlier-release presets on the wrong lithology; scenarios lacked erosion and settings. |
| PL6 Real browser | Pass, with the e2e red on load | 020 | Depth downward, time oldest left (T1), white chartTheme and ChartLogo on every plot; PNG export had a navy margin. The Basin e2e failed at this load on "harness not visible in 5 s" (environmental, see Test results). |
| PL7 Report a reviewer can sign | Failed, fixed | 016 | Old app name, "Untitled", no inputs or reviewer block, charts claimed and never drawn, a crash with no run. |
| PL8 Practitioner's day | Failed, fixed (S2) and gaps recorded | 006, 007, 023, 026 to 030 | Persona walks below. |
| PL9 The chain | Failed, fixed (S2) | 004, 005, 009, 015, 021 | Send to Basin refused by the table; a re-send erased the modeller's work; the registry door ignored dates, log and survey; chart versions did not travel; `bf_wells` not in `.pld`. |
| PL10 Real scale | Gap recorded | 031 | 60 layers over 300 Ma run about 20 s on the main thread at load 7 (the reference basin under 1 s). |
| PL11 Inputs a person can type | Failed, fixed | 017 | Ages snapped to 0 when cleared; a cleared thickness stored NaN and ran. Now the shared NumText. |
| PL12 House standards | Pass after fixes | 019, 032 | Route protected (#828). "N/A" now `EMPTY_VALUE`; copy plain; a stray default model on a slow first load. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Burial depth | Depth of a layer below the surface at each age, decompacted | Athy porosity phi0 e^(-cz), solid thickness conserved, Newton decompaction (Sclater and Christie 1980 constants) | Yes; elastic (no maximum-burial memory, 025, documented v1) |
| Present day | The state at 0 Ma | The state at the last step, which was the basal age's fraction (0.5 Ma for 145.5 Ma) | **Fixed (001)** |
| Temperature | Conductive geotherm with radiogenic heat | Implicit 1D conduction, cells up to 100 m, geometric-mean conductivity, steady start | Yes |
| Heat flow | Basal mW/m2 | Constant or piecewise-linear history, mW/m2 | Yes |
| Vitrinite reflectance | Easy%Ro, Sweeney and Burnham 1990: A 1e13/s, E 34 to 72 kcal/mol, %Ro = exp(-1.6 + 3.7F) | The same, at each layer centre | Yes; one value per layer (024) |
| Transformation ratio | Converted fraction of the kerogen potential | Parallel Arrhenius reactions per kerogen type | Yes |
| Generation, expulsion | kg HC per m2 | rho_grain Hs TOC/100 HI/1000 TR; retention bucket S 0.1 | Yes (v1 bucket) |
| Maturity windows | Oil 0.55 to 1.3, wet gas 1.3 to 2.0, dry gas above 2.0 %Ro | The same (T1) | Yes |
| Erosion | Removed thickness at an age | A shale phantom deposited at the youngest pre-event end age, removed at the event | Yes; an amount of 0 is skipped (014, said now) |
| Ages and chart | Ages on a named chart | Ages as numbers; chart version dropped at the door | **Fixed (015)** |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| BF-U1-001 | S1 | PL1, PL9 | A basal age not on a whole step (every ICS column Stratigraphy sends: 145.5, 201.4, 251.902 Ma) stopped the run at the fraction: "present day" was 0.5 Ma and a layer younger than the fraction (the Holocene) never deposited; every layer sat shallower and cooler (base Ro 0.885 against 0.903). | Probe; engines test (control fails 2 of 2). | Fixed engines-first (#294): `timeSchedule` ends at 0 with a short last step; oracle anchor A13. |
| BF-U1-002 | S2 | PL5 | Saved scenarios were never loaded, and the auto-save after opening wrote [] over them; a switch wrote the previous model's scenarios into the next. Opening also reset "Calibrated" to "In progress". | UI test (control fails). | Fixed: the switch loads the model's scenarios; the auto-save changes the status only on an edit. |
| BF-U1-003 | S2 | PL4 | A switch kept the previous model's result: well B showed well A's plots, present-day table and calibration misfit. | UI test (control fails). | Fixed: a model load drops the result. |
| BF-U1-004 | S2 | PL9 | Send to Basin wrote `location_coords` as `{x, y}`; the column is a point and refuses it (live cast), so the handoff failed for any well with coordinates. | Live probe; test. | Fixed: point literal `(x,y)`. |
| BF-U1-005 | S2 | PL9 | A re-send replaced the layers wholesale: the source rock flag, TOC, HI, kerogen, layer properties and every erosion thickness typed in Basin were lost, while the status said what the modeller set was kept. | Test. | Fixed: `mergeBasinUpdate` keeps them by layer name and erosion surface; the status counts what was kept. |
| BF-U1-006 | S2 | PL8 | Expert mode could not mark a source rock or edit TOC, HI, kerogen, conductivity or compaction: a model from Stratigraphy or tops could never generate; only the guided wizard set a source. | Walk; UI test. | Fixed: layer details on each card (units as published, library reset). |
| BF-U1-007 | S2 | PL4, PL5 | A guided run replaced the active model (one sent from Stratigraphy included) or was lost when Expert mode opened the first model under the guided result; and it computed the previous model (stale closure). | UI test (control fails). | Fixed: a new model is saved and made active; the run takes its own inputs. |
| BF-U1-008 | S2 | PL1 | Batch runs dropped the erosion events and the surface temperature: batch Ro differed from the same model's run. | Test. | Fixed. |
| BF-U1-009 | S2 | PL9 | Basin's own registry door built layers from MD differences with placeholder ages and a name-guessed lithology, while the well carried a survey, dated tops and a lithology log (Send to Basin used them). | Test on KETA-2. | Fixed: one build (`buildBasinModelRow`); `listWellsWithTops` returns `age_ma` and `hiatus_to_ma`. |
| BF-U1-010 | S2 | PL2 | Calibration headers matched by prefix: a TVD or TOC column was read as temperature; "BHT (degF)" was read as C and "Depth (ft)" as the picker's unit; negative depths accepted. | Test. | Fixed: headers read as words with their units; the preview says what it read. |
| BF-U1-011 | S2 | PL5 | Layers saved by earlier releases carry another lithology's preset as explicit values (live: a shale with the sandstone k, phi0, c); the engine modelled them as sandstone with nothing shown. | Live row; test. | Fixed: a note per layer and a "Use library" button; no silent rewrite. |
| BF-U1-012 | S3 | PL4 | A result stayed on screen as current after any input changed. | UI test. | Fixed: results carry the input key; a note says when they are out of date or belong to another model. |
| BF-U1-013 | S3 | PL4 | Calibration: misfit 0.000 in green with no run; "Calibrated" saved with no run or with one kind of point missing; points outside the modelled centres extrapolated silently; a fit on the search bound reported as fitted. | UI test, test. | Fixed. |
| BF-U1-014 | S3 | PL4 | Erosion events from Stratigraphy (amount unknown, 0) were skipped by the engine with nothing said; layers sharing one deposition interval (all live rows) deposited at one instant, warned only in a toast. | Test. | Fixed: model notes above results and in the report. |
| BF-U1-015 | S3 | PL9 | Ages arrived without their chart version: Basin could not flag a 2023/09 age that ICS 2026/06 moved (J/K 145.0 to 143.1). | Test. | Fixed: per-layer `provenance.age_charts`, `settings.timescale`; flags with the new value; a model sent before says so. |
| BF-U1-016 | S3 | PL7 | Report: retired app name, "Untitled", no reviewer block or inputs, "with plots" and none, a crash with no run; the calibration PDF printed the well uuid. | Report test. | Fixed: `services/report.js`, Field and Analyst in the export dialog. |
| BF-U1-017 | S3 | PL11, PL2 | Age boxes snapped to 0 when cleared; a cleared thickness stored NaN, passed validation and ran to NaN. | UI test, test. | Fixed: NumText; validation refuses non-numbers. |
| BF-U1-018 | S3 | PL6 | Plots and the CSV key series by layer name: two layers with one name draw as one. | Code read. | Partly fixed: a note asks to rename; keying by id open (U2-012). |
| BF-U1-019 | S3 | PL12 | Opening Expert mode before the saved list arrived created a stray "Exploration Well 1". | UI test. | Fixed. |
| BF-U1-020 | S4 | PL6 | PNG export drew the white charts on a navy margin, with no header. | Code read. | Background fixed; header open (U2-011). |
| BF-U1-021 | S3 | PL9 | `bf_wells` was in no `.pld` family (plan cross-cutting item). | Test. | Fixed: `bf_model` root, backup kind, export dialog section; the tied well comes along and is remapped. |
| BF-U1-022 | S3 | PL5 | Scenarios saved stratigraphy and heat flow only; loading one mixed its layers with the current erosion. | Code read. | Fixed: erosion and settings saved and restored (older scenarios keep the current ones; the result note says the result has no input record). |
| BF-U1-023 | S3 | PL8 | Templates and tops imports replace the active model's layers with no undo. | Walk. | Open: U2-010. |
| BF-U1-024 | S3 | PL1, PL8 | Kinetics at each layer centre only: a 1,500 m layer has one Ro, and calibration interpolates linearly between centres. | Code read. | Open: U2-004. |
| BF-U1-025 | S3 | PL1 | Elastic compaction: an unroofed layer re-expands (documented v1). | STATUS. | Open: U2-005. |
| BF-U1-026 | S3 | PL6, PL8 | The eroded section is not drawn on the burial history (BF-T1-E3). | T1. | Open: U2-001. |
| BF-U1-027 | S3 | PL8 | No trap, migration or accumulation (1D); the events chart says so. | Plan row 11. | Open: U2-014 (map-based charge). |
| BF-U1-028 | S3 | PL8 | Measured BHTs are compared raw; no Horner or other correction. | Walk. | Open: U2-006. |
| BF-U1-029 | S3 | PL8, PL9 | No pore pressure or overpressure in Basin (G7 Q4); Pore Pressure Studio owns the prognosis and the two do not exchange. | Code read. | Open: U2-015. |
| BF-U1-030 | S4 | PL8 | Scenario manager claims "compare" and has none. | Walk. | Open: U2-008. |
| BF-U1-031 | S3 | PL10 | 60 layers over 300 Ma: about 20 s at load 7 on the main thread (the page freezes); no worker or cancel. | Scale test. | Open: U2-009. |
| BF-U1-032 | S4 | PL12 | "N/A" for a missing location. | Code read. | Fixed: `EMPTY_VALUE`. |

Totals: 32 findings. Fixed 23 (1 S1, 10 S2, 10 S3, 2 S4: 001 to 017, 019, 021, 022, 032, and 020 in part), partly fixed 1 (018), open 8 (023 to 029, 031 S3; 030 S4). No S1 or S2 open.

### Negative controls

The new jest suites copied onto a clean origin/main worktree (`/root/wt-upg-bf-negctl`):

| Suite | On origin/main |
|---|---|
| engines `basin.test.js` A13 (engine reverted) | 2 of 2 fail |
| `upgradeU1.test.js` (with the new pure `honesty.js` copied in) | does not load: the doors it calls (`pointLiteral`, `mergeBasinUpdate`, the KETA-2 fixture) do not exist; the engine probe (001), the live point cast (004) and the KETA-1 registry build (009) are the numeric controls |
| `upgradeU1Ui.test.jsx` 002/003, 007/019, 006 | 3 of 3 fail (scenarios not loaded; a stray default model and the guided run on the active model; no layer details) |
| `upgradeU1Report.test.js` | does not load (no `services/report.js`) |
| `bfModelFamily.test.js` | 2 of 2 fail (no `bf_model` root) |

### The Stratigraphy chain (PL9)

Stratigraphy Send to Basin and Basin's registry door now run one build (`buildBasinModelRow`): vertical thicknesses through the survey (STRAT-U1-008), ages from the dated surfaces, lithology from the log, every hiatus an erosion event with the amount to type (said in the model notes until typed), the chart of each age in the layer provenance and the model's `settings.timescale`. A re-send updates the model in place and keeps the source rock, the layer properties and typed erosion amounts. STRAT-U2-020 (decompaction in Stratigraphy): Basin owns burial history; Stratigraphy's accumulation rates are compacted rates, and a decompacted rate view belongs in Stratigraphy reading Basin's engine (U2-016).

Pore Pressure: Basin has no pore pressure model, so there is no overlap with Pore Pressure Studio today; a compaction-disequilibrium pressure from Basin's burial history is a Step 2 item (U2-015). Petrophysics and WDM: the registry door reads WDM wells, tops (with ages) and lithology intervals; logs are not read (a 1D basin model has no log consumer; porosity calibration would be U2-007).

### Persona walks (PL8)

**1. PetroMod basin modeller.** Builds a column from Stratigraphy (*before:* refused by the table for a well with coordinates, then a re-send erased the source rock; *now:* the model opens dated, TVD, typed, with the erosion surfaces asking for thickness). Marks the source (*before:* impossible in Expert mode; *now:* layer details with TOC, HI, kerogen). Calibrates to Ro and BHT (*before:* "BHT (degF)" read as C; *now:* converted and said; a fit on the bound says so). Would now: the eroded section on the burial plot (U2-001), Ro along the whole column (U2-004), maximum-burial compaction (U2-005), corrected BHTs (U2-006), a 1D overpressure (U2-015), lithology mixing and editable kinetics (U2-013), a multiwell or map view (U2-014).

**2. Exploration geologist.** Reads the events chart and the critical moment, then the report (*before:* "BasinFlow Genesis Report, Untitled", no inputs; *now:* the reviewer block, inputs, present day and notes). Would now: the burial and events plots in the PDF (U2-011), a scenario comparison (U2-008), risked charge volumes into ReservoirCalc Pro (U2-017).

**3. Graduate.** Runs the guided wizard (*before:* overwrote the active model or vanished; *now:* a new model). Would now: a worked example tied to the help guide (U2-018).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: [PetroMod product sheet](https://www.software.slb.com/-/media/software-media-items/software/documents/external/product-sheets/12_is_0393_petromod_summ_ps_updated.pdf), [PetroMod 3D product sheet](https://www.software.slb.com/-/media/software-media-items/software/documents/external/product-sheets/petromod_3d_ps.pdf), [ZetaWare products](https://www.zetaware.com/products/) and [Trinity brochure](https://zetaware.com/products/zetaware.pdf), [KinEx](http://www.zetaware.com/support/kinex/index.html), [Platte River BasinMod (AAPG IBA)](https://iba.aapg.org/Software/Platte-River-Associates), [Beicip TemisFlow](https://www.beicip.com/software/temisflow/) and its [technical specifications](https://www.beicip.com/wp-content/uploads/2025/12/TechnicalSpecifications_TemisFlow.pdf). Rows rest on these public descriptions, not manuals.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Dimensions | PetroMod and TemisFlow 1D, 2D, 3D on one simulator; Trinity map-based 3D | 1D per model, several models | missing 2D/3D | yes |
| Burial and compaction | Mechanical compaction with maximum-burial memory, overpressure coupling | Athy elastic | partial | yes |
| Erosion | Eroded section drawn and restored | Phantom section modelled, not drawn | partial | yes |
| Thermal | Lithosphere-scale heat flow (Genesis), transient basement, BHT correction | Basal heat flow history, sediment-only column, raw BHT | partial | yes |
| Maturity | Easy%Ro and newer (Easy%RoDL, Basin%Ro), Ro through the whole column | Easy%Ro per layer centre | partial | yes |
| Kinetics | Kinetics libraries, compositional (KinEx 40+ parameters, GOR) | 3 kerogen types, bulk TR | partial | yes |
| Pressure | 1D/2D/3D pore pressure from compaction disequilibrium | none | missing | yes |
| Migration and traps | Darcy, flow path, invasion percolation; PVT phases; accumulations (PetroMod, Trinity, TemisFlow) | none (said on the events chart) | missing | yes |
| Calibration | Ro, BHT, pressure; automated optimisation | Ro and BHT, golden-section heat-flow fit with bound and coverage stated (now) | partial | yes |
| Uncertainty | Scenario and Monte Carlo risking of charge | Sweeps of one parameter | partial | yes |
| Report | Plots and tables for the prospect file | Reviewer PDF (now), no plots | partial | yes |
| Integration | PetroMod in Petrel; TemisFlow with restoration | Stratigraphy, WDM registry, `.pld` (now) | ahead in chain | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Max-burial hysteresis | STATUS v1 limits | Still wanted (U2-005) |
| dt = 1 Ma | STATUS v1 limits | Kept; the last step now lands on 0 (001); sub-step for young thin layers in U2-004 |
| Eroded section on the burial plot | BF-T1-E3 | Still wanted (U2-001, A) |
| Trap and migration | Plan row 11, STATUS | Still wanted, L (U2-014) |
| Orphan bf_* tables | STATUS Q3 | Done 2026-07-14 (verified live); STATUS corrected |
| bf_wells RLS pentest | STATUS | Still wanted (U2-019, owner and 2nd engineer) |
| Seismic-velocity pore pressure (Q4) | STATUS | Folded into U2-015 |
| Lithology mixing in the wizard | ROADMAP | Still wanted (U2-013) |
| STRAT-U2-020 decompaction | Stratigraphy U2 | U2-016 (Stratigraphy view on Basin's engine) |

### 2c. Suite integration

Reads: geo_wells (survey, KB, TD, coordinates), geo_wells_tops (ages, hiatus, type), geo_wells_intervals (lithology), the unit profile. Writes: bf_wells. Deep links: Well data, Open in, help. `.pld`: bf_model (now).

| Finding | Kind | Detail |
|---|---|---|
| Pore Pressure Studio | downstream ignored | Basin's burial and compaction give a compaction-disequilibrium pressure and an NCT; Pore Pressure could read Basin's normal trend (U2-015) |
| Petrophysics | upstream ignored | Log porosity calibrates the compaction curve; TOC from logs (Passey) to source layers (U2-007) |
| Stratigraphy | two-way | Decompacted rates (U2-016); the chart flags send the user back to accept updates |
| ReservoirCalc Pro, Risked Reserves | downstream | The charge Pg factor and charge volume from Basin (U2-017) |
| Seismolord, Mapping | upstream | Depth surfaces for a multi-1D map of maturity (U2-014) |
| Wellsite Studio | upstream | Measured temperatures and mud-log gas as calibration (after #12) |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Eroded (phantom) section drawn on the burial history, engines-first (results report phantoms) | S | The PetroMod picture with the uplift | A |
| 2 | U2-011 | Burial, maturity and events plots in the PDF (vector, house standard); PNG with a header | M | A report that shows the answer | A |
| 3 | U2-004 | Ro and temperature through the column (sub-layer cells), Ro-depth profile on the calibration plot | M | Calibrate a thick section honestly | A |
| 4 | U2-006 | BHT correction (Horner, AAPG) with the raw and corrected values listed | S | The calibration modellers trust | A |
| 5 | U2-008 | Scenario comparison: two to four scenarios side by side (present-day Ro, critical moment, plots) | S | What-if at a glance | A |
| 6 | U2-012 | Plots and CSV keyed by layer id (BF-U1-018) | S | No silent merge of same-named layers | A |
| 7 | U2-010 | Undo for template and tops replacement; confirm with the model name | S | No destructive surprise | A |
| 8 | U2-009 | Run in a worker with progress and cancel | M | Big columns without a frozen page | B |
| 9 | U2-005 | Maximum-burial (irreversible) compaction, engines-first with an oracle anchor | M | Unroofed basins right | B |
| 10 | U2-015 | 1D compaction-disequilibrium pore pressure and its handoff to Pore Pressure Studio | M | The pressure question modellers ask | B |
| 11 | U2-013 | Kinetics editor (Pepper and Corvi organofacies) and lithology mixing | M | Source rock parity | B |
| 12 | U2-007 | Petrophysics porosity and TOC as calibration and source inputs | M | Use the logs already loaded | B |
| 13 | U2-016 | Decompacted accumulation rates in Stratigraphy (STRAT-U2-020) on Basin's engine | S | One decompaction in the Suite | B |
| 14 | U2-018 | Worked example model and help walk | S | Learnability | B |
| 15 | U2-017 | Charge Pg and volume to ReservoirCalc Pro and Risked Reserves | M | Charge risk from the model | C |
| 16 | U2-014 | Multi-1D maps (maturity at a horizon from Mapping surfaces), then flow-path charge | L | Trinity-style map view | C |
| 17 | U2-002 | Lithosphere heat-flow model (rifting, McKenzie beta) | M | Heat flow away from wells | C |
| 18 | U2-019 | bf_wells 4-policy RLS with WITH CHECK, org sharing, pentest (migration, owner and 2nd engineer) | S | Security parity | C |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001, U2-011, U2-004, U2-006, U2-008, U2-012, U2-010.
- **Batch B:** U2-009, U2-005, U2-015, U2-013, U2-007, U2-016, U2-018.
- **Batch C:** U2-017, U2-014, U2-002, U2-019 (schema).

### Owner items

1. Merge engines PR #294 (merge commit), then re-pin the Suite's `VENDOR.json` and `VENDOR.manifest` commit line to the merge commit (same tree).
2. Live `bf_wells`: one layer labelled shale models as sandstone (now flagged in the app, not rewritten); every live model has all layers at 10 to 0 Ma (flagged). No data repair is proposed; the four rows are test models.
3. `bf_wells` RLS: one policy with no WITH CHECK clause; a 4-policy split and pentest is U2-019 (migration, second engineer).
4. Playwright is still not in CI; the Basin e2e could not be confirmed at this load (see Test results in the PR).
5. No migration in this work.

## Batch decision (programme lead, 2026-10-01)

Recorded verbatim:

> BUILD in order, one commit per item:
> - Batch A: U2-001 eroded section drawn on the burial plot (BF-T1-E3); U2-012 plots keyed by layer id; U2-004 Ro through the whole column (validate Easy%Ro against Sweeney and Burnham's published example; negative control); U2-006 BHT correction (Horner or AAPG, validated on a published example); U2-008 scenario compare (make the claim true); U2-010 undo for template and tops replace; U2-011 plots in the PDF report (read back with pdftotext).
> - Batch B: U2-009 long runs in a Web Worker with progress and cancel; U2-016 Stratigraphy decompacted sedimentation rates (STRAT-U2-020: the decompaction stays in Basin's engine; Stratigraphy reads it through a small documented contract; keep Stratigraphy-side edits minimal and run its suites); U2-018 a worked example project; U2-015 1D overpressure handed to Pore Pressure (through Pore Pressure's existing readers and src/lib/ppfgUnits.js; declared units); U2-005 maximum-burial (irreversible) compaction (engines-first, validated); U2-007 Petrophysics porosity and TOC as inputs; U2-013 kinetics and lithology mixing (engines-first, validated against published kinetics).
> - Batch C: U2-017 charge into ReservoirCalc Pro and Risked Reserves (a documented contract; RCP-side edits minimal).
>
> DEFERRED (record reasons): U2-014 multi-1D maps and migration (L, after NAPE); U2-002 lithosphere heat flow; U2-019 bf_wells RLS WITH CHECK (needs a migration and a second engineer: write it up for the owner, do not write the migration here).

Deferred, with reasons:

- **U2-014 multi-1D maps and migration** (L): a map view needs Mapping surfaces sampled into many 1D runs and a flow-path charge model; a week or more, after NAPE.
- **U2-002 lithosphere heat flow** (McKenzie rifting): a new thermal boundary model with its own validation; the basal heat-flow history covers today's wells.
- **U2-019 `bf_wells` RLS**: needs a migration and a second engineer's review; written up for the owner under Owner items (no migration in this PR).

## Step 2 build (branch `feat/bf-u2`)

Engine changes first, in engines PR [#295](https://github.com/Petrolord/petrolord-engines/pull/295) (merged; the Suite pins its merge commit 970c021): every Basin engine addition is in the canonical engines repo with its gate in `__tests__/basin.u2.test.js`, and the Suite vendors the merge commit.

A session restart interrupted the build after U2-001: the programme lead saved the in-progress code of U2-012, -004, -006, -008, -010, -011, -009 and -016 as one commit (`577e7685b`, "wip"). Each item is then closed by its own commit (doc row, help, any remaining code); the rows name the wip commit where the code landed.

| ID | Status | Proving test | Notes |
|---|---|---|---|
| U2-001 | Done | engines `basin.u2.test.js` U2-001 (2); Suite `upgradeU2.test.js` U2-001 (2), `upgradeU2Ui.test.jsx` U2-001 | The engine reports each eroded (phantom) section with its burial history (`meta.phantoms`, `data.phantoms`). The burial plot draws it hatched grey on top of the column from its deposition (the youngest age before the event) until the erosion event, and says it under the title: the reference basin shows 600 m (1,969 ft) deposited at 20 Ma and removed at 10 Ma. A result saved before U2 has no phantoms and draws without one. Closes BF-T1-E3 and BF-U1-026. |
| U2-012 | Done (code in `577e7685b`) | `upgradeU2.test.js` U2-012 | Every per-layer plot (burial, temperature, maturity, transformation, generation and expulsion) and the report table key their series by layer id and label them by name (`layerKey`, `alignSeriesByAge`); two layers named "Shale" are two series. The model note about duplicate names is now informational (the legend and tables repeat the name). The CSV already carried the layer id. Closes BF-U1-018. |
| U2-004 | Done (code in `577e7685b`) | engines `basin.u2.test.js` U2-004 (5: published Easy%Ro parameters and range, isothermal closed form through the engine, one-slice layer equals its centre, thick-layer profile, the fit on the column); Suite `upgradeU2.test.js` U2-004 | The engine tracks vitrinite in slices about 100 m thick through every layer (`data.column`: depth, temperature, Ro, porosity); calibration, the misfit, the report and the heat-flow fit compare against the column (`calibrationProfile`), the layer centres for an older result. The reference basin Base Sand (1,500 m) reads 15 Ro values; a point deep in it now meets its own Ro (control: the layer-centre comparison misses it by more than 0.05 %Ro). Validation: no tabulated worked example from Sweeney and Burnham (1990) could be retrieved (the paper is paywalled); Easy%Ro is checked against the published parameter table and output range (0.20 to 4.69 %Ro), the isothermal closed form through the engine, and the existing independent oracle goldens. Negative control: slice temperature taken at the layer centre fails the profile gate. Closes BF-U1-024. |
| U2-006 | Done (code in `577e7685b`) | engines `basin.u2.test.js` U2-006 (6); Suite `upgradeU2.test.js` U2-006 (4) | Engine `BhtCorrection.js`: Horner (validated on the ZetaWare BHT utility worked example: 10 h circulation, 115 at 8 h and 120 at 12 h give 134.80), AAPG (Kehle et al. 1970 in the Gregory et al. 1980 form, F and ft converted) and Harrison et al. (1983). Calibration tab: a BHT correction card (method, circulation time), shut-in hours and BHT/DST kind per temperature point, the raw and used value of each point, notes when a depth has one run or lies outside a polynomial's data. The misfit, Auto-Fit, CSV (raw and method columns) and report (a "BHT correction:" line) use the corrected values; DST points are never corrected. A calibration file may carry a shut-in column and a kind column. Negative control: the Horner time ratio changed fails the gate. Closes BF-U1-028. |
