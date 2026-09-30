# Stratigraphy Studio: comprehensive upgrade

App #4 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) run and
fixed 2026-09-30 on branch `feat/strat-u1`. Step 2 (advancement review) is
analysis only; batches are chosen before anything is built.

Route `/dashboard/apps/geoscience/stratigraphy-studio` (ProtectedAppRoute),
help `/dashboard/apps/geoscience/stratigraphy-studio/help`, harness
`/dev/stratigraphy-studio` (in-memory backend; new for this upgrade:
`?scaleWells=<n>` adds n located ten-curve wells with eight typed and dated
tops, `?scaleUnits=1` an 84-unit column, `?sample=0` drops the KETA wells, and
an e2e seeds hostile wells, saved sections and a saved strat project through
`window.__STRAT_SEED__`).

Stratigraphy draws the shared section kit (`src/components/wells/section/`)
that Well Correlation upgraded in #816 and #818. Those changes were checked
from this side (named sections, depth references including TWT, column width,
line spacing, datum placement); the kit fixes below reach Well Correlation
unchanged, and its jest suites were run on the branch (see Verification).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile files (PL2) | `e2e/fixtures/strat/hostile/` | Intervals: a StrataBugs-style biozone export in feet with age columns beside the depths, a Petrel TVDSS interval file, a TWT facies file, a tab file with "Top (ft)", a semicolon file with comma decimals. Zone schemes: a clean file, StrataBugs-style headers (Zonation, Top Age, Base Age, Reference), ages in ka, ka typed under Ma headers, conflicting and identical duplicates, a semicolon file, columns and rows in odd order with a reversed row. Columns: a Petrel-style zone hierarchy, a spreadsheet in ka with a child before its parent, a repeat and an overlap. Core: a TIFF and a HEIC header. |
| Saved state (PL5) | `e2e/fixtures/strat/saved/` + `e2e/fixtures/wc/saved/` | `strat_projects` rows as ST2 (2026-09-06, stretch datum and a ghost), T1 (2026-09-26, Exxon, flatten), a row naming a deleted well and a gone top, a newer build's row; the Well Correlation section rows of each release (G3.2, WC wave 2 feet TVDSS, ST2 stretch, a missing well) opened in the studio. |
| Chain (PL9) | `__tests__/upgradeU1.test.jsx` (Basin, Tops, Wheeler), `src/lib/__tests__/intervalsDoor.test.js` (the shared interval door), e2e PL9 | Tops typed as Well Correlation and WDM leave them, through tracts and the Wheeler, into Basin & Charge Modeling's store with vertical thicknesses. |
| Workstation (PL1-PL12) | `src/pages/apps/StratigraphyStudio/__tests__/upgradeU1.test.jsx`, `zoneSchemesHostile.test.js`, `src/components/wells/section/__tests__/stratUpgradeU1.test.jsx` | The real views and the shared kit on the seeded backend; every block records its negative control on origin/main 4300f020a. |
| Browser (PL2-PL10) | `e2e/stratigraphy-upgrade.spec.js` | Hostile imports, tracts in TVDSS, hostile wells, every saved release, three viewports light and dark with white charts and depth down, the Wheeler SVG and PNG read back, Send to Basin, 30 wells and 84 units. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed; one open | 001, 003, 015, 022, 026, 034 | Quantity and vocabulary table below. Tracts vanished whenever a formation top sat between two sequence surfaces, the normal case in a real well. The timescale is ICS 2023/09 while 2024/12 and 2026/06 are published (open, engines-first). |
| PL2 Hostile file set | Failed, fixed | 004, 005, 006, 007, 016 | 16 files. Before: a TVDSS interval file went in as MD, "Top (ft)" was stored as metres, a StrataBugs export mapped its Top Age column as the top depth, conflicting zone rows dated from the last one, vendor zone headers, ka and semicolons were refused, a second scheme replaced the first, and a column could not be imported at all. TIFF and HEIC core photos are refused with the reason (pass). |
| PL3 Units, datums and frames | Failed, fixed; one open | 003, 008, 010, 012, 015, 031 | Tract fills sat at MD on TVDSS and TWT sections (30 m high on the harness); Basin layers and age-depth rates used MD thickness on deviated wells (95 m along hole is 88 m vertical on KETA-2); the studio inherited the section's reference with no control. Tables stay metres only (031, Step 2). |
| PL4 No claim without the event | Failed, fixed | 002, 020, 025 | Record tracts wrote an empty set over a well's recorded tracts; a saved view naming a gone well or top, and a newer build's project, were ignored silently. |
| PL5 Real saved state | Failed, fixed | 009, 020, 025 | Every release row opens (e2e). After WC-U2-001 the studio could only ever open the newest section. |
| PL6 Real browser | Failed, fixed | 013, 023 | 1366x768, 1440x900 and 390 wide, light and dark: no page scroll; the Wheeler, age-depth and column charts were dark canvases without the watermark and are now white chart paper with ChartLogo in both themes; the age-depth depth axis runs downward (asserted from SVG geometry). 390 wide keeps the desktop shell (WDM decision). |
| PL7 Report a reviewer can sign | Failed, fixed | 014 | None of the three charts could be exported. SVG and PNG now carry chart, wells, section, field, terms, ICS version, depth basis, preparer, date and build; the e2e reads both files back. |
| PL8 Practitioner's day | Gaps recorded | 016, 027, 029, 030, 031, 033 | Three persona walks below. |
| PL9 The chain | Failed, fixed | 004, 008, 019 | Upstream door (interval paste shared with WDM) refused non-MD; Basin gets vertical layers; the harness handoff lands in Basin's store. Mapping ST4 launchers now appear on real wells (tracts no longer vanish). `.pld`: `strat_projects` is a family and the remembered section rides in its `section_id` column, which the import remaps; portability suites green. |
| PL10 Real scale | Pass with an open S4 | 017 | 30 typed wells: section 1.3 s, Wheeler 225 ms for 150 cells (140 px columns scroll). An 84-unit column takes 5.4 s to open in the dev build (84 parent selects of 84 options and 84 stage selects of 102). |
| PL11 Inputs a person can type | Pass | none | Ages, hiatus ends and column ages are text fields validated on save; nothing snaps. |
| PL12 House standards | Failed, fixed | 021, 024 | ProtectedAppRoute holds. The help guide described the section and the tract rule as they were and never mentioned the zone scheme door; two messages used "X, not Y"; blank ages printed as empty cells. |

### PL1 quantity and vocabulary table

| On screen | Standard meaning | What the code does | Same? |
|---|---|---|---|
| SU / SB | Subaerial unconformity (Catuneanu); Exxon sequence boundary | Stored `SU`, Exxon label "Sequence boundary (SB)" | Yes |
| CC | Correlative conformity at the end of forced regression (Hunt and Tucker 1992) | Stored `CC`, Exxon display "SB (cc)" | Yes; the Exxon position of the correlative conformity (Posamentier et al. 1988) is the onset of fall, which is BSFR "SB (P&A)" here (026, S4) |
| MRS / TS | Maximum regressive surface; Exxon transgressive surface | `MRS`, Exxon "Transgressive surface (TS)" | Yes |
| MFS | Maximum flooding surface; Exxon downlap surface | `MFS` both | Yes |
| LST, TST, HST, FSST, RST | Tracts bounded by the surface pairs (Catuneanu 2006, 2009) | `expectedTract(lower, upper)` | Yes for the pair; was wrong for a WELL: consecutive tops were paired, so any formation top between two sequence surfaces removed the tract (001, fixed) |
| Wheeler cell | Time a well's rock spans between dated surfaces; hiatus as a gap (Wheeler 1958) | Engine cells per well, now coloured by the same tract rows the section fills | Yes, a well-based chronostratigraphic chart; the header now says it is not interpolated between wells |
| Age (Ma) | Numerical age on the ICS chart | Typed or filled from `timescale.js` ICS v2023/09 | Stale: v2024/12 moved the J/K base 145.0 to 143.1 Ma, Valanginian 139.8 to 137.05, Santonian 86.3 to 85.7, Chattian 27.82 to 27.30; v2026/06 changed three Triassic and Permian bases (022, open) |
| Lithostrat unit ages | A formation is rock and is diachronous; its ages are nominal | Unit top and base ages, filled from a stage | Acceptable as nominal; the export header says "placed by their nominal ages" (034) |
| Accumulation rate | Vertical thickness per Ma between dated surfaces | Was MD per Ma; now TVD through the survey, MD on a well without one, and the axis says which (015) | Fixed |
| Basin layer thickness | Vertical thickness of each layer | Was MD difference; now TVD, MD kept in provenance (008) | Fixed |
| Tract fill depth | The rock between two surfaces in the section's reference | Was MD on every reference; now through the reference (003) | Fixed |

### Findings

Severity: S1 wrong answer with no warning at scale; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| STRAT-U1-001 | S2 | PL1 | Systems tracts were paired from CONSECUTIVE tops. A formation top, biozone datum or unclassified unconformity between two sequence surfaces (every real well) removed the tract from the section fills, Record tracts, the Tops "Tract below" column, the Mapping launcher and, once dated, the Wheeler. The harness hid it: KETA-1's HST between Top Marker (BSFR) and Mid Shale (MFS) was never drawn because Top Dome sits between them. | Screenshot before; jest negative controls (section "0 tracts", Tops blank, Wheeler cells unnamed). | Fixed Suite-side (`src/lib/stratigraphy/sequenceTracts.js` filters the engine's input to surfaces with a sequence position and reads its output); the Wheeler takes the tract rows the section fills, recorded first. |
| STRAT-U1-002 | S2 | PL4 | Record tracts called `replaceIntervals` with an empty set on a well with nothing implied, deleting its recorded or hand-edited tracts. With 001 this was most wells. | jest negative control. | Fixed: such a well keeps its tracts and is named in the status. |
| STRAT-U1-003 | S2 | PL3, PL1 | The shared painter placed tract and motif bands by MD on TVD, TVDSS and TWT sections (KB metres too deep in TVDSS; metres on a millisecond axis in TWT), while the tops beside them were in the reference. | `stratUpgradeU1.test.jsx` negative control: "1440-1580" where the well is at 1410-1550. | Fixed in the kit (`data-band-spans`); Well Correlation passes no bands today, so it gains the attribute only. |
| STRAT-U1-004 | S2 | PL2, PL3, PL9 | The interval paste door (shared by WDM Intervals and the studio) stored a TVDSS, TVD, elevation or time column as MD, and a StrataBugs export's "Top Age (Ma)" was guessed as the top depth. | `intervalsDoor.test.js`; e2e PL2. | Fixed at the shared door (`intervalDepthProblem`, the WC-U1-016 rule): refused with the reason; age and time columns are never guessed as depths. |
| STRAT-U1-005 | S2 | PL2, PL3 | "Top (ft)" in an interval header did not set the unit (the WDM-U1-005 fix covered MD headers only), so feet were stored as metres; semicolon files with comma decimals were refused (the shared header detector read "1440,5" as text). | Same tests. | Fixed: the header unit is read, the tabular reader treats comma decimals as numbers in semicolon files. |
| STRAT-U1-006 | S2 | PL2 | Two rows giving one zone different ages dated every matching biozone from the LAST row, silently. | `zoneSchemesHostile.test.js` negative control (NN11 dated 8.10 to 11.63 Ma). | Fixed: the zone is refused and named; identical repeats collapse. |
| STRAT-U1-007 | S3 | PL2, PL8 | The scheme importer took only its own header names, Ma only and commas only; a second file replaced the first; nothing showed what was read. | Same. | Fixed: vendor names, ka to Ma (said), semicolons, any order; schemes merge by name (a replaced one is named); the panel lists zones, age range and source per scheme with remove; overlaps inside a scheme are noted. |
| STRAT-U1-008 | S2 | PL3, PL9 | Send to Basin built layer thicknesses from MD differences, so a deviated well overstated every layer below the kick-off; `surface_elevation` carried the KB. | jest (KETA-2: 95 m MD is 88.0 m TVD); e2e PL9. | Fixed (`verticalDepthOf`): tops, TD and lithology intervals go through the survey; provenance keeps MD and TVD with `thickness_basis`; KB moves to `settings.registryKbM`. |
| STRAT-U1-009 | S3 | PL5, PL8 | After WC-U2-001 (named sections) the studio could only open the newest section. | jest; e2e PL5. | Fixed: Section picker; Save view stores the choice in `strat_projects.section_id` (FK, on delete set null, remapped by `.pld`). |
| STRAT-U1-010 | S3 | PL3 | The studio inherited the section's depth reference and unit (possibly TWT or feet) with no control and no label. | jest. | Fixed: Depth select (MD, TVD, TVDSS, TWT) and unit; saved with the view. |
| STRAT-U1-011 | S3 | PL5 | The harness backend dropped deviation, CRS and checkshots (carried from WDM-U1-018), so no deviated, feet or time path had run in the studio. | jest (deviation undefined). | Fixed; the harness also seeds wells, sections and a project. |
| STRAT-U1-012 | S3 | PL3, PL11 | Flatten placed the datum at 1,500 m whatever the data (carried from WC-U1-009, fixed there only). | jest. | Fixed: `datumDefaultFor` moved into the kit; both apps use it. |
| STRAT-U1-013 | S3 | PL6, PL12 | Wheeler, age-depth and column charts were dark canvases without ChartLogo. | Screenshots before. | Fixed: white chart paper and the watermark in both themes (theme test updated deliberately). |
| STRAT-U1-014 | S3 | PL7 | No chart could be exported. | Code read. | Fixed: SVG and PNG with the reviewer header; Prepared by and Field in the status bar, saved with the view. |
| STRAT-U1-015 | S3 | PL1, PL3 | Age-depth rates used MD on deviated wells (140.0 m/Ma for 136.7 m/Ma vertical on KETA-2). | jest. | Fixed: TVD through the survey; the axis and a note state the basis. |
| STRAT-U1-016 | S3 | PL2, PL8 | A column could only be typed row by row. | Walk. | Fixed: Import units (Petrel hierarchy, StrataBugs chart, spreadsheet; parents by name in any order; ka; repeats, conflicts, unknown ranks and overlaps named); rows arrive unsaved and Save column validates as before. |
| STRAT-U1-017 | S4 | PL10 | An 84-unit column opens in 5.4 s in the dev build (per-row parent and stage selects). | e2e PL10 timing. | Open: Step 2 (U2-007). |
| STRAT-U1-018 | S4 | PL4 | Spacing along a WC section line fell back to equal with "the section wells are not the wells of the drawn line"; the kit also said so while a section was still loading. | jest. | Fixed: saved line distances are read; no note with fewer than two wells. |
| STRAT-U1-019 | S4 | PL9 | The harness Send to Basin wrote into a private array, so Open Basin never showed it. | e2e. | Fixed: it lands in the Basin harness store. |
| STRAT-U1-020 | S3 | PL5, PL4 | A view saved earlier whose ghost names a gone well, or whose datum top no well carries, restored silently. | jest; e2e PL5. | Fixed: ghost off, both named. |
| STRAT-U1-021 | S3 | PL12 | The help guide described the old section and tract rule and omitted the zone scheme door. | Guide read. | Fixed. |
| STRAT-U1-022 | S3 | PL1 | Timescale is ICS v2023/09; v2024/12 revised 7 Cenozoic and 9 Cretaceous bases (J/K 145.0 to 143.1 Ma) and v2026/06 three Triassic and Permian ones. Saved ages carry no chart version. | stratigraphy.org charts, Cohen et al. 2025. | Open: engines-first (the table is vendored), Step 2 U2-003. |
| STRAT-U1-023 | S4 | PL6 | The rank select clipped ("formati") at 1366. | Screenshot. | Fixed. |
| STRAT-U1-024 | S4 | PL12 | Blank ages printed as empty cells; a literal "n/a". | Code read. | Fixed: `EMPTY_VALUE`. |
| STRAT-U1-025 | S4 | PL4, PL5 | A strat project saved by a newer build was dropped silently (Save view already refused). | jest; e2e. | Fixed: the status says so. |
| STRAT-U1-026 | S4 | PL1 | Under the Exxon display both CC and BSFR read as sequence-boundary variants; defensible, but a Vail-school user may expect one SB. | Vocabulary read. | Open: engines vocabulary note (U2-018). |
| STRAT-U1-027 | S3 | PL8 | Wheeler columns sit at equal spacing (ST-T1-E1). | Walk. | Open: Step 2 U2-001. |
| STRAT-U1-028 | S3 | PL8, PL9 | Zone schemes live in one browser; not shared, not in `.pld` (ST-T1-E1). | Code read. | Open: Step 2 U2-008 (needs a table). |
| STRAT-U1-029 | S3 | PL8, PL9 | The studio section lacks what WC U2 added to the kit: Seismolord horizons (flatten on a horizon), Petrophysics pay and zone strips, the unit strip, column width. | Walk. | Open: Step 2 U2-002. |
| STRAT-U1-030 | S4 | PL3, PL5 | Ghost shift in metres in a feet session, first track only, ±200 m; ghost well ids in `strat_projects.view` are not remapped by a `.pld` import. | Code read. | Open: U2-002. |
| STRAT-U1-031 | S3 | PL3 | Tops, Intervals, Core and Ages tables are metres only. | Walk. | Open: U2-004. |
| STRAT-U1-032 | S4 | PL4 | Send to Basin makes a new model on every click, all named "<well> stratigraphy". | Walk. | Open (small, Step 2 C with U2-018). |
| STRAT-U1-033 | S4 | PL2, PL8 | The biozone paste takes top, base and code only; scheme and ages are typed per row. | Walk. | Open: U2-005. |
| STRAT-U1-034 | S4 | PL1 | Ranks stop at group; no supergroup or subgroup; unit ages are nominal. | Code read. | Open: U2-018. |

23 findings fixed (7 S2, 11 S3, 5 S4), 11 open (5 S3, 6 S4), each with its Step 2 item. No S1 was found; no S2 is open.

Seen on the branch and not ours: `src/__tests__/w10EmptyValue.test.js` is red on origin/main for `PetrophysicsStudio/services/petroReport.js` (one lone dash), from the Petrophysics work.

### Persona walks (PL8)

**1. Sequence stratigrapher (Petrel and StrataBugs user).** Imports the company column exported from a Petrel zone hierarchy: *before*, typed it unit by unit; *now* Import units reads it with parents by name. Loads the operator's nannofossil scheme from StrataBugs: *before*, refused for its header names; *now* read, and a zone the file gives two calibrations is refused by name. Pastes the biozone ranges in feet: *before*, feet went in as metres and the Top Age column could be taken as depth; *now* feet are read and the ages stay out. Types BSFR and MFS around a formation top: *before*, no HST anywhere; *now* the HST is filled, recorded and on the Wheeler. Switches the section to TVDSS: *before*, the fills sat 30 m high. Would now: space the Wheeler by distance (U2-001), hang the section on a Seismolord horizon (U2-002), read events as FAD and LAD with a range chart (U2-009), fit an age model through the events (U2-010), share the scheme with the team (U2-008), work on ICS 2024/12 or later (U2-003).

**2. Graduate geologist.** Opens the studio after a supervisor saved three sections in Well Correlation: *before*, only the newest opened; *now* picks one. Presses Record tracts to "see what happens" on a well with one sequence surface: *before*, the supervisor's hand-edited tracts on that well were erased; *now* they are kept and named. Exports the Wheeler for a weekly meeting: *now* SVG or PNG with name, date and build. Would now: read depths in feet in the tables (U2-004), a one-page PDF summary per well (U2-006).

**3. Basin modeller consuming the output.** Receives "KETA-2 stratigraphy" in Basin & Charge Modeling: *before*, every layer below the kick-off was 5 to 8 percent too thick (MD) and the KB sat in the surface elevation field; *now* vertical thicknesses with MD and TVD in provenance and the KB in settings. Would now: decompacted thicknesses and rates (U2-020), eroded amounts estimated from the hiatus and the rates (with U2-020), a TVT basis for strat maps (U2-011).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources (public documentation opened 2026-09-30): StrataBugs features, events, depth/age chart ([features](https://www.stratadata.co.uk/site/features.html), [events](https://www.stratadata.co.uk/StrataBugs/v3.0/help/howtouseevents.html), [depth/age chart](https://www.stratadata.co.uk/StrataBugs/v3.0/help/howtousedepthvsagechart.html)); dGB SSIS ([plugin](https://www.dgbes.com/software/plugins/sequence-stratigraphic-interpretation-system), [OpendTect 6.6 SSIS](https://doc.opendtect.org/6.6.0/doc/dgb_userdoc/content/sequence_stratigraphic_interpretation_system/introduction.htm)); Kingdom geology ([brochure](https://cdn.ihsmarkit.com/www/pdf/Kingdom-2016-Geology-Brochure.pdf)); ICS charts ([2023/09](https://stratigraphy.org/ICSchart/ChronostratChart2023-09.pdf), [2024/12](https://stratigraphy.org/ICSchart/ChronostratChart2024-12.pdf), [2026/06](https://stratigraphy.org/ICSchart/ChronostratChart2026-06.pdf), [news](https://stratigraphy.org/news/156)); Cohen et al. 2025, Episodes 48(1). Rows marked (snippet) rest on search results only: Petrel 2021.1 sequence stratigraphy in the well section; StrataBugs graphic correlation. No public SLB page confirmed a Petrel Wheeler diagram tool.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Column authoring and import | StrataBugs lithostrat, chronostrat and biozone interpretations with confidence and versions | Column editor, graphic column, Import units (U1-016) | partial (no versions) | yes |
| Chronostrat chart version | Vendors carry their own timescales | ICS 2023/09 | done worse (2026/06 current) | yes |
| Wheeler from wells | none of the benchmarks found | Well-based Wheeler with tracts and hiatuses, exported | ahead | yes |
| Wheeler from seismic | SSIS Wheeler transform honouring truncations | none (Seismolord flattens and slices) | missing | yes |
| Wheeler spacing, interpolation | SSIS continuous; Kingdom true or fixed distance sections | equal columns at wells | missing | yes |
| Systems tracts | SSIS tract models from lap-out patterns; Petrel 2021 sequence strat in the well section (snippet) | implied from typed surfaces, recorded as intervals, fixed across formation tops (U1-001) | partial | yes |
| Sequence vocabulary | Petrel (snippet) | Catuneanu stored, Exxon display with fallbacks | none (a strength) | yes |
| Automatic base-level or tract detection | SSIS | none (out of v1) | missing | yes |
| Biostrat events FAD/LAD/FDO/LDO | StrataBugs event dictionary | biozone datums as typed tops | missing | yes |
| Range charts | StrataBugs | none | missing | yes |
| Zonation libraries | StrataBugs composite standards, regional inheritance | CSV scheme per browser (U1-007) | partial | no |
| Age model | StrataBugs drag-node depth/age line fitted to events | age-depth through dated surfaces, rates, hiatuses, now vertical | partial | yes |
| Graphic correlation | StrataBugs (snippet) | none | missing | yes |
| Rates and hiatuses | StrataBugs line styles for disconformity and fault | rates, hiatus bars | none | yes |
| Lithology and core logs | Kingdom composite logs in section; StrataBugs sample panels | interval logs, strips, core photos | none | yes |
| Assisted correlation | Kingdom one-click; SSIS HorizonCube | none here (WC has suggest-only picks) | missing | yes |
| Section with flattening | Kingdom depth and time, seismic overlays | flatten, stretch, TWT, ghost; no horizons in the studio yet | partial | yes |
| Chart exports | StrataBugs PDF, SVG, bitmaps | SVG, PNG with header (U1-014) | partial (no PDF) | yes |
| Sharing | StrataBugs multi-user database; Kingdom multi-author | registry rows org-shareable read-only; schemes per browser | partial | no |
| Basin integration | none found | Send to Basin with vertical layers and erosion events | ahead | yes |
| Stratal slicing | SSIS in Wheeler space | proportional stratal slice in Seismolord | done worse (no HorizonCube) | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Org zone schemes table (ST-T1-E1) | T1, STATUS | Still wanted (U2-008); needs a table and RLS, so batch B |
| Wheeler columns spaced by distance (ST-T1-E1) | T1 | Still wanted, first (U2-001) |
| Automatic correlation | PLAN section 9 | Still wanted as suggest-only tract and surface picks (U2-016), after users have typed enough picks |
| Chemostratigraphy | PLAN section 9 | Still wanted, pulled by a paying user (U2-017, C) |
| Biostrat reference database | PLAN section 9 | Dropped as a licensed dataset; superseded by an event dictionary and range charts on the user's own picks (U2-009) |
| 3D Wheeler, seismic facies, automatic motif detection | PLAN section 9 | Wheeler from seismic kept (U2-014, C); the rest dropped |
| TVT thickness for strat maps (`thickness_basis: 'md'`) | STATUS ST4 | Still wanted (U2-011), now that `verticalDepthOf` exists |
| Stratal slice as a live map attribute; traverse flatten; terminations as shared rows | STATUS ST5 limits | Terminations as registry rows still wanted (U2-013); the other two belong to Seismolord (app #5) |
| Delete the section re-export shims | PLAN section 10 | Still wanted, trivial (U2-019) |
| Owner walk on staging | STATUS ST0 close-out | Still wanted, owner run |

### 2c. Suite integration

**Reads:** `geo_wells` (header, survey, KB, CRS, checkshots), `geo_wells_tops` (typed), `geo_wells_intervals`, `geo_wells_core_images`, `geo_wells_logs` and curve objects, `geo_strat_units`, `geo_correlation_sections` (named, from Well Correlation), `strat_projects`.
**Writes:** typed fields on `geo_wells_tops`, biozone datum tops, `geo_wells_intervals` (every kind, including recorded systems tracts), `geo_strat_units`, core photos, `strat_projects` (now with `section_id`), `bf_wells` through Basin's backend. `.pld`: every table above is a family (`geoscienceSpec.js`); zone schemes are not (browser only).
**Consumers:** Well Correlation (typed markers, unit strip), Petrophysics (typed markers), Well Data Manager (typed tops columns, Intervals and Core tabs), Mapping (net and gross between two tops, facies and paleogeography polygons), Basin & Charge Modeling (layers), Data AI facies (facies, core description, lithology and electrofacies intervals as labels), Seismolord (typed tops on ties).

| Finding | Kind | Detail |
|---|---|---|
| Seismolord horizons and Petrophysics pay/zones not in the studio section | upstream ignored | The kit draws both since WC U2-003 and U2-008; the studio passes neither (U2-002). |
| Seismolord terminations are per session | downstream not fed | Onlap, downlap, toplap and truncation markers never reach the registry, so the studio cannot show them beside its tracts (U2-013). |
| Strat maps measure MD thickness | handoff loses context | Mapping's ST4 source is MD-based; deviated wells inflate net sand (U2-011). |
| Systems tracts and biozones unused as Data AI labels | downstream not fed | Data AI facies reads four interval kinds; tracts would give sequence-aware labels (U2-012). |
| Zone schemes stay in one browser | handoff loses context | Not shared, not in `.pld` (U2-008). |
| Ghost well ids in `strat_projects.view` | handoff loses context | Not remapped on `.pld` import; the studio now switches the ghost off with a note (U2-002 moves it to a softRef). |
| Basin reads back nothing | downstream one-way | A Basin model does not link back to the column or tops it came from beyond `settings.registryWellId` (acceptable for v1). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-002 | The studio section at Well Correlation U2 parity: Seismolord horizons (flatten on a horizon), pay, zone and unit strips, column width, a section picker on the Wheeler, ghost in the display unit and as a softRef | S | Everything WC gained shows in the stratigrapher's section too | A |
| 2 | U2-001 | Wheeler columns spaced by distance along the section (CRS-aware kit distances, equal as an option, the line when WC drew one) | S | The ST-T1-E1 ask: a Wheeler that reads like a section | A |
| 3 | U2-003 | ICS chart 2026/06 in the engines (2024/12 Cenozoic and Cretaceous changes), the version shown and stamped on typed ages and units, a note on ages typed under 2023/09 | M | A J/K boundary 1.9 Myr off is the first thing a biostratigrapher checks | A |
| 4 | U2-006 | Stratigraphic summary PDF per well or section: column, Wheeler, age-depth, tops table, with the PL7 header (jsPDF like the WDM sheet) | M | The page a reviewer signs | A |
| 5 | U2-004 | Display units m/ft in Tops, Intervals, Core and Ages (WDM U2-001 pattern) | S | A feet user reads their own numbers | A |
| 6 | U2-005 | Biozone paste with scheme and age columns; biozone ranges as a strip in the section | S | StrataBugs ranges in one paste, visible beside the logs | A |
| 7 | U2-007 | Column editor at scale: lazy selects, virtualised rows | S | An 84-unit column opens at once | A |
| 8 | U2-008 | Organisation zone schemes: `strat_zone_schemes` table (org read, owner write), `.pld` family; migration file unapplied until reviewed | M | The team dates from one calibration | B |
| 9 | U2-011 | Strat maps and isochores on vertical thickness (TVD now, TVT with dip later) | S | Deviated wells stop inflating net sand | B |
| 10 | U2-009 | Biostrat events (FAD, LAD, FDO, LDO, acme) as typed datums with an event dictionary; a range chart per well | M | The StrataBugs user's daily view | B |
| 11 | U2-010 | Age model fitted through events (depth/age line with nodes), rates from it | M | Ages from evidence, not typed | B |
| 12 | U2-012 | Data AI facies labels from systems tracts and biozones | S | Sequence-aware training labels | B |
| 13 | U2-013 | Seismolord terminations as registry rows, drawn in the studio section | M | Lap-outs beside the tracts they define | B |
| 14 | U2-016 | Suggest-only tract and surface picks from motifs and GR trends (WC U2-009 pattern, validation gate) | M | Faster first pass, the interpreter still decides | C |
| 15 | U2-020 | Decompaction (backstripping) for rates and Basin layers; eroded amount estimated from rates | M | Rates a basin modeller trusts | C |
| 16 | U2-014 | Wheeler from seismic horizons (with Seismolord) | L | The SSIS picture | C |
| 17 | U2-015 | Graphic correlation (section against section or a composite) | L | StrataBugs parity for biostratigraphers | C |
| 18 | U2-017 | Chemostratigraphy curve family and ratio plots | L | Only when a paying user asks | C |
| 19 | U2-018 | Supergroup and subgroup ranks, interpretation versions, Exxon CC label note, one Basin model per well updated in place | S | Small correctness and tidiness | C |
| 20 | U2-019 | Delete the section kit re-export shims | S | One import path | C |

Batch A (demo-visible, NAPE-safe, no schema change): U2-002, U2-001, U2-003 (engines-first; no Suite schema change), U2-006, U2-004, U2-005, U2-007.
Batch B: U2-008 (new table: migration file only, applied after review), U2-011, U2-009, U2-010, U2-012, U2-013 (U2-013 may need a registry decision with Seismolord).
Batch C: U2-016, U2-020, U2-014, U2-015, U2-017, U2-018, U2-019.

### Owner questions

1. ICS version (U2-003): move to 2026/06 for all new ages and flag ages typed under 2023/09, or offer a per-project chart version? The recommendation is one current chart plus the stamp and the flag.
2. Zone schemes (U2-008): organisation-readable, owner-writable like `geo_strat_units`? That is a new product table with RLS (migration reviewed and applied by the owner), no shared-table change.

## Batch decision (programme lead, 2026-09-30)

Recorded verbatim.

BUILD in this order, one commit per item:
- Batch A: U2-002 bring the Well Correlation U2 section additions (Seismolord horizons, strips, fixed-width columns) into the studio section; U2-001 Wheeler columns spaced by distance; U2-003 ICS chart 2026/06, engines first (decision on the ICS policy: 2026/06 becomes the default chart; every age carries the chart version it was entered under; ages entered under an older chart are flagged with the numeric change where a boundary moved, e.g. J/K 145.0 to 143.1 Ma, and the user can accept the update per project; store the chart version in the existing project payload, no schema change); U2-006 stratigraphic summary PDF (reviewer header, read back with pdftotext in a test); U2-004 display units; U2-005 biozone paste with scheme and ages; U2-007 column editor at scale.
- Batch B: U2-011 strat maps on vertical thickness; U2-012 Data AI labels from tracts; U2-009 biostrat events and range chart; U2-010 event-based age model (validate against a published worked example); U2-013 Seismolord terminations as registry rows ONLY if an existing registry table can hold them without a schema change, otherwise defer with the reason.
- Batch C: U2-016 suggest-only tract picks (each suggestion shows its reason; nothing written until accepted, same rule as Well Correlation U2-009); U2-018 ranks and tidy-ups; U2-019 delete the kit re-export shims (only if every importer is updated and the suites pass).
DEFERRED: U2-008 org-wide zone schemes (needs a new product table with RLS: owner review and apply; do not write the migration in this PR); U2-020 decompaction (Basin & Charge Modeling owns burial history, revisit at app #11); U2-014 Wheeler from seismic, U2-015 graphic correlation, U2-017 chemostratigraphy (L, after NAPE).

Branch `feat/strat-u2`, one PR. Build log per item below.

### Build log (Step 2)

| ID | Status | Proving test | Notes |
|---|---|---|---|
| U2-002 | Done | `__tests__/upgradeU2.test.jsx` "STRAT-U2-002" (registry backend lists sections, surfaces and zones; both Seismolord horizons drawn, the time one naming KETA-3, flatten on "H: Dome", nothing written; pay, zone and unit strips with KETA-2 "no published PAY"; 220 px columns; horizons, strips and width saved with the view and restored; ghost in feet with all tracks and x1.25; the Wheeler's section picker; `.pld` remaps the ghost wells and horizons); `src/lib/portability/__tests__/stratigraphyFamily.test.js` (softRefs, updated deliberately); every Well Correlation suite (the horizon code moved into the kit) | The horizon logic Well Correlation U2-003 built moved unchanged into the kit (`useSectionHorizons.js`); both apps call it. The studio section gains a Horizons list (read only, per-horizon "drawn on n wells; not on ..."), Strips (pay, zones, units), a Columns width select (auto, fit, 120 to 300 px with the kit's horizontal scroll), flatten and stretch on a horizon, and the WC ghost controls (all tracks, stretch) with the shift in the display unit (ft, or ms on TWT). All of it rides in `strat_projects.view` (jsonb, no schema change). Found on the way: the registry backend never passed `listSections`, so the U1-009 section picker showed only on the harness; fixed. `.pld`: `view.ghost.*Id` (geo_wells) and `view.horizons[]` (geo_surfaces) are optional softRefs, so U1-030's ghost ids are remapped. The Wheeler header has the section picker. The harness sample now carries WC's published PAY, zones and the two Dome horizons. |
| U2-001 | Done | `__tests__/upgradeU2.test.jsx` "STRAT-U2-001" (wells at 0, 300 and 1,200 m: gaps in the ratio 1 to 3 with "300 m" and "900 m" printed; equal stays equal; two coordinate systems fall back to equal and say why; along the drawn line with an undated well between; the studio control follows the section and saves in `strat_projects.wheeler`) | Spacing select in the Wheeler header: equal, by distance (the kit's CRS-aware wellhead distances, `pathDistances` and `spacingProblem`) or along the section line Well Correlation saved (`track_layout.lineAlong`). It follows the section's spacing until changed and saves in the existing `wheeler` jsonb column. Distances run between the wells the chart places, so an undated well does not hold a gap; each gap prints its distance; a fallback to equal says why under the chart. Wheeler columns are half the equal width (120 px at most) so close wells are pushed apart only when they would overlap. The exported header states the spacing. |
