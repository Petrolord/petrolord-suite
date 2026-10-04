# EOR Screening: upgrade (Reservoir round, app 11)

Branch `feat/eor-u1`, worktree `/root/wt-res-eor`, started 2026-10-04 at
origin/main 534a12b5a. Plan: `docs/scope/AppUpgrade-Reservoir-PLAN.md` row 11.
Lens: PL1 to PL12 (`docs/scope/AppUpgrade-BestPractices.md`) and RL1 to RL12
(`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`). Finding IDs
`EOR-U1-nnn`, severities S1 (wrong answer a user would trust) to S4 (cosmetic).

Route `/dashboard/apps/reservoir/eor-screening` (+ `/help`), page
`src/pages/apps/EorScreeningTool.jsx`, engine
`src/utils/eorScreeningCalculations.js` (not in the canonical engines repo,
so no engines PR), harness `/dev/studio/eor`.

## 1. Validation sources (PL1)

The criteria were read against the papers as printed, from the PRRC copies
(New Mexico Petroleum Recovery Research Center, the authors' institute):

| Ref | Edition | Pages | What the engine takes from it |
|---|---|---|---|
| Part 1 | Taber, Martin and Seright, "EOR Screening Criteria Revisited, Part 1: Introduction to Screening Criteria and Enhanced Recovery Field Projects", SPE Reservoir Engineering 12 (3), August 1997 (SPE-35385-PA) | 189-198; Table 3 on p. 191 | Every limit of eight methods (Table 3, "Summary of screening criteria for EOR methods"); notes b, c, d; the underlined project averages (context only); the 13 API Turkish immiscible project (p. 192) |
| Part 2 | Taber, Martin and Seright, "EOR Screening Criteria Revisited, Part 2: Applications and Impact of Oil Prices", SPE Reservoir Engineering 12 (3), August 1997 (SPE-39234-PA) | 199-205; Tables 3 to 5 on pp. 200-201 | CO2 miscible minimum depth by oil gravity (Table 3); "sandstones preferred", "< about 9,000 ft", "< 200 F" for the chemical floods (Table 4); polymer "can be used in carbonates", "< 200 F" (Table 5); four successful polymer projects (Table 5) |

What the code said before this round: "Tables 1-3" of a single paper. The
summary is Table 3 of Part 1; Table 1 there is the list of methods. The
depth-by-gravity table the summary points to ("see Table 3 of Ref. 16") is
in Part 2 and was not applied.

Printed oddities, read and recorded rather than silently corrected:

| Where | As printed | Read as | Why |
|---|---|---|---|
| Part 1, Table 3, micellar/polymer depth | "> 9,000 \ 3,250" | < 9,000 ft | Part 2, Table 4: "< about 9,000 ft"; the arrow points down |
| Part 1, Table 3, micellar/polymer temperature | "> 200 \ 80" | < 200 F | Part 2, Table 4: "< 200" |
| Part 1, Table 3, polymer temperature | "> 200 \ 140" | < 200 F | Part 2, Table 5: "< 200 to minimize degradation" |
| Part 2, Table 3, CO2 bands | "> 40" then "32 to 39.9" | 40.0 API in the 2,500 ft band | 40.0 sits in neither printed band; the lighter band is the paper's direction |

Not encoded: surface mining (a mining method, outside an in-situ screen),
and composition (the app has no composition input; the guide is printed
and the criterion says it is not screened).

## 2. Step 1 checks

Browser: Playwright (one worker) on the private harness `/dev/studio/eor`
(port 8630), signed out, 1366x768, 1440x900 and 390 wide, light and dark;
the walk is `e2e/eor-screening-upgrade.spec.js` (10 tests with the T1 spec,
all green locally). Code: every module of the app read.

| Check | Result | Evidence |
|---|---|---|
| PL1 labels and textbook | Fixed: three published rules were missing or overstated (EOR-U1-002 to 005); citation per criterion (006); "typical" renamed project average (015) | `src/utils/eor/__tests__/eorValidation.test.js` probes every published limit through the engine, with a negative control |
| PL2 hostile files | NA: the app has no import door (eight numbers and a lithology) | |
| PL3 units, datums | Fixed (011): Suite unit profile, oilfield or SI, criteria compared in oilfield with a tolerance; depth reference stated, no correction | `eorUnits.test.jsx` pins one value per conversion |
| PL4 no claim without the event | Pass after fixes: "Qualified" needs every screened criterion; "Marginal" and "Not screened" counts shown (016); save status from the save; "Saving is not switched on" when the table is missing | `eorSharing.test.jsx` |
| PL5 real saved state | Fixed (007, 010): saved projects, record sharing, `.pld` family, a saved fixture of this release; the table is a migration file NOT APPLIED | `eorSharing.test.jsx`, `eorSavedFixture.test.js`, `eorPortability.test.js` |
| PL6 real browser | Pass: no page errors, no sideways scroll at any width, chart white with the mark in dark; 390 is a long scroll (017, open) | screenshots under `test-results/eor-upgrade/` |
| PL7 report a reviewer can sign | Fixed (001): the report on the kit | `eorReport.test.jsx` (goldens, read-back) |
| PL8 practitioner's day | Walked: screen a candidate from the field's PVT, test and MBAL case, read why each method fails, sign the PDF. Gaps go to Step 2 (MMP, newer criteria, many reservoirs at once) | section 4 |
| PL9 the chain | Fixed (012): pvt-1, wta-1, mbal-1 read by id, kept with the project, cards with "edited after intake" and "source changed since"; chain e2e | e2e `PL9 chain` |
| PL10 real scale | NA: one reservoir, eight numbers | |
| PL11 typable inputs | Pass: `useDraftInput` in every converted field ("1371." stays, blank stays blank); sample labelled (008); unit-draft guard at zero | `eorUnits.test.jsx`, `tools/__tests__/unitDraftGuard.test.js` |
| PL12 house standards | Pass: no em dash on the page, the help or the PDF; `EMPTY_VALUE`; design roles; route already protected (PR #828) | e2e checks the page text |
| RL1 inputs with unit and source | Fixed (009): every input, sample values as assumptions, intakes with project and method, edits after intake | completeness guard with a negative control |
| RL2 composites | Pass: transmissibility kh/mu prints beside its three inputs | |
| RL3 lumped results split | Pass: each method criterion by criterion; pass + marginal + fail closes on the screened count | `eorReport.test.jsx` |
| RL4 identification | Fixed: company, field, licence, reservoir, wells, data date, analyst, analysis type, criteria edition, depth reference, units, build | |
| RL5 data and operations | NA: no time series | |
| RL6 every result has its plot | Fixed: share passing by method (bars on the kit) and gravity against depth with the CO2 step line; each says why when it does not apply | `expectFigureDrawn`, `expectFigureStatement` |
| RL7 basis named | Fixed: units line, criteria compared in oilfield, depth reference, project averages named as 1996 means | |
| RL8 keep strengths, claim only what happened | Pass: blank inputs still unscored; marginal never counted as a pass | |
| RL9 limits printed | Fixed: limits block (screening is not design; 1996 data; Permian Basin oils for the CO2 depths; single values; inclusive limits) and flags | |
| RL10 import doors | NA | |
| RL11 every intake has a sender | Fixed for the three intakes; no app reads EOR results yet, so the sender out is Step 2 (U2-003) | |
| RL12 screen, report, project one model | Pass: the report model is built from the engine result the screen shows; save and reopen gives the same outcomes | `eorSharing.test.jsx` |

## 3. Findings

| ID | Sev | Check | Finding | Fix | Test |
|---|---|---|---|---|---|
| EOR-U1-001 | S2 | PL7, RL4, RL6 | No report and no export of any kind | Report on the shared kit: identification, ranking with its basis, inputs with sources, criteria edition, CO2 depth table, each method criterion by criterion with the reason and the table, limits, flags, two figures; 8 pages for a full case | `eorReport.test.jsx` (5 goldens, read-back), e2e report door |
| EOR-U1-002 | S2 | PL1 | CO2 miscible used the 2,500 ft summary minimum for every oil. Part 2, Table 3 raises it by gravity (2,800 / 3,300 / 4,000 ft). A 25 API oil at 3,000 ft qualified; it now fails | `depthByGravity` in the engine | `eorValidation.test.js`, with the negative control |
| EOR-U1-003 | S2 | PL1, RL8 | "Sandstone preferred" was scored as a fail on carbonate for the chemical floods; Part 2 says preferred, and for polymer "can be used in carbonates". **Changes the sample:** micellar/ASP goes from screened out to marginal | `marginal` verdict and outcome | `eorScreeningCalculations.test.js` (old assertion turned) |
| EOR-U1-004 | S2 | PL1 | Transmissibility notes c and d (kh/mu above 20 and 50 md-ft/cp) were not applied. A 5,000 cp oil in 80 ft of 1.5 D qualified for steam at 24 md-ft/cp. **Changes counts:** combustion 6/9, steam 5/8 on the sample (both still screened out) | transmissibility criterion | both test files |
| EOR-U1-005 | S3 | PL1 | Note b (polymer in carbonate above 3 md for a fracture sweep) not applied | marginal between 3 and 10 md on carbonate | `eorValidation.test.js` |
| EOR-U1-006 | S3 | PL1, RL9 | Citation "Tables 1-3" of one paper; the summary is Table 3 of Part 1, and the printed "> 9,000" and "> 200" were read as upper limits silently | source per criterion; readings recorded in section 1, the report and the help | `eorReport.test.jsx` |
| EOR-U1-007 | S2 | PL5, RL12 | Nothing saved: a reload lost the screening | saved projects through `createSavedProjectsService`; migration `20261004220000_saved_eor_screening_projects.sql` NOT APPLIED; until then the bar says saving is not switched on | `eorSharing.test.jsx` |
| EOR-U1-008 | S3 | RL1, PL11 | The sample opened unlabelled as if it were the case | sample note on the card, sample values print as assumptions | `eorReport.test.jsx` |
| EOR-U1-009 | S3 | RL1 | No source for any input | the shared source control under each input | completeness guard |
| EOR-U1-010 | S3 | PL5 | No record sharing | own and shared projects, view, edit with check-out, Save a copy | `eorSharing.test.jsx` |
| EOR-U1-011 | S3 | PL3, RL7 | Oilfield only; depth reference not stated | unit profile, SI, depth reference | `eorUnits.test.jsx`, e2e PL3 |
| EOR-U1-012 | S3 | RL11, PL9 | Gravity, viscosity and temperature typed although Fluid holds them; k typed although Well Test holds it | pvt-1, wta-1, mbal-1 by id; viscosity read at the stated reservoir pressure from the project's table, never extrapolated | `eorReport.test.jsx`, e2e chain |
| EOR-U1-013 | S3 | PL1 | Formation "Other / unconsolidated" mixed unconsolidated sand (a thermal candidate) with other rocks, and could not be returned to blank | four options plus Not given; a lithology the gas table does not name is marginal | `eorValidation.test.js` |
| EOR-U1-014 | S4 | PL3 | A converted value on a limit compared with no tolerance | relative 1e-9 in `atLeast`/`atMost` | `eorValidation.test.js` |
| EOR-U1-015 | S4 | PL1 | Underlined values called "typical"/"preferred"; the paper says approximate mean of current projects | "project average" | |
| EOR-U1-016 | S3 | RL8 | The method row hid how many criteria went unscreened, so a sparse case read 100% | "n not screened (no input)" on the row and a report column | e2e T1 |
| EOR-U1-017 | S4 | PL6 | At 390 the results come after the inputs and the intakes (a long scroll) | open, Step 2 U2-012 | |
| EOR-U1-018 | S3 | PL1 | Composition is shown and never screened | kept and said so on screen and in the report; Step 2 U2-009 | |
| EOR-U1-019 | S4 | PL7 | The flags heading can sit alone on the page before the figures | open (kit layout), U2-014 | |
| EOR-U1-020 | S4 | PL12 | Help said nothing is saved, oilfield only, formation cannot be blanked | help rewritten | help guide tests |

No S1. Six S2, all fixed. 17 of 20 fixed; 017, 018, 019 open with Step 2 items.

## 4. What changes for users

- Sample (32 API, 5,200 ft carbonate): still 3 of 8 qualify; micellar/ASP is
  now Marginal (was Screened out); combustion reads 6/9 and steam 5/8 with
  the transmissibility criterion. T1 e2e updated on purpose.
- Any CO2 case under 40 API at a depth between 2,500 ft and its gravity band
  now fails CO2 miscible.
- Viscous thermal cases with kh/mu under 50 (steam) or 20 (combustion) now fail.

## 5. What the gap matrix had wrong

- The plan called the app "sound on screen". Three published rules were not
  applied and one was overstated (002 to 004), and the citation pointed to
  the wrong table. The matrix graded RL9 "good on screen" from the citation
  string; the engine was never held against the paper.
- RL8 "honest on screen" missed that "preferred" was scored as a fail.
- The rest held: no report, nothing saved, no identification, sample
  unlabelled, composition never screened.

## 6. Where validation is weaker than asked

- No primary source publishes one field screened on all eight criteria. The
  field cases are the four polymer projects of Part 2, Table 5 (two printed
  properties each, all must not be screened out) and Bati Raman, the 13 API
  immiscible CO2 project Part 1 names, with properties from a secondary
  summary (12 API, 450 to 1,000 cp, about 1,310 m, limestone): it qualifies
  for immiscible gas at 450 cp and fails at 1,000 cp, on the 600 cp limit.
- Aladasani and Bai (2010, SPE-130726) was not encoded or checked: the app
  does not claim it and the paper was not available.
- The Part 1 scan is OCR; every limit was read from the page image, not the
  text layer.

## 7. Step 2 analysis

### 2a Competitor parity (from public descriptions; vendor documentation
was not read in this session, so each item is what such tools are known to
offer, to be confirmed before building)

- Several criteria sets side by side (Taber 1997, Aladasani and Bai 2010,
  later updates) with the edition per criterion.
- A minimum miscibility pressure check against reservoir pressure for gas
  methods (published MMP correlations; compositional where a fluid model exists).
- Screening many reservoirs at once (portfolio tables, import door).
- Analog databases: where the reservoir sits in the range of field projects
  per method, not only inside or outside a limit.
- Quick performance estimates after screening (the DOE CO2 Prophet style
  streamtube model) and a hand-off to simulation.

### 2b Deferred backlog

From the plan row: composition screened; newer criteria sets. From Step 1:
017, 018, 019; remaining oil saturation from Material Balance (today typed).

### 2c Suite integration

No app reads EOR results. Natural readers: Recovery Factor Estimator (an
EOR increment band by method), Reservoir Simulation Studio (a polymer or
solvent starting deck), Petroleum Economics Studio through
`calculateEconomics` only. Upstream senders: Fluid, Well Test and Material
Balance can deep-link with `?fluidProject=`, `?wellTestProject=`,
`?mbalCase=` (the receiver is built; the buttons are not).

### Ranked backlog

| ID | Item | Size | Batch |
|---|---|---|---|
| EOR-U2-001 | CO2 (and HC, N2) MMP check against reservoir pressure, beside the Taber depth proxy; a published correlation validated on its own data; pressure from mbal-1 or wta-1 | M | A |
| EOR-U2-002 | "Send to EOR Screening" buttons in Fluid, Well Test and Material Balance (deep links; receiver exists) | S | A |
| EOR-U2-003 | `eor-screen-1` sender saved with the project; Recovery Factor reads it by id | S | A |
| EOR-U2-004 | Aladasani and Bai (2010) criteria beside Taber 1997, selectable, edition per criterion (needs the paper) | M | A |
| EOR-U2-005 | Remaining oil saturation from mbal-1 with Swi from kr-1 or Petrophysics, method printed | M | B |
| EOR-U2-006 | Range of field projects per method (Part 2 "range of current projects") shown beside each limit | S | B |
| EOR-U2-007 | Distance to each limit shown as information (the paper's own fuzzy-boundary remark), never a score | S | B |
| EOR-U2-008 | Composition screened from a compositional pvt-1 (C1 to C7, C2 to C7, C5 to C12) | S | B |
| EOR-U2-009 | Many reservoirs at once: table, CSV/xlsx door on the shared reader, hostile set, one report | M | B |
| EOR-U2-010 | Methods outside Taber 1997 (WAG, low salinity, gels) only with a published source | M | C |
| EOR-U2-011 | Polymer or solvent starting deck to Simulation | L | C |
| EOR-U2-012 | Results first at narrow widths (U1-017) | S | C |
| EOR-U2-013 | CO2 utilisation and an incremental band to EPE through `calculateEconomics` | M | C |
| EOR-U2-014 | Kit layout: keep the flags heading with its text (U1-019) | S | C |

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Apply `20261004220000_saved_eor_screening_projects.sql`? | Yes, staging first, with the next migration batch; until then saving says it is not switched on |
| 2 | The sample's micellar/ASP verdict moves from screened out to marginal, and two counts change. Release note? | Yes, one line in the release note; NextGen material that quotes EOR counts to be checked |
| 3 | Supply Aladasani and Bai (2010), SPE-130726? | Build U2-004 only with the paper in hand; Taber 1997 stays the default |
| 4 | Which MMP correlation for U2-001? | One published correlation with its own validation data in the paper (for example Yellig and Metcalfe 1980 for CO2); the report names it and its range |
| 5 | First reader of `eor-screen-1`? | Recovery Factor Estimator, after its U1 merges |
| 6 | Many-reservoir screening (U2-009) before NAPE? | No: after NAPE |

## 8. Batch decision (programme lead, 2026-10-04)

Recorded verbatim.

Owner-question defaults in force: migration staging first (owner); the moved sample counts announced in the release note; Aladasani and Bai built only once the paper is in hand (deferred); MMP from one published correlation with its own validation data; Recovery Factor is the first reader of eor-screen-1 (after RF U1 merges); many-reservoir screening after NAPE.
BUILD in this order, one commit per item:
- Batch A: U2-001 MMP check against reservoir pressure for CO2 (and N2/hydrocarbon if the same source covers them): one published correlation whose paper you can actually read with its own data (e.g. Yellig and Metcalfe 1980 for CO2; or Alston, Kokolis and James 1985, or Cronquist 1978, whichever you can read), validated against that paper's tabulated measured MMPs within the paper's stated error, negative control; the screening states miscible or immiscible by MMP vs reservoir pressure, with the correlation, its range and its error in the report; U2-002 "Send to EOR Screening" buttons in Fluid, Well Test and Material Balance (open EOR with the source by id, following the Send-to-Simulation pattern); U2-003 the `eor-screen-1` read-by-id contract (methods, pass/marginal/fail per criterion, inputs with sources, criteria edition, MMP result, fingerprint), documented, with a contract test; no RF reader yet.
- Batch B if time remains: U2-007 distance to each limit (how far each input sits from each published limit, in the report); U2-006 range of published field projects per method (Taber Part 1 tables as printed, with page); U2-008 composition from pvt-1 where Fluid holds one (feeding the MMP correlation if it needs C5+ MW or volatile/intermediate fractions); U2-005 remaining oil saturation from mbal-1.
- DEFERRED (record reasons): U2-004 Aladasani and Bai (needs the paper), U2-009 many reservoirs (after NAPE), all of Batch C.

Branch `feat/eor-u2`, worktree `/root/wt-res-eor2`, started 2026-10-04 at
origin/main 55e22d372. The build log per item follows in section 9.

## 9. Step 2 build log

| ID | State | What was built | Proving test |
|---|---|---|---|
| EOR-U2-002 | Done | "Send to EOR Screening" in Fluid Systems Studio (Integration Suite, saved project only), Well Test Analysis Studio (Report tab; saves first, then sends; unsaved workspace disabled) and Material Balance Studio (Run tab, oil cases, current run only). Each opens EOR with the record named by id (`src/lib/eorScreeningLinks.js`, harness-aware); EOR chooses it and says it was sent here; Take values reads it by id. No router state | `src/lib/__tests__/eorScreeningLinks.test.js` (with the no-id negative control), `src/components/welltest/__tests__/reportPanelSendEor.test.jsx` (save first; failed save does not navigate), `fluidUpgradeUi.test.jsx` (unsaved fluid not sent), e2e `U2-002 sent here` and the MBAL sender test |
| EOR-U2-003 | Done | The `eor-screen-1` read-by-id contract, `src/lib/eorScreenSource.js` (every field documented in its header): project and identification, criteria edition, oilfield units, depth reference, every input with its unit, whether it is screened, and its source words; each method ranked with outcome, counts and pass/marginal/fail/na per criterion with the required range, the value, the side, the table and the reason; the MMP check (U2-001); an FNV-1a content fingerprint (not over who read it or when). Built on read from the saved inputs by the same engine as the screen and the report; `?eorProject=<id>` names the project; a missing table reads "not switched on yet". The project card says what a reader gets. No reader yet: Recovery Factor reads it in its own Step 2 | `src/lib/__tests__/eorScreenSource.test.js` (8 tests: verdicts equal the engine and the report ranking; sources; SI stays oilfield; sample flag; fingerprint stable over time and changed by an input; negative controls: tampered outcome and miscounted record fail validation; reader by id with not found, unnamed, table missing, no inputs) |
| EOR-U2-001 | Done (source differs from the examples, see 9a) | CO2 MMP check against reservoir pressure, `src/utils/eor/mmp.js`: Zhu et al. (2025) Model 9, MMP from temperature and the C1+N2 and C2-C10 (with CO2) fractions of the oil; two new context inputs (mol %); miscible or immiscible with the margin, "within the error of the correlation" when the margin is under its largest deviation (2.05 MPa), inputs outside the paper's data flagged as extrapolated; a card on the Screening tab, a report table (equation, inputs, MMP, pressure, margin, verdict, data range, error, scope, reference), a limits line and flags; in `eor-screen-1`. Changes no Taber verdict. MMP in psia or kPa through the unit registry | `src/utils/eor/__tests__/eorMmp.test.js` (11 tests): the engine on all 12 rows of the paper's Table 2 reproduces MAE 0.4825 MPa, MAPE 2.53 %, RMSE 0.7494, H138 +2.05 MPa (11.07 %), 11 of 12 within 10 %; negative controls (coefficient +2 %, degF fed as degC, CO2 left out of the lump, Yellig and Metcalfe on the same oils lands at 26.1 % against the paper's 25.35 %); pinned 17.94 MPa = 2,602 psia = 17,940 kPa; printed range equals Table 2; report rows in oilfield and SI; e2e `U2-001 MMP` |

### 9a. The MMP source (U2-001)

Yellig and Metcalfe (1980, SPE-7477-PA), Cronquist (1978, DOE symposium)
and Alston, Kokolis and James (1985, SPE-11959-PA) could not be read:
OnePetro returns 403, and the OSTI records of the 1978 symposium and of
Alston have no full text. The batch decision asks for a correlation whose
paper can be read with its own data, so the app uses the one such paper
found: Zhu, Wang, Liang, Liu, Xu, Yang and Wang, "Prediction of the
Minimum Miscibility Pressure of the CO2-Crude Oil System in the Ordos
Basin", ACS Omega 10 (47), 2025, 57267-57276 (open access; full text at
PMC12676357, copy in `/root/eor-refs/zhu2025.xml`). Its Table 2 prints 12
slim-tube MMPs (10 measured by the authors, 2 from earlier studies; which
two is not marked), and its stated error is reproduced exactly by the
engine.

Weaker than a classic correlation in three ways, all printed in the
report: the data are 12 Ordos Basin black oils (43 to 92 degC); it covers
pure CO2 only (no N2, hydrocarbon gas or impure CO2, so U2-001 is CO2
only); and it needs the oil composition, which the app did not hold (two
context inputs added; U2-008 fills them from a compositional pvt-1). The
paper prints no page numbers in the copy read, so sections and tables are
cited. Owner item: supply SPE-7477-PA (Yellig and Metcalfe) to add the
classic temperature-only correlation beside it, validated on its own
table.
| EOR-U2-007 | Done | Distance to the limit on every criterion row of the Screening tab and the report (new column): the gap from the limit the verdict was judged on, in the display units (a temperature gap converts without its offset), above or below, minimum or maximum, and as a share of the limit; for a window the nearer end, for a fail the side it fails. Information only, never a score | `src/utils/eor/__tests__/eorDistance.test.js` (band limit for CO2 depth, windows, signs, SI temperature 18 degF = 10 degC, negative controls for blank, not critical and formation, ranking unchanged), goldens, e2e `U2-007` |
| EOR-U2-006 | Done | Range of current projects per method and criterion, `PROJECT_RANGES` in the engine, transcribed from the page images of Part 2, Tables 1, 2, 3, 5, 6 and 7 (pp. 200 to 203; the ranges are in Part 2, not Part 1), with "inside" or "outside" for this reservoir, a column on the Screening tab and in the report, and the table and page in each method's note. Recorded as printed: no range for the chemical floods (Table 4) or immiscible gas; the combustion temperature printed "100 to 22" (upper end not legible as a temperature, only the lower end used); nitrogen and hydrocarbon gravity ranges are of miscible projects. Context only, never scored | `src/utils/eor/__tests__/eorProjectRanges.test.js` (every printed value against an independent transcription, the gaps, inside/outside in oilfield and SI, outcomes unchanged), goldens, e2e `U2-006` |
| EOR-U2-008 | Partial | With the pvt-1 intake, a compositional Fluid project also gives C1 + N2 from its feed (normalised to 100 mol %, the project and method in the Source column). C2 to C10 is NOT taken: Fluid's feed lumps C7 and heavier into C7+, so C7 to C10 cannot be separated; the card prints the known part (C2 to C6 with CO2) as a lower bound and asks for the laboratory value. The MMP is therefore not made from Fluid alone. Composition is still not screened against Taber's composition guide (the guide is words, not limits) | `src/utils/eor/__tests__/eorComposition.test.js` (C1 + N2 from the saved fixture, normalisation, black-oil and empty feed refused, MMP not made from C1 + N2 alone, source text), e2e `U2-008` |
| EOR-U2-005 | Done (Swi typed; kr-1 or Petrophysics Swi not wired) | Remaining oil saturation from material balance, `src/utils/eor/remainingOil.js`: So = (1 - Np/N)(Bo/Boi)(1 - Swi), N and Np (last timestep) and the initial and last pressures from the mbal-1 intake, Bo and Boi from the pvt-1 intake's table at those pressures (never extrapolated), Swi a new stated context input. Refused for an aquifer, injection, no Np, or a pressure outside the table. Shown under the oil saturation field; "Use as the oil saturation" copies it with the method as its source, so the report's Source column prints N, Np, Bo, Boi, Swi and both projects | `src/utils/eor/__tests__/eorRemainingOil.test.js` (engine against the pore-volume statement computed separately; negative controls: aquifer, injection, no Swi, no series, pressure outside the table, no pvt intake), e2e `U2-005` (79.76 % PV on the harness case) |
