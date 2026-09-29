# Well Correlation: comprehensive upgrade

App #3 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) run and
fixed 2026-09-29 on branch `feat/wc-u1`. Step 2 (advancement review) is
analysis only; the owner picks batches before anything is built.

Route `/dashboard/apps/geoscience/well-correlation` (ProtectedAppRoute),
harness `/dev/well-correlation` (in-memory backend; new for this upgrade:
`?sample=0` drops the KETA wells, `?scaleWells=<n>` adds n ten-curve wells,
and an e2e seeds hostile wells and a saved section through
`window.__CORR_SEED__`).

The section itself is the shared kit in `src/components/wells/section/`
(CrossSection, sectionFrame, useSectionWells), which Stratigraphy Studio
(app #4) draws too. Every kit fix below reaches Stratigraphy's section view
unchanged; its jest and e2e suites were run on the branch.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile wells (PL2, PL3) | `e2e/fixtures/wc/hostile/wells.json` + `generate.mjs` | BONGA G1-UP (curves stored bottom-up by a G1-era import), ARLO 12 and 14 (US survey feet state plane, EPSG:2277, 1,000 m apart), OKAN PX-4 (UTM metres), IDU 7 (deviated 0 to 40 degrees, no KB), IDU 9 (no survey), IDU 11 (Kingdom-style upper-case TOP AGBADA beside Top Agbada, a repeated top, "Base Seal " with a trailing space). |
| Hostile tops files (PL2) | `e2e/fixtures/wc/hostile/tops_*` | Petrel well tops export in feet (MD, TWT, Z); Kingdom export (UWI without dashes, upper-case names, MD and TVDSS in ft); Petra export (UWI, LABEL, FMNAME, DEPTH with no unit); a TVDSS-only file; an elevation-only (Z) file; odd column order with base-before-top rows and a comment column; case-twin duplicates. |
| Saved state (PL5) | `e2e/fixtures/wc/saved/` | `geo_correlation_sections` rows as G3.2 (2026-07-13, flatten on Top Dome, empty track_layout), WC wave 2 (2026-09-03, feet, TVDSS, spacing by distance, a version 1 user template), ST2 (2026-09-06, stretch datum, PP0 stamp), a row naming a deleted well, and a row stamped by a newer build. |
| Chain (PL9) | `src/pages/apps/WellCorrelation/__tests__/topsChain.test.jsx` | Every tops file through the Suite's tops door (WDM tops sheet, `planPasteText`) into the registry, read back by `useSectionWells` in MD and TVDSS. The WDM chain test (`chainDownstream.test.jsx`) already covers LAS imports into the section. |
| Workstation (PL1-PL11) | `__tests__/upgradeU1.test.jsx`, `__tests__/sectionReport.test.js`, `src/components/wells/section/__tests__/upgradeU1Frame.test.js` | The real CorrelationWorkstation on the seeded backend; pure geometry on the hostile wells. |
| Browser (PL2-PL10) | `e2e/well-correlation-upgrade.spec.js` | Hostile section notes and spacing, every saved release, three viewports light and dark with canvas ink and white paper, the PNG read back, 30 and 50 wells. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Pass after fixes | 004, 005, 011, 017 | Quantity table below. TVDSS silently equalled TVD on a well with no KB; a stretched section's axis read as plain MD. |
| PL2 Hostile file set | Failed, fixed | 003, 008, 016, 024 | 7 wells and 7 tops files. Before: a TVDSS column went in as MD, the Petra export was refused with no way to map it, a bottom-up well fell back to MD in TVDSS, case twins were two correlations that could not be merged. |
| PL3 Units, datums and frames at every door | Failed, fixed | 002, 005, 012, 015, 026 | Spacing by distance read US feet as metres (3.28x) and measured across CRSs (13,544 km in the section, wells pushed off the canvas). Datum model is MSL only (carried from WDM-U1-026). |
| PL4 No claim without the event | Failed, fixed | 001, 006, 007, 013 | "Propagated Marker Z to 2 wells at 0.0 m" from a blank depth box; "Restored saved section" with a well silently missing; no unsaved state. |
| PL5 Real saved state | Failed, fixed | 006, 007, 013 | All three release rows open (e2e). A newer-build row emptied the wells list and Save would then overwrite it. |
| PL6 Real browser | Pass after fixes, one open | 004, 017, 025 | 1366x768, 1440x900, 390 wide, light and dark: no page scroll, section has ink, log paper white in dark, depth downward (e2e). 390 wide keeps the desktop layout (WDM decision). |
| PL7 Report a reviewer can sign | Failed, fixed | 010 | The PNG had a title band only. It now carries field, analyst, wells, datum and flattening, reference and unit, vertical scale 1:N, spacing, template, date and build (PNG size read back in e2e; caption asserted in jest). |
| PL8 Practitioner's day | Gaps recorded | 018, 019, 020, 021, 022, 023 | Three persona walks below. |
| PL9 The chain | Failed, fixed | 016 | Tops door into the section (chain test). Map this top, Open in, deep links: existing e2e green. `.pld` round trip of `geo_correlation_sections`: portability suites green. |
| PL10 Real scale | Pass with an open S3 | 017 | 30 and 50 wells of 10 curves (13,123 samples each) open and zoom; columns are 24 px at 30 wells and 14 px at 50, and one repaint is a 2.6 s task in headless Chromium (software canvas). |
| PL11 Inputs a person can type | Failed, fixed | 009 | Clearing the datum depth set the datum to 0; now the shared NumText. Propagate depth parsed as typed (001). |
| PL12 House standards | Pass after fix | 014 | ProtectedAppRoute, EMPTY_VALUE, copy style hold; the help guide described datum modes the app does not have. Log paper without ChartLogo on screen, watermark on export (owner decision 2026-09-28). |

### PL1 quantity table

| Quantity on screen | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| MD | Measured depth along hole from the depth reference (KB) | Registry `md_m` / DEPT curve | Yes |
| TVD | True vertical depth below KB through the survey (minimum curvature) | `makeDepthFrame` (golden-tested engine) | Yes; a well with no survey is vertical, now said on its header (005) |
| TVDSS | TVD minus KB elevation, below mean sea level | `tvd - kb_m` | Was TVD for a well with no KB, silently; now "no KB: TVDSS = TVD" (005). SRD is not modelled (026) |
| Flattened depth | Depth relative to a datum top hung on one line | `datumM - md(top)` shift (engine/section.js, analytic tests) | Yes; axis says "flattened" |
| Stretched depth | Two tops hung on two lines, interval stretched | `computeStretch` (ST2) | Yes; the axis said "MD (m)", now "stretched" (011) |
| Correlation line | Joins the same top between adjacent wells | Centre to centre, across the log tracks | Was misleading; now edge to edge in a gap, dashed across a well without the top (004) |
| Top marker type | Conformable formation top vs unconformity (SU), MFS, BSFR | Catuneanu codes with line styles (ST0) | Yes |
| Resistivity scale | Logarithmic, zero or negative lifts the pen | `xScaleFor` log branch | Yes (values of 0 are skipped, not plotted at the edge) |
| D-N shading | Yellow where neutron reads left of density (gas/sand), grey for shale | Crossover fill, Petrophysics template | Yes |
| Inter-well distance | Surface distance between wellheads in metres | Was raw X/Y difference in any unit and any CRS; now metres by CRS unit, none across CRSs (002) | Fixed |
| Vertical scale | 1:N of the drawn window | New: span / plot height at 96 dpi (010) | Yes (printed on the PNG) |

### Findings

Severity: S1 wrong answer with no warning at scale; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| WC-U1-001 | S2 | PL4, PL11 | Propagate with the depth box left blank wrote the top at MD 0 on every owned well (`Number('')` is 0), straight into the shared `geo_wells_tops` rows Seismolord and Mapping read. A depth below a well's TD was written too. | Negative control: "Propagated Marker Z to 2 wells at 0.0 m." | Fixed: depth parsed as typed, blank or non-numeric refused; wells below TD, shared and already carrying the top (any case) are named. `upgradeU1.test.jsx`. |
| WC-U1-002 | S2 | PL3 | Spacing by distance used raw X/Y: US survey feet read as metres (3.28x) and wells in different CRSs measured 13,544 km apart, which pushed three of seven wells off the canvas with no message. | Hostile screenshot; `upgradeU1Frame.test.js`. | Fixed in the kit: distances in metres by each well's `xy_unit`; mixed CRSs, geographic or unlocated wells keep equal columns and the status says why; columns never pass the right edge. |
| WC-U1-003 | S2 | PL2, PL3 | Curves stored bottom-up by a G1-era import were read by sample: in TVD/TVDSS the well fell back to MD ("not monotonic") and was drawn KB metres too deep (30 m for BONGA G1-UP). WDM-U2-010 fixed WDM's own view only. | Hostile screenshot; frame test negative control. | Fixed in the kit (`orientSectionCurves` on read); header note "stored bottom-up: read top-down". |
| WC-U1-004 | S3 | PL1, PL6 | Correlation lines ran from column centre to column centre, over the logs, so a top appeared to cross the curves at a depth it is not at; equal columns had no gap for a line. | Screenshots 1366. | Fixed in the kit: 12% gap between equal columns, lines edge to edge, dashed across a well without the top. |
| WC-U1-005 | S3 | PL1, PL3 | TVDSS of a well with no KB equals TVD, and a well with no survey is drawn vertical, with no word in the section (the structure showed IDU 7 about 25 m low). Carried from WDM-U1-019. | Hostile TVDSS screenshot. | Fixed: "no KB: TVDSS = TVD" and "no survey: vertical" on the well header (`data-well-notes` in e2e). |
| WC-U1-006 | S2 | PL5, PL4 | A saved section this build cannot open (a newer build's row, or any load error) emptied the wells list, and Save then overwrote that row with an empty section. | Newer-build fixture: "0 / 0" wells. | Fixed: the section loads on its own; Save refuses with the reason. |
| WC-U1-007 | S3 | PL5, PL4 | A saved section naming a deleted or unshared well said "Restored saved section", counted 3 wells and drew 2. | Missing-well fixture. | Fixed: left out, counted, named in the status. |
| WC-U1-008 | S3 | PL2, PL8 | Tops spelled differently by two tools (TOP AGBADA, Top Agbada; "Base Seal ") were separate correlations, and renaming one onto the other was refused ("already exists"), so they could not be merged in the section. | Hostile IDU 11. | Fixed: the tops list marks spelling variants; rename onto an existing name merges, a well carrying both keeps both and is named (the WDM tops sheet rule). Pick and propagate compare names ignoring case. |
| WC-U1-009 | S3 | PL11 | The datum depth box snapped: clearing set the datum to 0, "1600." lost the point; a new flatten always sat the datum at 1,500 m whatever the data. | Test negative control ("0", "1500"). | Fixed: shared NumText; the datum starts at the chosen top's depth in the first well carrying it. |
| WC-U1-010 | S3 | PL7 | The PNG header was "Well Correlation · A · B · C": no datum, reference, unit, scale, date, build or author. | Code read. | Fixed: three caption lines (plotPng takes several lines fitted to the width); Report header (field, analyst) in the dock, saved with the section. |
| WC-U1-011 | S4 | PL1 | A stretched section's axis read "MD (m)". | Screenshot ST2. | Fixed: "stretched MD (m)". |
| WC-U1-012 | S4 | PL3 | Ghost curve shift and label in metres in a feet session. | Code read. | Fixed. |
| WC-U1-013 | S3 | PL4, PL5 | No unsaved-changes state (leaving lost the section silently); the ghost curve and nothing about the report were saved. | Walk. | Fixed: "unsaved changes" in the status bar until Save; ghost and report header ride in `track_layout` (jsonb, no migration). |
| WC-U1-014 | S3 | PL12, PL4 | The help guide described "Datum mode none" and "a depth datum" (neither exists), omitted Stretch, called Raw quicklook "every mnemonic" and the dock "Track details". | Guide read. | Fixed, with a guard test. |
| WC-U1-015 | S4 | PL3, PL4 | The path map drew wells from different CRSs in one frame without a word (ARLO in state-plane feet beside UTM) and would place an unlocated well at 0,0. | Hostile screenshot. | Fixed: caption names the frames and counts unlocated wells (WDM `mapFrameSummary`). |
| WC-U1-016 | S2 | PL2, PL9 | The Suite's tops door (WDM tops sheet paste, which feeds this app) read a "Depth (TVDSS m)" column as MD (IDU 9 went in 28 m high), and refused a Petra export (FMNAME, DEPTH) with no way to map its columns. | `topsChain.test.jsx` negative control. | Fixed at the door: TVDSS, TVD, elevation and time columns refused with the reason; FMNAME/FORM/PICK read as the top name. |
| WC-U1-017 | S3 | PL6, PL10 | 30 wells give 24 px columns and 50 give 14 px: headers overlap and tracks cannot be read; each repaint of 30 wells is a 2.6 s task (headless, software canvas). | e2e PL10; probe. | Open: Step 2 (U2-002, fixed-width columns with horizontal scroll and painting only visible columns). |
| WC-U1-018 | S3 | PL8 | No undo for a top drag, rename or delete (shared registry rows). | Walk. | Open: Step 2 (U2-007). |
| WC-U1-019 | S3 | PL8, PL2 | No tops import or export in the app; users go to the WDM tops sheet (which now refuses non-MD columns). | Walk. | Open: Step 2 (U2-004). |
| WC-U1-020 | S3 | PL8 | Propagate seeds at one MD; on a flattened or TVDSS section the practitioner expects the seed at the same displayed depth. | Walk. | Open: Step 2 (U2-005). |
| WC-U1-021 | S3 | PL1, PL8 | No TWT reference and no seismic horizons in the section, although checkshots and Seismolord horizons are in the registry. | Walk. | Open: Step 2 (U2-003). |
| WC-U1-022 | S4 | PL8 | Picks made here carry no interpreter or confidence (`saveTop` sends name and MD). | Code read. | Open: Step 2 (U2-010). |
| WC-U1-023 | S3 | PL8, PL5 | One section per user (the newest `geo_correlation_sections` row); no named sections. | Code read. | Open: Step 2 (U2-001). |
| WC-U1-024 | S4 | PL2 | A top repeated in one well (fault repeat) is drawn twice but correlates on the shallower only, without saying so. | IDU 11. | Open (U2-010 with pick attributes). |
| WC-U1-025 | S3 | PL6 | At 390 wide the workstation keeps its 1,000 px minimum and scrolls inside the shell. | Screenshot 390. | Closed by the WDM decision (2026-09-28): desktop-first, narrow must not break (e2e: no page scroll). |
| WC-U1-026 | S4 | PL3 | TVDSS assumes KB above mean sea level; no SRD or ground level. Carried from WDM-U1-026. | Schema. | Open: WDM U2-007 (migration, owner decision). |

16 findings fixed (5 S2, 8 S3, 3 S4), 9 open (6 S3, 3 S4), 1 closed by decision (025). No S1 was found and no S2 is open.

### Persona walks (PL8)

**1. Petrel well-section interpreter (brings a Petrel tops export and a LAS set).**
Pastes the Petrel tops (MD ft) in WDM's tops sheet: feet read from the header. Pastes a Kingdom file whose depth column is TVDSS: *before*, it went in as MD; *now* it is refused with the reason. Opens the section: ARLO wells are in US feet and OKAN in UTM; *before*, spacing by distance put two wells 13,500 km apart and three wells off the screen; *now* the columns stay equal and the status names the two CRSs. Switches to TVDSS: IDU 7 says it has no KB. Flattens on Top Agbada: the datum sits at the first well's pick. Sees TOP AGBADA and Top Agbada as two lines: the list flags them, rename merges them. Would now: hang the section on a seismic horizon or read it in TWT (U2-003), undo a drag (U2-007), keep several named sections (U2-001), scroll a 40-well section at a fixed column width (U2-002), snap a pick to the nearest GR inflection (U2-009).

**2. Graduate geologist picking tops for the first time.**
Picks Top Sand on three wells, propagates a marker: *before*, pressing Add without a depth put the marker at 0 m on every well (and in Seismolord and Mapping); *now* it asks for the depth and names wells it skipped. Leaves the page to ask a question: *now* the status bar said "unsaved changes" and Save keeps the ghost curve too. Reads the help: datum modes described as they are. Would now: see the pick's author and confidence (U2-010), load the supervisor's tops CSV in this app (U2-004).

**3. Manager reviewing a section in a meeting.**
Receives the PNG: *before*, a title and well names; *now* field, analyst, datum and flattening, TVDSS in ft, 1:1,890, template, date and build. Would now: a PDF plotted to scale with a legend of tops and fills (U2-006), a stratigraphic column beside the section (U2-008), the section opened read-only from a shared link (U2-001).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources (public documentation opened 2026-09-29): Petrel well correlation
([SLB](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/petrel-subsurface-software/petrel/petrel-geology-and-modeling/petrel-well-correlation)),
Petrel well section window training chapter ([HBS Numerics](https://hbsnumerics.com/attachments/Chapter-10-Well-Correlation.pdf)),
Petra cross sections ([brochure](https://cdn.ihs.com/www/pdf/Petra-2016-Cross-Sections.pdf), [user manual](https://petraftp.ihsenergy.com/Petraman.pdf)),
Kingdom geology ([brochure](https://cdn.ihsmarkit.com/www/pdf/Kingdom-2016-Geology-Brochure.pdf), [2023 what's new](https://onlinehelp.ihsmarkit.com/Energy/Kingdom/TKS_2023/Documents/Kingdom_2023_WhatsNew.pdf)),
OpendTect well correlation panel ([docs](https://doc.opendtect.org/6.6.0/doc/dgb_userdoc/content/well_correlation_panel/correlation_display_and_settings.htm)),
StrataBugs ([features](https://www.stratadata.co.uk/site/features.html)), NeuraSection ([Neuralog](https://www.neuralog.com/pages/neurasection)).
Rows marked (snippet) rest on search results only.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Flatten on a top | Petrel "Flatten on well top"; Petra stratigraphic hang, hotkey; Kingdom flexible flattening, hide wells without the top | Flatten on top, wells without it flagged; datum starts at the first well's pick (U1-009) | none | yes |
| Stretch, squeeze, slide | Petrel ghost stretch/squeeze; Petra stretch a log section, slide well | Stretch between two tops (ST2); one ghost curve with a shift | partial | yes |
| MD / TVD / TVDSS | Petra active datum (KB, GL, seismic datum) | MD, TVD, TVDSS through the survey; notes for no KB or no survey (U1-005); MSL only | partial (no SRD/GL) | no |
| TWT and time-depth | Kingdom one-click depth/time; Petrel TWT with ranked time-depth source (snippet); OpendTect picks in time or depth | none (checkshots are in the registry) | missing | yes |
| Seismic and horizons in the section | Petrel backdrop seismic, surfaces, grids; Kingdom picking over seismic; OpendTect HorizonCube | none | missing | yes (first thing a Petrel user looks for) |
| Fault cuts | Petra fault gaps, offset tops, fault-cut table | none | missing | yes, in faulted fields |
| Assisted correlation | Petrel automatic tops and ghost-dropped markers; Kingdom one-click interactive correlation | manual pick, drag, propagate (owner decision G3) | missing | yes |
| Tops pick, drag, propagate | Petrel create/edit well tops; Petra pick, move, next-top hotkeys | pick, drag, rename (now merges spellings), delete, propagate | none | no |
| Tops spreadsheet and QC | Petra spreadsheet with find/replace and CSV; Kingdom author and quality filters | WDM tops sheet (cross-well, paste, rename); none in this app | partial | yes |
| Zone fills, lithology | Petra interpretive colour fill between wells; Petrel discrete facies | fills between shown tops or a pair; lithology intervals as strip tracks (ST1) | partial (no fill between wells) | yes |
| Curve shading | Petra value shading, cut-offs, crossover; Petrel curve filling | template fills: crossover, threshold, ramp | none | no |
| Spacing | Kingdom true or fixed distance; OpendTect equidistant or scaled; Petra by map location | equal (now with a gap) or by distance (now CRS-aware) | partial (no fixed width with scroll) | yes |
| Many wells | Kingdom very large well sets; Petrel synchronised scroll | 50 wells load; columns 14 px, no horizontal scroll (U1-017) | worse | yes |
| Saved and named sections, templates | Petra save/load sections and templates; Petrel sections from the map; NeuraSection any number (snippet) | one section per user; track templates shared with Petrophysics | worse | yes |
| Print to scale | Petrel high-resolution well section viewport; Petra vertical scale in ft/in, header and footer | PNG with a header and a 1:N at 96 dpi (U1-010) | partial | yes |
| Export formats | StrataBugs PDF, SVG; Petra DXF, CSV | PNG | partial | yes |
| Section line on a map, corridor projection | Petra line-and-wells, line-and-corridor, deviated paths projected | click wells in order; no line or corridor | missing | yes |
| Pick author and quality | Kingdom author priority and quality filter; Petra tops source hierarchy | typed surfaces and confidence exist in the registry; picks here carry none | partial | no |
| Undo | Petra undo last top pick | none | missing | yes |
| Isochore maps from picks | Petra isopach with faults; Kingdom live maps | Map this top (structure in TVDSS); strat net maps between two tops (ST4) | partial | yes |
| Biostrat events, strat column | StrataBugs FDO/LDO events, graphic correlation | Stratigraphy Studio (biozones, ages, Wheeler) on the same section | none (in the sister app) | no |
| Shared registry, no re-import | Petrel one project; Kingdom one project | every pick is the registry row Seismolord, Mapping, Petrophysics and Stratigraphy read | ahead for a multi-app Suite | yes (our story) |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Named sections (name column exists) | WC wave 3, memory | Still wanted (U2-001) |
| Tops/zones CSV with MD/TVD/TVDSS | WC wave 3 | Still wanted (U2-004); the door now refuses non-MD columns, conversion through the survey is the step up |
| Ghost curve | WC wave 3 | Superseded: built in ST2; multi-log stretch and squeeze stays wanted (U2-015) |
| Horizon flattening | WC wave 3 | Still wanted, with horizons in the section (U2-003) |
| TWT reference | WC wave 3 | Still wanted (U2-003) |
| Fixed-width columns with horizontal scroll | WC wave 3, STATUS known limits | Still wanted, first (U2-002) |
| Second flattening (stretch) | WC wave 3 | Superseded: ST2 stretch datum |
| Upstream `sectionFrame.js` to petrolord-engines | WC wave 3 | Still wanted, low (U2-016) |
| Delete 72 stale `docs/WELL_CORRELATION_TOOL_*.md` and the orphan `src/utils/wellCorrelation/README.md` | WC memory | Still wanted, trivial (U2-014) |
| Auto-correlation | PLAN risks, owner decision G3 (manual v1) | Still wanted as assisted picking with a validation gate (U2-009); owner call |
| Rename and delete act by name across own wells, not per well | STATUS known limits | Dropped: drag covers per-well moves; rename now merges and names clashes |
| `well_correlation_projects` / `_wells` legacy tables | PLAN question 4 | Still open for the DB-cleanup effort (no action here) |
| Owner staging E2E of the section on live data | Geoscience roadmap | Still wanted, owner run |

### 2c. Suite integration

**Writes:** `geo_wells_tops` (pick, drag, rename, delete, propagate; owner-only RLS), `geo_correlation_sections` (one row per user; datum, order, `track_layout` now also carrying ghost and report header). `.pld`: `geo_correlation_sections` is a family (`geoscienceSpec.js`), tops travel with wells.
**Reads:** `geo_wells` (header, survey, KB, CRS), `geo_wells_logs` and curve objects (curves cache with Petrophysics unit normalisation), `geo_wells_tops` (typed surfaces, ages), `geo_wells_intervals` (lithology strips).
**Consumers of its tops and sections:** Seismolord (well ties, tops to horizons), Mapping (Map this top, strat maps), Stratigraphy Studio (same section row, same kit), Petrophysics (tops as zone boundaries), Earth Modeling and ReservoirCalc Pro through Mapping surfaces, Basin via Stratigraphy.

| Finding | Kind | Detail |
|---|---|---|
| Seismolord horizons and checkshot TWT not in the section | upstream ignored | Horizons picked in Seismolord and the wells' checkshots are in the registry; the section cannot show a horizon at each well or plot in TWT. U2-003. |
| Petrophysics zones and pay flags not on the tracks | upstream ignored | `geo_wells_zones` (published net pay, PHIE, Sw) and published PAY/PHIE curves are in the registry; the section shows raw logs only. A pay flag track and zone summaries would make the section the field overview. U2-008. |
| Stratigraphy units not drawn beside the section | upstream ignored | `geo_strat_units` names the intervals between typed tops; the section colours zones by the upper top name only. U2-008. |
| Isochores from two picks | downstream not fed | Mapping grids one top (structure) or net between two tops (ST4) but there is no isochore (thickness) launcher from a zone. U2-013. |
| Section as a shared artefact | handoff loses context | Sections are owner-only and one per user; a manager cannot open the geologist's section, and Seismolord cannot show the section path. U2-001. |
| Tops door refuses non-MD depths | handoff loses context | Fixed as a refusal (U1-016); converting TVDSS tops through the survey closes it (U2-004). |
| Site datum and SRD | handoff loses context | TVDSS assumes MSL (WDM U2-007 deferred). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-002 | Fixed-width columns with horizontal scroll, depth axis pinned, only visible columns painted | M | A 40-well regional section reads like Petrel's instead of 14 px slivers | A |
| 2 | U2-001 | Named sections: list, new, duplicate, rename, delete (more rows in `geo_correlation_sections`, no schema change) | M | Several sections per project, the first thing a Petrel user saves | A |
| 3 | U2-007 | Undo for drag, rename, delete and propagate of tops (session stack by top id) | S | A mis-drag in a demo is one click to revert | A |
| 4 | U2-006 | PDF plotted to scale (ft/in or 1:N), header, legend of tops and fills, vector | M | The printed panel a manager signs | A |
| 5 | U2-004 | Tops import and export in the app: CSV with MD, TVD, TVDSS (converted through the survey), TWT column out | S | Brings the Petrel/Kingdom tops file straight into the section | A |
| 6 | U2-005 | Propagate at the same displayed depth (flattened or TVDSS), and propagate from a picked top | S | Seeds land near where they belong on a flattened section | A |
| 7 | U2-014 | Explorer filter and select-many for 50+ wells; delete the 72 stale WELL_CORRELATION_TOOL docs and the orphan README | S | Usable well list at field scale; clean repo | A |
| 8 | U2-003 | TWT reference from checkshots and Seismolord horizons drawn at each well (flatten on a horizon) | M | The seismic link a Petrel user expects, without a seismic backdrop yet | B |
| 9 | U2-008 | Petrophysics pay flag and zone summary tracks, Stratigraphy unit strip beside the section | M | The section becomes the Suite's field overview | B |
| 10 | U2-012 | Section line on the map: draw a line or corridor, project deviated wells onto it | M | Petra-style regional sections from the map | B |
| 11 | U2-013 | Isochore map launcher from a zone (two tops) to Mapping | S | Picks to thickness map in one click | B |
| 12 | U2-010 | Pick attributes: interpreter and confidence on picks, repeated-top handling | S | Who picked it and how sure, as Kingdom filters on | B |
| 13 | U2-009 | Assisted picking: snap to the nearest log inflection, ghost cross-correlation lag suggestion (engine with a validation gate) | M | Faster picking without black-box auto-correlation | B |
| 14 | U2-011 | Fault cuts: fault gap markers, tops offset across faults (needs a registry decision) | L | Honest sections in faulted fields | C |
| 15 | U2-017 | Seismic backdrop along the section path from a Seismolord volume | L | The Petrel picture; heavy (brick reads along an arbitrary line) | C |
| 16 | U2-015 | Multi-log ghost with stretch and squeeze | M | Petrel ghost parity | C |
| 17 | U2-016 | Upstream `sectionFrame.js` to petrolord-engines | S | One geometry home | C |
| 18 | U2-018 | SRD and ground level in TVDSS (after WDM U2-007) | S | Correct datums offshore and on land | C |

Batch A (demo-visible, NAPE-safe, no schema change): U2-002, U2-001, U2-007, U2-006, U2-004, U2-005, U2-014.
Batch B: U2-003, U2-008, U2-012, U2-013, U2-010, U2-009 (U2-010 may need confidence values agreed; no DDL expected).
Batch C: U2-011, U2-017, U2-015, U2-016, U2-018 (U2-011 and U2-018 need registry decisions).

### Owner questions

1. Assisted picking (U2-009): the G3 plan kept correlation manual. Is a snap-and-suggest tool (the user still accepts every pick) acceptable for batch B?
2. Named sections (U2-001): owner-only as today, or also readable by the organisation (an RLS change, second-engineer review)?

## Batch decision (programme lead, 2026-09-29)

Recorded verbatim.

BUILD in this order, one commit per item:
- Batch A: U2-002 fixed-width columns with horizontal scroll; U2-001 named sections (owner-only visibility: no RLS change; many sections per user); U2-007 undo; U2-006 PDF plotted to scale (true 1:N vertical scale, header as in the PNG, read back with pdftotext in a test); U2-004 tops CSV import/export in MD/TVD/TVDSS (hostile-file tested; reuse the WDM tops door rules); U2-005 propagate at the displayed depth; U2-014 well-list filter plus deleting the 72 stale docs (list them in the commit body; delete only docs that are verifiably stale for Well Correlation).
- Batch B: U2-003 TWT from checkshots plus Seismolord horizons in the section (read-only from the existing registries); U2-008 Petrophysics pay and zone tracks plus the Stratigraphy unit strip; U2-012 section line and corridor on the map; U2-013 isochore launcher to Mapping; U2-010 pick attributes (interpreter, confidence, date) stored without a schema change if the existing row allows it, otherwise defer and say so; U2-009 assisted picking as SUGGESTIONS ONLY (decision: correlation stays interpreter-driven; the app proposes a pick with its reason and the user accepts or rejects each one; nothing is written without acceptance).
- Batch C: U2-015 multi-log ghost.
DEFERRED: U2-011 fault cuts (L) and U2-017 seismic backdrop (L), both to be revisited with Seismolord (app #5); U2-018 SRD datum (tied to the WDM datum-model migration U2-007); U2-016 moving sectionFrame into petrolord-engines (no user value before NAPE).
Owner questions decided: assisted picking = suggest-only as above; named sections stay owner-only (org sharing would need an RLS change and a second engineer).

Branch `feat/wc-u2`, one PR. Build log per item below.

### Build log (Step 2)

| ID | Status | Proving test | Notes |
|---|---|---|---|
