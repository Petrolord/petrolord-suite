# App upgrade best practices: the practitioner lens

Plan of record for Stage 1 of the comprehensive app upgrade programme
(`docs/scope/AppUpgrade-Geoscience-PLAN.md`). Written 2026-09-28.

Human testers found things our unit tests, harnesses and even the senior T1
audits did not. This document audits what they found, explains why we
missed it, and turns each lesson into a check we can run on any app before a
human ever sees it.

## 1. Audit: human feedback that changed our apps

Sources: STATUS/ROADMAP docs, git history and PR bodies, and the session
memory. About 110 individual human findings across 33 feedback events,
March to September 2026. Claude-found items (T1 audits, the Ekene demo kit,
harness runs, user-manual writing) are excluded, because the point is what
humans catch that we do not.

### 1.1 The events that mattered most

| Date | App | Who | What the human said | What changed |
|---|---|---|---|---|
| 08-02 | ReservoirCalc Pro | Owner E2E | Switching unit system turned 5,000 acres into 5,000 km² | Per-parameter units, values converted on toggle (#149) |
| 08-02 | ReservoirCalc Pro | User | Clearing a field snaps to 0; New project does nothing | Shared NumberField; Save had never worked at all (7481d0366) |
| 08-14 | Material Balance | Tester | Parsed the CSV, Run tab says "no data" | DataHub stays mounted; toast no longer implies a save (#168) |
| 08-14 | DCA | User | Fit succeeds but the line vanishes | One zero on a log axis killed the series (63acad09c) |
| 08-14 | ReservoirCalc Pro | Tester | Exported PNG/PDF text overlaps | html2canvas ignores ellipsis; clip in JS (#170) |
| 09-03 | Petrophysics / WDM | Petrel-user testers | Checkshots in MD + OWT; editable tops; exports in ft and TVDSS; standard D-N display; LAS 3.0 fails | PT0 to PT7 (#364 to #372), LAS 3.0 reader (#375) |
| 09-03 | Petrophysics | Owner staging E2E | Duplicate well names; black tracks; only alias-named curves show | Unique names in the registry; white tracks; every curve reachable (#361) |
| 09-03 | Well Design | Tester | Plan view 800,000 ft | Mismatched frames refused (`targetFrame.js`, #373) |
| 09-03 | Well Test | Tester | Log-log plots blank; legend over axis title | Wrapper forwards size; Playwright geometry check (#374) |
| 09-07 | Petrophysics | Testers | "PHIT or PHIE?" | **PHIE was PHIT**: the shale correction was never called (PT9a) |
| 09-07 | 11 drilling studios | Tester | A Well Design well shows only its name | Only "definitive" designs were read; drafts now fall back (#433) |
| 09-08 | Hydraulics, Cementing | Tester | "No hole sections" although casing exists | Sections derived from Casing & Tubing (#447) |
| 09-09 | Petrophysics | Testers | Permeability still missing after the fix | Old saved projects stored `none`; versioned state migration (#453) |
| 09-22 | Well Design | Lordsway tester | A 6.6° build drawn as a kink; Minna CRS "missing" | True-scale section; CRS picker browses by region (#570 to #574) |
| 09-22 | Seismolord | Testers | 4.5 GB survey never displays; toggles do not stick; wells silently absent | Bricked LOD viewer, stability, `WellDrawBadge` reasons (#575 to #589) |
| 09-28 | Well Test | External testers | CSV units and column order; pwf needs its time; "converged" with no regression; PDF lacks Field/Analyst | #810 |

The full catalogue (every event, with source files and PRs) is in
`docs/scope/AppUpgrade-HumanFeedback-Audit.md`.

### 1.2 What kind of thing humans find

| Category | Findings | Share |
|---|---|---|
| Workflow gap: a step practitioners take that the app lacks | ~20 | 23 % |
| Domain convention or meaning mismatch (incl. PHIE = PHIT) | 11 | 13 % |
| Visual defect a jsdom test cannot see (blank charts, overlap, aspect, exports) | 9 | 10 % |
| Misleading status, silent no-op, silent omission | 9 | 10 % |
| Import robustness (formats, column order, dates, LAS 3.0) | 7 | 8 % |
| Units, datums and reference frames | 7 | 8 % |
| Persistence and saved-state realism | 6 | 7 % |
| Cross-app handoff broken in real use | 4 | 5 % |
| Report missing metadata or labels | 4 | 5 % |
| Scale and performance on a real laptop | 3 | 3 % |
| Input typing, defaults, discoverability, data integrity | ~8 | 9 % |

Two thirds of human findings sit in the first six rows. None of them is a
wrong formula in an engine we had validated. Our validation-first engine
work holds up. What fails is everything around the engine: the words on the
screen, the files people really have, the order they really work in, and
what the app claims.

### 1.3 Why we missed them

1. **Tests pin what the code does, not what the label means.** The PHIE
   goldens passed; nobody asked whether the number called PHIE was
   effective porosity.
2. **Fixtures are clean and ours.** Harness files have our column order, our
   units, our small sizes and our local frames. Real files have psig,
   minutes, pressure first, day-first dates, LAS 3.0, UTM beside feet, 4.5 GB.
3. **Tests start from fresh state.** Real users open projects saved by an
   older version, work in drafts, switch tabs, and never press "Set
   definitive".
4. **Apps are tested alone.** The handoff from Casing & Tubing to Hydraulics
   had never run end to end.
5. **jsdom draws nothing.** An empty chart is the passing state in jsdom.
6. **We never walk the app as the practitioner.** A Petrel user expects to
   edit checkshots, drag tops, and read MD, TVD and TVDSS side by side. We
   only see the gap when one tells us.
7. **Status text is derived from the wrong event.** "Converged" came from
   the last auto-fit, not the current match.

The senior T1 audits caught a different class (engine edge cases, the RCP
3.28x unit error that three human rounds missed). Humans and T1 are
complementary. The practitioner lens below adds the human class to our own
process.

### 1.4 Fix patterns that worked

- **The tester's own case becomes the test** (section-scale 6.6° assertion,
  the PT8 e2e, the psig/minutes Well Test walk).
- **Real geometry in a real browser**: Playwright pixel positions, fixed-size
  container in jest, `data-*` geometry attributes.
- **Negative controls**: the test fails without the fix.
- **Fix at the shared layer** so every app gains (trajectory resolver, CRS
  picker, NumText, wells registry).
- **Say why instead of dropping silently** (source notes, `WellDrawBadge`,
  "skin withheld" with its reason).
- **Diagnose from live data first** (the real `petro_projects` row, the real
  wellbore, the survey's own headers).
- **Versioned migration of saved state**, not only a new default.
- **Carry findings forward** to the next app before its testers arrive.

## 2. The practitioner lens: twelve checks

Run all twelve on an app as Stage 1. Each check names the audit rows it
comes from and how to exercise it without a human. Findings use IDs
`<APP>-U1-<nnn>` in `docs/upgrade/<App>-UPGRADE.md`.

### PL1. Every label means what the textbook says
For every displayed quantity, write its standard definition (SPE, SPWLA,
PRMS, API) beside the code that computes it, and confirm they are the same
thing. Check vocabulary against the discipline: P90 as exceedance on
outcomes only; PHIT vs PHIE; gross vs net; TVD vs TVDSS; psia vs psig.
*From:* PHIE = PHIT, P-label conventions, RCP "Gross Thickness".
*How:* a quantity table in the upgrade doc; one jest test per quantity that
calls the engine on a case where the distinction matters (shaly sand for
PHIE, gas cap for GRV).

### PL2. The hostile file set
Import at least the following for every importer, built as fixtures under
`e2e/fixtures/<app>/hostile/`:
- columns in a different order, extra columns, headers with units in them;
- every unit the discipline uses (psig/psia/kPa/bar, min/hr/day, ft/m,
  MD/TVD/TVDSS, OWT/TWT);
- no header; comma decimals; day-first dates and date-time stamps;
- the older and newer format versions (LAS 2.0 and 3.0, SEG-Y rev 0/1/2);
- a vendor export from the competitor tool (Petrel, Techlog, Kingdom);
- one file at the real size a customer has.
After import the app shows what it read (columns, units, row count, rows
skipped) and lets the user correct it.
*From:* Well Test CSV, LAS 3.0, MBAL dates, Seismolord 4.5 GB, xlsx surveys.

### PL3. Units, datums and frames at every door
Every input states or lets the user choose its unit. Values convert at the
door and state is stored in one system. Every export honours the display
unit. Depths state their reference (MD, TVD, TVDSS, KB, GL, MSL); pressures
state absolute or gauge; coordinates state their CRS, and mismatched frames
are refused with a reason. Switching the unit system converts values, it
never relabels them.
*From:* 5,000 acres to km², 800,000 ft plan, Minna CRS, psig.
*How:* toggle the unit system mid-session and diff every number; import a
file in the "other" system.

### PL4. No claim without the event
Every status word (loaded, saved, converged, definitive, validated, synced)
must come from the event it names, and must go away when that event no
longer describes the state. Nothing is dropped silently: a skipped row, an
undrawn well, a withheld value all say why. Every button either works or is
disabled with a reason.
*From:* "converged" after a manual match, parse toast implying a save, fake
Save, wells silently absent, DCA upload with no confirmation.
*How:* for each status string, a test that performs the event, then undoes or
supersedes it (move a slider, edit data) and asserts the status changes.

### PL5. Real saved state
Test with: a project saved by the previous release; a draft that was never
marked final; a reload mid-workflow; a tab switch after import; two browser
tabs. Changing a default ships with a versioned migration of saved state.
*From:* permeability still missing (stored `none`), drafts invisible to 11
studios, MBAL tab switch, C&T unsaved drafts.
*How:* keep one saved-project fixture per release in
`e2e/fixtures/<app>/saved/` and open it in the e2e.

### PL6. Look at it in a real browser
Playwright at 1366x768, 1440x900 and 390 wide, light and dark. Charts are not
blank; legends clear axis titles; depth axes run downward; sections are true
scale or show their vertical exaggeration; the house chart standard (white
chartTheme, ChartLogo) holds; PNG and PDF exports are opened and read, not
just produced.
*From:* blank log-log, legend overlap, kink-drawn build, overlapping export
text, black tracks.
*How:* geometry assertions in e2e (the Well Test and Well Correlation specs
are the model) and a screenshot review of every tab.

### PL7. The report a reviewer can sign
The PDF/print output carries the identity a reviewer needs: company, field,
well, analyst, date, software version, unit system, datum, and every input
that changed the answer with its time and source (for example "pwf at shut-in
time 0 hr, gauge clock 6 hr"). Text is Latin-1 safe for jsPDF standard fonts.
Numbers match the screen to the displayed precision.
*From:* Well Test Field/Analyst, RCP export overlap.
*How:* open the exported PDF with `pdftotext` in the e2e and assert the
header fields and three headline numbers.

### PL8. The practitioner's day, step by step
Write the workflow as the practitioner does it in the leading tool, step by
step, and walk it in the app. Anything the expert would edit must be editable
(tops, checkshots, coordinates, picks), anything they would compare must sit
side by side (MD/TVD/TVDSS, zones), and destructive actions have undo.
*From:* the ten Petrel-user findings, Compass plan table, slice player,
toolbox and undo in Seismolord.
*How:* three personas per app (the expert from the competitor tool, a
graduate engineer, a manager reading the report), each with a scripted walk
recorded in the upgrade doc; every "I would now..." that the app cannot do
is a finding.

### PL9. The chain, not the app
Run the real handoffs with real states: data written by the upstream app in
the state a user leaves it (draft, partial, other units) and read by every
downstream app. Round-trip the project through `.pld`. Follow every "Open
in" and deep link.
*From:* definitive-only trajectories, hole sections, WDM with no way out.
*How:* one chain e2e per app: upstream write, this app, downstream read.

### PL10. Real scale on the customer's laptop
Load the size a customer has (wells, logs, samples, survey GB) on an 8 GB
laptop profile. Record timings before and after in the PR. Long work runs in
a worker with progress and cancel.
*From:* the 4.5 GB Claredon survey.

### PL11. Inputs a person can type
Every numeric field accepts clearing, "-", "2." and pasted values without
snapping; defaults are realistic and named as samples; sample data is
labelled as sample. Keyboard use works.
*From:* NumberField, NumText, Sample PSC.

### PL12. House standards
Copy style (no em dashes or "X, not Y"), `EMPTY_VALUE` for missing values,
design-system roles, functional names, honest catalog text, and the route
wrapped in `ProtectedAppRoute`.
*From:* owner directives 07-07 to 09-28.

## 3. How we work the lens

1. Read the app's STATUS, ROADMAP, T1 and every human round first; carry
   forward any finding already made on a sibling app.
2. Diagnose from live data where possible (staging rows, real files).
3. Every finding becomes a test that fails first (negative control) and
   passes after.
4. Fix at the shared layer when two apps share the defect.
5. Update the app's STATUS and the upgrade doc; commit per sub-task.

The lens does not replace human testers. When a human round happens, its
findings are sorted into the twelve checks, and any finding that fits none
of them becomes check thirteen.
For report findings, the annex below is that extension.

## 4. Annex: the reviewer lens (RL1 to RL12), added 2026-10-02

The second Well Test Analysis tester (2026-10-02) read the PDF as the person
who signs it, and found that a report which passed PL7 still could not be
signed: no inputs, no sources, no components, an undivided skin, thin
identification, no operations table and no plots. PL7 was too thin. The
twelve checks below replace "header and three headline numbers" as the
report standard. They start with the Reservoir round and apply to any app
whose output is an analysis someone signs.

Full text, with the tester items behind each check, why a reviewer cares
and the test for each: `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`.
The Reservoir apps graded against them:
`docs/scope/AppUpgrade-Reservoir-GapMatrix.md`.

| Check | In one line | Deepens |
|---|---|---|
| RL1 | Every input the analysis read is on the page with unit and source; a default prints as an assumption; missing prints `n/a` | PL7 |
| RL2 | A composite input prints its components and formula (ct from cf, co, cw, cg) | PL7, PL1 |
| RL3 | A lumped result is split into its physical parts, the method named, the parts closing on the total | PL1 |
| RL4 | Identification: company, field, licence, well or reservoir, zone, interval, data dates, analysis type, analyst, units, build | PL7 |
| RL5 | A data and operations table: periods, rates, durations, volumes, cut-off, points used and excluded | PL8 |
| RL6 | Every claimed result has its plot in the report, with the fitted line and the fit window; a plot that does not apply says why; no report ships without plots | PL6 |
| RL7 | The basis is named beside every number: time basis, datum and absolute or gauge, STB or RB, nominal or effective decline, percentile convention | PL1, PL3 |
| RL8 | Keep confidence intervals, windows, the cross-check of methods and the regression statement; no status word without its event, in both directions | PL4 |
| RL9 | The limits of the method and the range of each correlation are printed; out-of-range inputs are flagged | PL1 |
| RL10 | Import doors find columns by header, take the unit at the door, survive hostile files and show what they read | PL2, PL3 |
| RL11 | Every cross-app intake has a sender, and the source, units and method names travel with the handoff | PL9 |
| RL12 | Screen, report and saved project are one model: same rows, same series, same precision, full round trip | PL5, PL7 |

How to run them without a human: build the PDF from the app's sample
through the code the Export button calls, read it back with poppler
(pdftotext, pdfimages, pdftoppm), and assert the rows, the captions, the ink
in each plot box and the status words. The Well Test suite
`src/components/welltest/__tests__/wellTestReportR2.test.jsx` and its kit
`reportTestKit.jsx` are the model; the shared report kit of the Reservoir
plan (Step 0b) makes them available to every app.
