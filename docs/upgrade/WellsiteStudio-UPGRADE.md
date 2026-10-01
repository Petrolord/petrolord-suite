# Wellsite Studio: comprehensive upgrade

App #12, the last, of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-10-01 on branch `feat/ws-u1`. Step 2 (advancement review) is
analysis only; batches are chosen before anything is built.

- Route: `/dashboard/apps/geoscience/wellsite-studio` (ProtectedAppRoute, verified in `App.jsx`) and its `/help`.
- Harness: `/dev/wellsite-studio` (the real local database with the fake transport; `?reset`, `?empty`, `?seed=reference`, `?conflict`, `?offline`, `?plant`).
- Earlier cycles: WS0 to WS9 (09-07), floating rigs (09-07), members and Open in (09-23), the five Ekene kit findings (09-23), W4A theme (09-28), unit profile and latest-refresh-wins (#830), CI race fixes (#833). Never T1-tested.
- Carried in: plan row 12 (WITSML/ETP feeds, gas ratios, d-exponent, composite log); PP U2-014 (d-exponent and real time "with Wellsite later") and PP 2c (mud weights, gas, kicks and losses as pore pressure calibration); WDM U2-009 (Wellsite surveys never reach the registry survey); the #433 lesson (definitive-only trajectories); the reviewer-block pattern of RCP-U1-019 and PP-U1-008; the unit profile (#830).
- Verified on main before starting: the unit profile is adopted (`useAppUnits('wellsite', ...)`, the older `ws.units` key no longer beats the profile); latest-refresh-wins (`refreshSeq`) and the offsets chooser guard are in place with `refreshRace.test.jsx`; the two-leg floating-rig lag engine (G5, G6) is vendored; Well Design hole sections reach the prognosis through the shared `getGeometry` resolver.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Service doors (PL1 to PL4, PL9) | `src/pages/apps/WellsiteStudio/__tests__/upgradeU1Services.test.js` (19) | Fractional and comma sizes; KB 0; default entry unit; the sharing pill before any pass; ROP with a held connection; lag volumes against the shipped lag engine (identity: annulus = lag strokes x displacement); a call against its prognosis subsea on a 30 degree leg; publish duplicates; reviewer lines; Well Design sections on a floater |
| Workstation (PL1, PL3, PL4, PL6, PL8) | `__tests__/upgradeU1.test.jsx` (6) on the real local database | A production user (a uuid) named in tops history; subsea call and "28 ft high"; the uncertainty unit; lag volumes, flow and ROP on screen; Config filled from Well Design with "12 1/4" typed; the stacked layout below 900 px |
| Report (PL7) | `__tests__/upgradeU1Report.test.js` (3, node, real jsPDF, pdftotext) | Reviewer lines, depth reference, KB in ft and m, the signer by name, Latin-1 only; the DOCX carries the same lines |
| Saved state and chain (PL5, PL9) | `src/lib/portability/__tests__/wellsiteFamilyRefs.test.js` (4) | A live well with a resolved conflict, an evidence chain, a top_called event and a prognosis through `planImport`: the resolution holds, the chain walks, the prognosis names the imported well |
| Browser (PL6, PL7, PL11) | `e2e/wellsite-upgrade.spec.js` | 1366x768, 1440x900, 820 and 390 wide in light and dark with no sideways scroll and no page errors; the lag panel volumes; the tops table; the PDF downloaded and read with pdftotext |

Negative controls: `wellsiteFamilyRefs` against the family spec on origin/main fails 3 of 4 (the resolved conflict returns as two heads, the evidence chain stops at the call, the prognosis names the old well). `Number('12 1/4')` is NaN (in-test). An MD difference on the 30 degree leg would read 10 m where the vertical difference is 8.66 m (in-test). The old tops history printed the uuid (the test user is a uuid on purpose; the harness id `user-a` was the only one mapped).

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Gaps, fixed | 006, 007, 011, 015 | Quantity table below. Engines unchanged and oracle-locked (lag G1 to G6, pumps, depth). No volume or flow was shown beside the lag strokes; tops were compared in MD only; no ROP. |
| PL2 Hostile inputs | Failed, part fixed | 008, 020 | Sizes typed as "12 1/4", "8-1/2", "17½" or "12,25" were refused. The app has no importer at all (mudlogging CSV or LAS, WITSML): every number is typed (Step 2). |
| PL3 Units, datums and frames | Failed, fixed | 001, 012, 014, 017 | A hand prognosis uncertainty labelled in the display unit was converted in the entry unit (15 m stored as 15 ft). Entry forms started in feet for a metric user. Config lengths were feet only. Reports said "Depths in ft" with no reference. Depth entry itself is sound: unit, reference (MD, TVD, TVDSS) and datum (KB, RT, GL, MSL) are all mandatory and the stored MD, TVD and subsea depth show before saving. |
| PL4 No claim without the event | Failed, fixed | 002, 009, 010, 013, 016 | The sharing pill said "shared" before any sharing pass had run. People appeared as raw user ids. A registry KB of 0 was used silently. The help promised photograph publishing that no screen offered. Overdue samples, conflicts, refused rows and offline counts were checked and are honest. |
| PL5 Real saved state | Failed, fixed | 003 | `.pld`: ids inside rows were not rewritten. Local database: one Dexie version, no migration needed; a rig configuration saved before the floater release reads as a land rig, a pump record with no booster rate as booster off (existing floater gates); the offline queue survives a reload and an app update (`registerType: 'prompt'`, WS6 e2e). |
| PL6 Real browser | Failed, fixed | 004 | Below 1000 px the whole workstation scrolled sideways: a tablet held upright (768 to 834 px) and a phone. Now one stacked column below 900 px. The app draws no charts, so the chart standard and the downward depth axis have nothing to check yet (the composite log is Step 2 and must follow both). |
| PL7 Report a reviewer can sign | Failed, fixed | 009, 014 | Signers printed as uuids; no depth reference, KB, preparer or build on the PDF and DOCX. |
| PL8 Practitioner's day | Gaps recorded | 005, 019, 020, 021, 022, 023 | Persona walks below. |
| PL9 The chain | Failed, part fixed | 003, 005, 013, 018, 024 | Upstream: WDM well, KB, survey and tops load; Well Design hole sections were loaded with the prognosis and then ignored by Config; the planned trajectory came from the definitive design only. Pore Pressure curves are not read (`pressure_curves` is always null). Downstream: Publish adds a second top beside a hand-typed prognosis top of the same name. |
| PL10 Real scale | Pass | | Reference Well (15,000 ft, 2,000 samples, 10,000 observations, 1,500 photos, 500 events): the existing jest and e2e gates hold; the new panel rows add no query. |
| PL11 Inputs a person can type | Pass after fix | 008 | Depth, pump and Config fields keep cleared text; sizes take fractions. |
| PL12 House standards | Pass | | Copy lint and help guard tests hold with the new copy; `n/a` for missing values; route protected. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Lag (strokes) | Annular volume from the bit to surface over the pump output per stroke | `lagStrokesAt`: annulus rows from the hole sections, BHA and drillpipe, over the displacement | Yes; no washout or carbide correction (019) |
| Lag time | Lag strokes over the pump rate, following every rate change | Integrated over the pump log; undefined with the pumps off | Yes |
| Floating rig lag | Two legs: bit to BOP on the main pumps, riser on main plus booster | `lagLegsAt`, `legArrival` (G5, G6) | Yes |
| Pump output | Triplex 0.000243 x D^2 x L x efficiency bbl/stk | Exact geometry, within 0.1% of the field rule | Yes (tested) |
| Annular volume, flow | bbl or m3; bbl/min and gpm, or m3/min and L/min | Not shown before | Added (007) |
| Lagged sample depth | The depth whose cuttings are at surface now | Bisection on the arrival time, bit held through connections and trips | Yes |
| Sample interval | A sample at D represents (D minus interval, D] | Same | Yes |
| ROP | Depth drilled over drilling time | Not computed before; only a typed "ROP change" | Added (011) |
| Total, connection, trip gas | Percent, ppm or API units | Typed value with its unit; "units" is not defined against a calibration | Kept; chromatograph and ratios are Step 2 (021) |
| Lithology percent | Components sum to 100 | Refused outside 100 within 5 | Yes |
| MD, TVD, TVDSS | Along hole; vertical below datum; vertical below MSL, positive down | `toCanonicalMd`, minimum curvature, extrapolated past the last station and said | Yes |
| KB, RT, GL, MSL | Datum elevations above MSL | Shift along the vertical conductor | Yes; a registry KB of 0 is now said (010) |
| Top status | Preliminary, confirmed, revised, withdrawn, final | Version chain, final by an approver only | Yes |
| Call vs prognosis | Subsea difference; high is shallower | MD only before | Added (006) |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| WS-U1-001 | S2 | PL3 | "Add a prognosis top by hand": the uncertainty label showed the display unit, the value was converted in the depth entry's unit. With a metric view on a well whose entries are in feet, 15 m was stored as 15 ft (4.6 m), narrowing the approach window to a third. | `upgradeU1.test.jsx` (label and stored value). | Fixed: label and conversion both use the entry unit beside it. |
| WS-U1-002 | S2 | PL4 | The sharing pill read "shared" whenever nothing was pending, including before any sharing pass had completed (the source read `lastSyncUtc ? 'shared' : 'shared'`). A session whose passes all failed said the same. | `upgradeU1Services` (old text was "shared"). | Fixed: "not shared yet" (and "last try failed") until a pass completes. |
| WS-U1-003 | S2 | PL5, PL9 | `.pld`: every row gets a new id on import, but `resolves_ids`, `evidence_ids`, `chain_id`, the `top_id` of a top_called event, and the prognosis source wells were left as the old ids. A resolved conflict came back as a conflict, the evidence chain of every call stopped at the call, and the offsets chooser started from wells that no longer exist. | `wellsiteFamilyRefs.test.js`; old spec fails 3 of 4. | Fixed: the family spec rewrites them; the signed report model is left as signed. |
| WS-U1-004 | S2 | PL6 | A 1000 px minimum width on a tablet and phone app: at 820 and 390 wide the workstation scrolled sideways, the lag panel off screen. | e2e at 820 and 390; jest with matchMedia. | Fixed: below 900 px the workstation stacks (ribbon, well chooser, view, lag and approach panels, wrapping status bar); pump row wraps. |
| WS-U1-005 | S3 | PL8, PL9 | Well Design's hole sections were loaded with every prognosis and never offered: Config geometry had to be retyped. | Code read; test. | Fixed: "Fill from Well Design" in Config (clipped to the BOP on a floater), for the geologist to check and record. |
| WS-U1-006 | S3 | PL1, PL8 | Tops showed MD only: no subsea depth and no "came in high or low", the two numbers an operations geologist asks for first. | Test (28 ft high for 10 m MD on a 30 degree leg). | Fixed: Call TVDSS and vs prognosis columns (subsea). |
| WS-U1-007 | S3 | PL1 | The lag panel gave strokes and time with no annular volume, pump output or flow, so the geometry could not be checked against the driller's figures. | Test against the engine. | Fixed: annular volume (riser part on a floater), output per stroke, flow now; bbl or m3 from the unit profile. |
| WS-U1-008 | S3 | PL2, PL11 | Config refused "12 1/4", "8-1/2", "17½" and "12,25" with "needs a positive inside diameter". | Test. | Fixed: `parseFieldNumber` on every size and pump field. |
| WS-U1-009 | S2 | PL4, PL7 | People were printed as raw user ids in tops history, the conflict resolver, and the sign-off block of the screen, PDF and DOCX. Only the harness id `user-a` was mapped to a name, so tests and the harness looked right and production did not. | Code (`=== 'user-a'`); test with a uuid user. | Fixed: names from the organisation list (cached per well when online; the short id when unknown offline). |
| WS-U1-010 | S3 | PL4 | A registry well with no KB stores 0, and the live well took it silently: TVDSS then equals TVD below KB. | Test. | Fixed: said at New well and in Config. The value is still the registry's (see 024). |
| WS-U1-011 | S3 | PL1, PL8 | No ROP anywhere although the bit log holds it. | Test (50 ft/hr; a held connection excluded). | Fixed: ROP card on Live from the last interval that made hole, drilling time only. |
| WS-U1-012 | S3 | PL3 | A well with no default entry form started every depth entry in feet, whatever the user's units. | Test. | Fixed: falls back to the display unit. |
| WS-U1-013 | S3 | PL9 | Publish adds a final top beside a hand-typed registry top of the same name (the usual case: prognosis tops typed in WDM). Downstream apps pick tops by name. | Test. | Fixed in part: the publish names them and says the registry now holds two. Marking or replacing is Step 2 (U2-010). |
| WS-U1-014 | S3 | PL7 | PDF and DOCX: "Depths in ft" with no reference, no KB, no operator, preparer or build. | pdftotext. | Fixed: reviewer lines. |
| WS-U1-015 | S4 | PL1 | The approach panel listed offsets subsea beside a prognosis and bit in MD. | Walk. | Fixed: prognosis and bit subsea rows. |
| WS-U1-016 | S3 | PL4 | The help said chosen photographs publish as core images; nothing chose them (`photoIds` was never passed). | Code read. | Fixed: "Photographs to publish" chooser on Tops. |
| WS-U1-017 | S3 | PL3 | Config lengths (sections, BHA, BOP depth) were feet only. | Walk. | Fixed: they follow the depth unit; diameters stay inches. |
| WS-U1-018 | S4 | PL9 | The prognosis read the planned trajectory from the definitive design only (the #433 defect). | Code read. | Fixed: the shared resolver, with its source recorded. The trajectory is stored and not yet used (see 022). |
| WS-U1-019 | S3 | PL1, PL8 | No lag check: a carbide or tracer lag cannot be entered and no washout factor corrects the open hole volume. | Walk. | Open: Step 2 U2-004 (engines-first). |
| WS-U1-020 | S3 | PL2, PL8 | No importer: bit depth, pump rate, gas and drilling parameters are typed one at a time; a mudlogging CSV or LAS export or a WITSML file cannot be read. | Walk. | Open: Step 2 U2-003, U2-011, U2-014. |
| WS-U1-021 | S3 | PL1, PL8 | Gas is one typed number; no C1 to C5, no ratios, "units" uncalibrated; shale density in g/cc only. | Walk. | Open: Step 2 U2-002. |
| WS-U1-022 | S3 | PL3, PL8 | The survey is a snapshot from the registry at well creation. MWD surveys taken while drilling cannot be entered, so TVD past the last station is extrapolated for the rest of the well (it says so). | Code read. | Open: Step 2 U2-005. |
| WS-U1-023 | S3 | PL8 | No depth-based picture of the well (composite or mud log strip). | Walk. | Open: Step 2 U2-001. |
| WS-U1-024 | S3 | PL3, PL9 | KB cannot be corrected in the app and the registry cannot tell "0" from "not entered"; offset wells with no KB compare subsea depths off by their KB. | Code read. | Open: with the WDM datum model (WDM U2-007, a migration). |
| WS-U1-025 | S3 | PL9 | Publish deletes this app's earlier registry tops, then inserts the new ones, one call each: a failure midway leaves the registry without them until the next publish. | Code read. | Open: Step 2 U2-010. |
| WS-U1-026 | S4 | PL7 | Offline, a signer who is not in the cached organisation list prints as "User 7b0c2a52". Names are not stored on the record. | Code read. | Open: Step 2 U2-013 (a column, so a migration). |

Totals: 26 findings. Fixed 18 (5 S2, 11 S3, 2 S4), 013 in part; open 8 (7 S3, 1 S4), all to Step 2. No S1 found; no S2 open.

### Persona walks (PL8)

**1. Wellsite geologist on the rig (tablet, 12 hour tour).** Opens the app on a tablet held upright: *before*, sideways scrolling; *now* one column with the lag panel under the view. Sets up the well: *now* told when the registry KB is 0. Config: *before*, retyped the casing programme and "12 1/4" was refused; *now* fills from Well Design and types sizes as written. Checks the lag against the driller: *now* annular volume, output and flow are shown. Would now: enter the carbide lag and apply a washout (U2-004); enter each MWD survey (U2-005); import the mudlogging unit's export instead of typing (U2-003); record C1 to C5 and read the ratios (U2-002); see the well as a strip log (U2-001).

**2. Operations geologist in the office (approving tops).** Opens Tops: *before*, MD only and uuids in the history; *now* subsea depths, high or low to prognosis, and names. Resolves a conflict, signs the daily report: *now* the PDF says who signed, the depth reference, the KB and the build. Publishes: *now* told when the registry holds two tops of a name. Would now: a morning view across live wells with what awaits approval (U2-007); prognosis and actual kept apart in the registry (U2-010); the pressure prognosis beside the tops (U2-008).

**3. Drilling engineer.** Reads the lag panel and bottoms up: sound, floater included. Looks for ROP: *now* shown. Would now: d-exponent against a trend with the mud weight (U2-006); kicks, losses and mud weights flowing to Pore Pressure as calibration (U2-008); the live feed in place of typing (U2-014).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: [SLB surface logging](https://www.slb.com/products-and-services/innovating-in-oil-and-gas/well-construction/measurements/surface-logging), [SLB FlairFlex fluid logging](https://www.slb.com/products-and-services/innovating-in-oil-and-gas/well-construction/measurements/surface-logging/flairflex-advanced-real-time-fluid-logging-and-analysis-service), [SLB Defining Series: Mud Logging](https://www.slb.com/resource-library/oilfield-review/defining-series/defining-mud-logging), [PetroWiki: formation evaluation during mud logging](https://petrowiki.org/Formation_evaluation_during_mud_logging), [Haworth et al. wetness, balance and character](https://www.scribd.com/document/330257434/Wetness-Balance-and-Character-Haworth-1985), [a WellSight Systems strip log as filed with a regulator](https://ogcc.idaho.gov/wp-content/uploads/2018/01/1101920014_Fed20-3_MASS_MD_20171121_PTS.pdf), [WITSML v2.0 Wellbore Geology](http://docs.energistics.opengroup.org/WITSML/WITSML_TOPICS/WITSML-000-060-0-C-sv2000.html), [WITSML v2.0 Mud Log Report](http://docs.energistics.opengroup.org/WITSML/WITSML_TOPICS/WITSML-000-064-0-C-sv2000.html), [WITSML cuttings geology interval](https://docs.energistics.org/WITSML/WITSML_TOPICS/WITSML-000-061-0-C-sv2000.html). Rows rest on public product pages, the standard's documentation and a published log, not on vendor manuals; the WellSight Gas Advisor and Petrolog rows are from their public descriptions only.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Strip or composite log | WellSight Strip.Log and Mud.Log, Geolog: depth tracks of ROP, lithology, gas, shows, tops, casing, descriptions; print to scale | none | missing (U2-001) | yes |
| Gas and ratios | Gas Advisor, Geoservices: C1 to C5, wetness, balance, character (Haworth), Pixler, fluid type bands | one typed total gas | missing (U2-002) | yes |
| Lag | Mudlogging units: sensor strokes, carbide checks, washout | Strokes from geometry and a typed pump log, two-leg floater lag | partial (no lag check, no sensors); ahead on the floater model being open and tested | yes |
| Data acquisition | WITS, WITSML 1.4.1 and 2.0 over ETP, real time | typed | missing (U2-003 files, U2-011 WITSML files, U2-014 live) | yes |
| Cuttings description | Controlled vocabularies, abbreviations, operator profiles | Controlled vocabulary, profiles, keyboard first, copy previous | parity | yes |
| Shows | Controlled show evaluation | Controlled values, derived quality | parity | no |
| Pressure surveillance | d-exponent, dxc trends, connection gas, cavings | typed observations only | missing (U2-006, U2-015) | yes |
| Tops and prognosis | Tops tables, prognosed against actual | Versioned calls with approval, conflicts, evidence chain, approach panel | ahead on audit trail; partial on registry handling (U2-010) | yes |
| Surveys | Survey tables kept current while drilling | snapshot at creation | missing (U2-005) | yes |
| Reports | Daily geological report, end of well report | Handover and daily on templates, signed and countersigned | parity on daily; end of well report missing (U2-016) | yes |
| Offline and sync | Desktop files copied or emailed | Offline first, automatic sharing, conflict detection | ahead | yes |
| Integration | Export to LAS, WITSML, PDF | Registry publish, `.pld`, Well Design and WDM inputs | ahead in principle; pressure and survey links missing | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Live WITSML or ETP feeds, automatic lag from sensors, automatic event detection | Not in Release 1; plan row 12 | Still wanted: files first (U2-003, U2-011), live feed later (U2-014, needs a gateway) |
| d-exponent and pressure-trend surveillance | Not in Release 1; PP U2-014 | Still wanted: U2-006 (typed or imported parameters), U2-015 (real time, with Pore Pressure) |
| Gas ratios | Not in Release 1; plan row 12 | Still wanted, Batch A (U2-002) |
| Lithology and composite log rendering | Not in Release 1; plan row 12 | Still wanted, Batch A (U2-001) |
| Top scoring; casing, coring and TD recommendations | Not in Release 1 | Still wanted as presented evidence, never a determination (U2-012) |
| Sidewall-core selection, laboratory chain of custody | Not in Release 1 | Still wanted, Batch C (U2-017) |
| AI classification or narratives | Not in Release 1 | Deferred (U2-018); the record must stay the geologist's |
| Approach panel truncates decimals | Ekene kit | Superseded: the panel restates in the display unit (Wave 1B) |
| Mud weights, gas, kicks and losses to Pore Pressure | PP 2c | Still wanted (U2-008) |
| Update the registry survey from Wellsite | WDM U2-009 | Still wanted after U2-005 (U2-009) |
| Owner walks: WS1 validation review, WS6 PWA install, WS9 simulated shift | STATUS | Still open, owner |

### 2c. Suite integration

Reads: geo_wells (name, KB, deviation), geo_wells_tops (own and offset wells), Well Design hole sections and trajectory (through the Drilling resolvers), the unit profile, organization_members. Writes: ws_* (its own tables), geo_wells_tops, geo_wells_intervals (lithology, cuttings), geo_wells_core_images, ws_publications. Deep links: Well Data Manager "Open in" (`?well=`). `.pld`: the `wellsite` family rooted at ws_wells (verified and repaired, WS-U1-003).

| Finding | Kind | Detail |
|---|---|---|
| Pore Pressure Studio | upstream ignored | Published PP, FG and OBG curves (pp-1.x, `src/lib/ppfgUnits.js`) could fill `pressure_curves` of the prognosis and show the expected pore pressure at the bit (U2-008). |
| Pore Pressure Studio | downstream not fed | Mud weight, connection gas, cavings, kicks and losses are the calibration PP asks for (PP U2-002); mud is free text today (U2-008). |
| Well Data Manager | downstream not fed | Surveys entered on the rig never reach `geo_wells.deviation` (WDM U2-009; U2-005 then U2-009). |
| Well Data Manager | handoff loses state | Prognosis and actual tops share a name in the registry (U2-010); KB 0 against not entered (WS-U1-024). |
| Well Correlation, Stratigraphy, Petrophysics | downstream partly used | They read the published tops and lithology intervals; gas and ROP would be useful as curves (`geo_wells_logs`) once imported (U2-003). |
| Well Design, Torque and Drag | upstream partly used | Hole sections now fill Config (WS-U1-005); the planned trajectory is stored and unused (plan against actual on U2-001 and U2-005). |
| Seismolord, Mapping | none needed | Tops reach them through the registry. |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Composite log: depth downward, tracks for ROP, lithology from the descriptions, gas, shows, tops (prognosis and called), casing shoes, descriptions; white chartTheme and ChartLogo; PDF to scale | L | The picture every mudlogging suite leads with | A |
| 2 | U2-002 | Chromatograph readings (C1 to C5) as an observation, with wetness, balance and character (Haworth) and Pixler ratios, engines-first on the published examples; stored in the observation payload | M | Fluid type from gas, the Gas Advisor headline | A |
| 3 | U2-003 | Import of mudlogging exports (CSV and LAS, time or depth based): column mapping, units (ft, m, gpm, L/min, spm, psi, kPa, bbl, m3), day-first dates, a hostile file set; bit depth, pump rate, gas and parameters land as records with source "external" | M | Ends the typing; opens every existing well | A |
| 4 | U2-004 | Lag check: carbide or tracer lag entered, measured against calculated, washout factor on the open hole (engines-first, negative control) | S | The correction every mudlogger applies (WS-U1-019) | A |
| 5 | U2-005 | Surveys on the rig: type or paste MWD stations as a new survey version; stale depths flagged and recalculated through the engine's `recalculate` | M | True TVD and TVDSS while drilling (WS-U1-022) | A |
| 6 | U2-006 | d-exponent and corrected d-exponent from WOB, RPM, ROP, bit size and mud weight (typed or imported), with a normal trend on the composite log; engines-first (Jorden and Shirley, Rehm and McClendon) | M | Pressure surveillance at the wellsite; first half of PP U2-014 | A |
| 7 | U2-007 | Office view: live wells with bit, lag, last sample, what awaits approval and unsigned reports | S | The operations geologist's morning page | A |
| 8 | U2-008 | Pore Pressure link both ways: published curves into the prognosis and the approach panel; numeric mud weight, kicks and losses published as PP calibration | M | One pressure story from prognosis to the bit | B |
| 9 | U2-009 | Offer the rig's survey to the registry (owner action in WDM) | S | Closes WDM U2-009 | B |
| 10 | U2-010 | Publish plan shown before writing; prognosis and actual marked apart; replace in one step with a restore on failure | M | A clean registry after the well (WS-U1-013, 025) | B |
| 11 | U2-011 | WITSML 1.4.1 mudLog and 2.0 Wellbore Geology file import and export (cuttings intervals, shows) | M | Speaks the standard without a live server | B |
| 12 | U2-012 | Top scoring against the prognosis and offsets; casing, coring and TD notes as presented evidence | M | Decision support, never a determination | B |
| 13 | U2-013 | Signer and author names kept on the record (a column on ws_signoffs and ws_tops) | S | Names offline and after people leave (WS-U1-026); needs a migration | B |
| 14 | U2-014 | Live WITSML or ETP feed through a gateway: automatic bit depth, strokes, gas; automatic event detection | L | Real time parity; needs a service and a store | C |
| 15 | U2-015 | Real-time pore pressure surveillance with Pore Pressure Studio (PP U2-014 second half) | L | Drillworks real-time parity | C |
| 16 | U2-016 | End of well geological report from the record | M | The deliverable after TD | C |
| 17 | U2-017 | Sidewall-core selection and laboratory chain of custody | M | Sample custody past the rig | C |
| 18 | U2-018 | Assisted description from photographs and draft narratives, always reviewed | L | Speed, with the geologist deciding | C |
| 19 | U2-019 | KB and datum model with Well Data Manager (WDM U2-007) | M | Subsea depths that cannot be silently off (WS-U1-024); a geo_wells migration | C |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001, U2-002, U2-003, U2-004, U2-005, U2-006, U2-007. All store in existing columns (observation payloads, the well's survey).
- **Batch B:** U2-008, U2-009, U2-010, U2-011, U2-012, U2-013 (the only one needing DDL, on app-private ws_* tables).
- **Batch C:** U2-014, U2-015, U2-016, U2-017, U2-018, U2-019.

## Batch decision (programme lead, 2026-10-01)

Recorded verbatim.

> BUILD in this order, one commit per item:
> - Batch A, all: U2-004 lag check and washout (engines-first, validated against a published carbide-lag worked example or, if none is readable, hand-derived arithmetic with a negative control; say which); U2-002 gas chromatograph C1 to C5 with Haworth (wetness, balance, character) and Pixler ratios (validate against published ratio examples, negative control); U2-003 mudlog import (CSV and LAS, header-detected columns, declared units, 5 hostile files); U2-005 rig surveys (MWD station entry and import, minimum curvature through the shared trajectory resolver, the prognosis follows the updated survey; closes WS-U1-022); U2-006 d-exponent and corrected d-exponent (first half of Pore Pressure U2-014; engines-first, validated against a published worked example; plotted on a depth track with a normal trend); U2-001 composite (strip) log (depth-down tracks: ROP, lithology column, gas, tops, descriptions; print/PDF export read back with pdftotext; white chartTheme + ChartLogo); U2-007 office view (read-only follow of a shared well).
> - Batch B: U2-010 publish plan (prognosis and actual kept apart, duplicates named, atomic or honestly staged with rollback reporting; closes WS-U1-025 and the rest of 013); U2-009 rig survey to the shared wells registry (WDM U2-009; through the existing registry writer, with provenance); U2-008 Pore Pressure link both ways (d-exponent and gas as calibration evidence out; pore pressure prognosis and mud window in); U2-011 WITSML file import/export (1.4.1.1 mudLog/trajectory/log objects as files, round trip tested, hostile files); U2-012 top scoring only if time remains.
> - U2-013 names on the record: build ONLY if an existing JSON or text column on the ws_* tables can carry the display name with no DDL; otherwise defer with the migration sketched in the doc.
> DEFERRED (record reasons): U2-014 live WITSML/ETP gateway (L, needs a server component, after NAPE); U2-015 real-time pressure (L); U2-016 end of well report (after the composite log lands, next round); U2-017 sidewall cores; U2-018 assisted description; U2-019 KB/datum model (geo_wells migration, shared with WDM U2-007, second engineer).
> No DDL and no migrations in this PR.

### Deferred by the decision

| ID | Item | Reason |
|---|---|---|
| U2-014 | Live WITSML or ETP gateway | Size L; needs a server component (a gateway and a store); after NAPE. Files come first (U2-003, U2-011). |
| U2-015 | Real-time pore pressure surveillance | Size L; rests on U2-014 and on Pore Pressure Studio's real-time half of PP U2-014. |
| U2-016 | End of well report | Built on the composite log (U2-001); next round, once that has been used on a well. |
| U2-017 | Sidewall cores and laboratory custody | Size M, not demo-visible; after NAPE. |
| U2-018 | Assisted description | Size L; the record must stay the geologist's; after NAPE. |
| U2-019 | KB and datum model | A geo_wells migration shared with WDM U2-007; shared-registry DDL needs a second engineer. |

### Step 2 build record (branch `feat/ws-u2`)

| ID | Status | What was built | Proving test |
|---|---|---|---|
| U2-004 | Done | Lag check and washout in the dock under the lag (`components/LagCheckPanel.jsx`, `services/lagCheck.js` on engine `lagCheck.js`): the strokes counted from a carbide or tracer drop to its return, an optional surface line volume (bbl or m3 from the unit profile), the tracer. The panel shows the strokes down the string, measured against calculated lag, the difference and excess volume, the washout as a percent of the gauge open hole volume and the equivalent diameter. A check is an observation (`lag_check`), recorded as counted; applying it is a separate decision (`washout`, citing the check) that enlarges the open hole for the lag, the sample arrivals and the lagged depth; a later check still measures against gauge; a hand value (caliper) and Clear are new versions. A count shorter than the gauge lag is reported and corrects nothing. Closes WS-U1-019. | Engines `wellsite.lagcheck.test.js` (16): PUBLISHED INTEQ Advanced Logging Procedures Workbook page 1-6 (14.20 in, 11.13 in) and page 1-3 (968 strokes down); a field-unit stdlib oracle; the closing identity (lag on the corrected geometry equals the measured lag, floater with booster included); negative controls and a mutation run (square root removed: 3 fail). Suite `__tests__/upgradeU2Lag.test.jsx` (7): the shipped service recovers an 18 percent washout, the lag readout equals the measured lag once the decision is in force, records land in the local store and the outbox. |
| U2-002 | Done | Chromatograph readings on the Observations view (`services/gas.js` on engine `gasRatios.js`): C1, C2, C3, iC4, nC4, iC5, nC5 typed as read in ppm, percent or chromatograph units (one unit for all seven, declared; percent readings above 100 in total are refused as a unit slip); the Haworth wetness, balance and character and the Pixler C1/C2 to C1/C5 ratios are shown with their readings before saving and in a gas table after. The record keeps the components as read (and ppm beside them); ratios are recomputed from the engine on display; the one-line text is what the daily report prints. A ratio with no denominator is n/a with its reason. Shale density takes g/cc, sg or kg/m3. Closes WS-U1-021. | Engines `wellsite.gasratios.test.js` (17): formulas and limits as read on the page (INTEQ workbook pages 6-6 to 6-8), hand arithmetic one case per band, limits on both sides, hostile readings, negative controls and a mutation run (C2 dropped from the balance: 4 fail). Suite `__tests__/upgradeU2Gas.test.jsx` (6). **Weaker than asked:** no published worked example with C1 to C5 readings and printed ratios could be read, so the numeric cases are hand-derived; the Pixler chart bands for C1/C3 to C1/C5 were not read on a source page and are not in the engine (only the C1/C2 limits are). |

### Test record (2026-10-01)

- jest on CI (8 shards): green, with the four new suites (32 tests) and every existing Wellsite, lag engine, portability and `src/__tests__` suite.
- jest locally, in band: the new suites pass. The existing workstation suites (tops, kitFindings, membersOpenIn, describe, samplesView, reports, localStore) time out on this box at load 10 to 15, on origin/main as on this branch (the baseline run before any change failed the same way; `localStore` is untouched by this PR). CI is the reference.
- e2e, 1 worker, private dev server: `wellsite-upgrade.spec.js` 11 of 11; `wellsite-studio.spec.js` 16 of 16 (WS9 publish passed on a second run at low load; under load its second click raced the first save, an existing pattern in that spec).
- Production build: local 7 min 13 s, pass; CI build pass.

### Owner items

1. The three Release 1 walks are still open: WS1 validation review, WS6 PWA install on a laptop and a tablet, WS9 simulated shift. The stacked layout (WS-U1-004) is worth trying on the tablet in the same walk.
2. Playwright e2e is still not in CI; `e2e/wellsite-upgrade.spec.js` is new and runs only by hand.
3. WS-U1-009: before this fix every production PDF printed user ids in the sign-off block. Any daily report already sent out from production shows ids instead of names; re-export after the next upload.
4. No migration in this PR. U2-013 and U2-019 would need one.
