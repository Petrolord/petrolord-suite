# Reservoir feedback lessons: the reviewer lens (RL1 to RL12)

Written 2026-10-02 for the Reservoir round of the app upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Owner instruction of the same
day: consider the feedback given on the Reservoir module, especially the
last round on Well Test Analysis Studio, and think through the same issues
in the other Reservoir apps before Step 0.

Companion docs:
- `docs/scope/AppUpgrade-BestPractices.md`: the practitioner lens PL1 to
  PL12. Section 4 there is the short form of this document.
- `docs/scope/AppUpgrade-Reservoir-GapMatrix.md`: every live Reservoir app
  graded against RL1 to RL12, with evidence.
- `docs/upgrade/WellTestAnalysis-TesterRound2.md`: the round this lens
  comes from (WTA-R2-001 to -016).

## 1. What the Reservoir feedback says

### 1.1 The events

W = tester team, O = owner, U = user, A = found by us (course authoring or
T1 audit) and listed because it is the same class of defect.

| Date | App | Who | What was said or found | Lens |
|---|---|---|---|---|
| 04-26 | DCA | U | Could not tell whether the upload worked | RL10 |
| 08-02 | ReservoirCalc Pro | O | Unit toggle relabelled 5,000 acres as 5,000 km2 | RL7, PL3 |
| 08-14 | Material Balance | W | CSV parsed, Run tab says "no data"; save failed on day-first dates | RL10, RL8 |
| 08-14 | DCA | U | Fit succeeds but the fitted line vanishes; P10, P50, P90 in one colour | RL6 |
| 08-27 | DCA | A | Monte Carlo read a per-day Di as per-year: P50 EUR 25 times high, live | RL7 |
| 08-27 | Material Balance | A | Drive indices divided by gross F while the engine's own reference said F minus Wp Bw; "Segregation (SDI)" printed for the rock and water term; "solver method" printed a request the engine never read | RL7, RL3, RL8 |
| 08-28 | VRR Monitor | O | "Doesn't even import" | RL10 |
| 09-03 | Well Test | W | Log-log plots blank; legend over the axis title | RL6, PL6 |
| 09-26 | Fluid Systems | A | Glaso Rs about 100 times low; no range warnings | RL9 |
| 09-28 | Well Test, round 1 | W | CSV units and column order; pwf at shut-in needs its time; "converged regression" shown when none was used; PDF header lacked Analyst and Field | RL10, RL7, RL8, RL4 |
| 10-02 | Well Test, round 2 | W | The report has no inputs table, no sources, no ct components, an undivided skin, thin identification, no flow and shut-in table, and no plots at all. Keep: confidence intervals, regime windows, cross-check of methods, the regression statement | RL1 to RL9 |
| 10-02 | Well Test, found while fixing | A | The Fluid Systems intake had no sender; project JSON export dropped new fields; kh printed as "3.80e+3"; a report-only input withdrew a valid regression | RL11, RL12, RL8 |

### 1.2 The reading

The first Well Test tester round asked "can I get my data in and trust the
status words?". The second tester did something no earlier tester had done:
read the PDF as the person who has to sign it and send it to a partner or a
regulator. Every item in that round is one question asked eleven ways:

> Could a reviewer who was not in the room reproduce this answer, or reject
> it, from the pages alone?

That needs four things on the pages: what went in and where it came from
(RL1, RL2, RL4, RL5, RL11), what came out and how it divides (RL3), the
picture that justifies each number (RL6), and the fine print that says in
which sense each number is meant and where the method stops (RL7, RL8, RL9).

Three facts make this a module-wide matter and more than a Well Test fix:

1. **The engines were sound in every case.** No tester item was a wrong
   formula. The Well Test report already computed the skin, the windows and
   the confidence intervals. It did not show its working.
2. **The report was built as a results printout.** It printed outputs
   because outputs were what the code had in hand at export time. Inputs,
   sources and plots lived in other parts of the state, and nobody owned
   "everything a reviewer needs". The other Reservoir reports were built on
   that same pattern (the Material Balance export says so in its header
   comment), and most Reservoir apps have no report at all.
3. **Reservoir answers are chains.** A material balance N depends on a PVT
   table, which depends on a correlation or a lab report. A waterflood
   forecast depends on a kr curve fitted somewhere else. When the handoff
   drops the name of the correlation, the downstream report cannot state a
   source even if it wants to. Provenance has to travel with the data.

### 1.3 Why our own process missed it

- PL7 ("the report a reviewer can sign") asked for a header and three
  headline numbers. The Well Test report passed PL7 after round 1 and still
  failed a real reviewer. The check was too thin.
- Our report tests assert that the PDF builds and that given strings are in
  it. None asked "is every engine input on the page?" or "is there a plot?".
- jsdom draws nothing, so a report with no figures and a report with six
  figures are the same to a component test.
- Sources are not state. No app had a place to record "this porosity is
  from the lab, this Bo is from Standing". What is not in state cannot be
  printed.

## 2. The reviewer lens

Twelve checks. RL1 to RL11 start from the programme lead's reading of the
two Well Test rounds; each is tightened here with a test that needs no
human. RL12 is added: it covers three round 2 findings the first eleven do
not (WTA-R2-014, -015 and the one calculation path that made the fix hold).

Every check is run on the **exported report first**, then on the screen. An
app with no report fails the report half of every check by definition and
gets a report in its upgrade (plan, Step 0b).

"The kit" below is the shared report kit of Step 0b: the read-back helpers
of `src/components/welltest/__tests__/reportTestKit.jsx` (`readPdf` with
pdfinfo, pdftotext, pdfimages and pdftoppm; `pageInk`) made available to
every app.

### RL1. Every input is on the page, with unit and source
Every value the analysis read is printed in an inputs table: name, value,
unit in the display system, and a source and quality statement (measured
in the lab, correlation and which one, offset well, assumed, handed over
from which app). A default the user never touched prints as an assumption
with its value. A value that was not provided prints `n/a` (`EMPTY_VALUE`).
The table says which inputs entered the calculation and which are recorded
for the reader only.
*From:* WTA-R2-001, -002; round 1 item 3 (pwf with its source).
*Why a reviewer cares:* the first thing a reviewer does is check h, phi, ct,
mu and B against what they know of the field. With no inputs table they
cannot tell a wrong answer from a different assumption.
*How to test:* (a) a completeness test that lists the keys of the object
handed to the engine and fails when one has no row in the inputs model, so
a new engine input cannot ship unprinted; (b) build the PDF from the sample,
read it back, and assert for each row a value, a unit and a non-empty source
cell; (c) blank one input and assert `n/a`; leave one default and assert the
word "Assumed"; (d) negative control: remove a row from the model and (a)
fails.

### RL2. Composite inputs show their components
A number that was built from parts prints the parts and the formula:
ct = cf + So co + Sw cw + Sg cg in Well Test. When the user typed the
total, the report says "entered as total".
*Equivalents:* Et from Eo, Eg and Efw in Material Balance; mobility ratio
from krw, kro, mu_w and mu_o in Waterflood; voidage from oil, free gas and
water terms with the Bo, Bg, Bw and Rs used in VRR; J from Pc, k, phi, IFT
and contact angle in SCAL; NPV from revenue, royalty, opex, capex and tax in
Risked Reserves; chance of success from its chance factors.
*From:* WTA-R2-001 (ct).
*Why:* a composite hides the one term that is wrong.
*How to test:* read the components and the composite from the PDF text and
assert the printed formula closes to the printed precision; switch the
"entered as total" mode and assert the wording changes.

### RL3. Lumped results are split, and the method is named
A result that mixes physical effects is reported in its parts, each with
the method and reference that separates them, and the parts close on the
total. When the split cannot be made the report says why and leaves the
result whole.
*Equivalents:* total skin into partial penetration and mechanical skin
(Papatzacos 1987) in Well Test; drive indices with their denominator in
Material Balance; EUR into cumulative to date and remaining, per segment,
in DCA; recovery into displacement, areal and vertical sweep in Waterflood;
voidage replacement by pattern; recovery factor by mechanism; per-criterion
verdicts in EOR Screening; risked value into chance and unrisked value.
*From:* WTA-R2-003; the Material Balance drive index findings.
*Why:* a reviewer acts on the part: stimulate for damage, re-perforate for
partial penetration. The lump supports neither decision.
*How to test:* assert the closure identity on the printed numbers; feed a
case where the split must be refused (perforated length above net pay) and
assert the reason is printed and no parts appear.

### RL4. The report identifies what was analysed and by whom
Company, field, licence or block, well or reservoir or pattern, zone,
interval (MD and TVD for a well), the dates of the data, the analysis type,
the analyst, the display unit system, the software build and the time the
report was generated. Identity comes from the wells registry where the well
exists there, proposed and ticked by the user, and is saved with the
project. An old project opens and prints `n/a` for what it never had.
*From:* round 1 item 5 (Field, Analyst); WTA-R2-004.
*Why:* an unidentified report cannot be filed, and two reports on the same
well cannot be told apart.
*How to test:* assert each header label and value in the first page text;
open a saved-project fixture from before the upgrade and assert `n/a` and no
throw.

### RL5. A data and operations summary
One table of what was done to the well or reservoir and what data the
analysis used: periods with start, duration, rate and volume and a running
total; the data cut-off date; how many points were imported, how many
entered the analysis, how many were excluded and by which rule.
*Equivalents:* flow and shut-in periods in Well Test; production history
span, cut-off and excluded months in DCA; pressure surveys and cumulative
withdrawals per timestep, with points left out of the regression, in
Material Balance; injection and production periods and the ledger in VRR
and Waterflood; the schedule in Simulation.
*From:* WTA-R2-005.
*Why:* the reviewer needs to see that the analysed window is the one the
operations support, and that inconvenient points were not dropped silently.
*How to test:* row count equals the period count of the state; period
volumes sum to the printed total; used plus excluded equals imported; an
open-ended period prints `n/a`; a zero there is a failure.

### RL6. Every claimed result has its plot, in the report
Each result is justified by the diagnostic plot the discipline expects,
drawn in the PDF with the model or fitted line over the data, the fit
window shaded and named, and the slope or parameter printed on the plot and
in the caption. A plot for a regime that was not claimed is replaced by one
line that says why it does not apply. A report with no figures is a failed
export. The screen and the PDF draw from the same series builder.
*Equivalents:* log-log with match, Horner or MDH, history match (Well
Test); F against Et, Campbell, Cole, p/z, pressure history match (Material
Balance); rate against time and rate against cumulative with the fit window
and the economic limit (DCA); Bo, Rs, viscosity and z against pressure with
lab points (Fluid Systems); kr and Pc curves with lab points (SCAL);
fractional flow with the Welge tangent, Hall plot with slope windows, VRR
and pressure against time (Waterflood, VRR); observed against simulated
rates and pressures (Simulation).
*From:* WTA-R2-006 to -011; the blank log-log of 09-03; the vanished DCA
line of 08-14.
*Why:* a straight-line slope without its plot is an assertion. The window
is where interpretations go wrong, so the window must be visible.
*How to test:* the kit's `readPdf`: figure captions present by name; ink in
each plot box well above a frame-only box (`pageInk`); the drawn point
count equals the screen series; the window text on the plot; the embedded
Petrolord mark; for a case without the regime, the "does not apply" line is
present and the caption is absent. Negative control: return an empty series
and the ink test fails.

### RL7. The basis is named wherever a number is printed
Time basis (shut-in time, equivalent time, elapsed days, calendar date);
pressure datum depth and absolute or gauge; surface or reservoir volumes
(STB, RB, scf, rcf) and the formation volume factor definition; nominal or
effective decline and its time unit; the percentile convention (P90 as the
low case); the drive index denominator; MD, TVD or TVDSS and the reference
elevation. A value picked from data states where it was picked ("pwf at
shut-in time 0 hr, gauge clock 6 hr, entered").
*From:* round 1 item 3; the round 2 note that regime windows are in
equivalent time while the semilog window is in shut-in time; the DCA Monte
Carlo per-day against per-year Di defect; the drive index denominator.
*Why:* the two worst Reservoir defects we have had were both a missing
basis: a decline rate read in the wrong time unit (25 times) and an index
divided by the wrong voidage. A reviewer catches these only when the basis
is printed.
*How to test:* a basis lexicon per app: for each quantity family the report
prints, a regular expression that must match beside it (psia or psig; STB
or RB; "nominal" or "effective" and "/yr" or "/d"; MD or TVD or TVDSS).
Toggle the unit system and assert values convert and labels follow. For
handoffs, assert the receiver reads the declared basis from the payload.

### RL8. Keep the strengths, and claim only what happened
Confidence intervals on fitted parameters, fit and regime windows, a
cross-check of independent methods and the regression statement
(algorithm, iterations, residual) stay in every report that has a fit. No
report or screen says converged, matched, calibrated, validated or history
matched unless that event happened and still describes the state. The rule
runs both ways: editing an input the analysis reads withdraws the claim;
editing a report-only field does not.
*From:* round 1 item 4; WTA-R2-012 (strengths), -016 (stale scope).
*Why:* the tester praised these four things by name. They are what makes a
report defensible, and a false "converged" destroys the trust the rest has
earned.
*How to test:* for each status word in the report text: perform the event
and assert the word; supersede it (move a parameter by hand, edit an
analysis input) and assert it is gone with the intervals; edit a
report-only input and assert it stays. A word-list guard over the report
strings fails on any status word not tied to a state flag.

### RL9. The limits of the method are printed
A short "Limits of this analysis" block: what the method assumes and what
it does not cover (vertical well only, single phase, tank model, screening
grade), the published range of each correlation used, and a flag on every
input that sits outside that range.
*From:* WTA-R2-003 and the round 2 "Not built" list (Papatzacos is for a
vertical well; MD used as TVD is exact for a vertical hole only); the Glaso
Rs finding in Fluid Systems.
*Why:* a reviewer has to know when to stop trusting the number. A method
used outside its range with nothing said is the classic audit finding.
*How to test:* assert the block exists and names the method; feed an
out-of-range input and assert the flag appears on that row in the PDF.

### RL10. Import doors read real files and say what they read
Columns are found from the header in any order; the unit is chosen at the
door (read from the header when present, selectable when absent); gauge
against absolute is asked for pressure; day-first dates, comma decimals,
no header and vendor exports are handled or refused with a reason. After
import the app shows a read-back: which column became what, in which unit,
rows read, rows skipped and why. The same summary goes into RL5.
*From:* round 1 items 1 and 2; Material Balance dates; DCA upload status;
VRR import; the DCA `bwpd` alias collision.
*Why:* a testing team's first hour is spent at this door. A file read in
the wrong unit produces a confident wrong answer.
*How to test:* the PL2 hostile file set under
`e2e/fixtures/<app>/hostile/`, one jest table per importer, and an e2e that
imports the "other unit" file and compares the result with its twin.

### RL11. Every intake has a sender, and provenance travels
For every "from another app" intake there is a control in the other app
that sends it, and the payload carries the source app, the record name, the
time, the units and the method names (the PVT correlation per property, lab
tuned or not; the kr model and whether fitted to lab data). The receiver
stores what it was told and prints it as the source in RL1. A value edited
after the handoff is marked as edited.
*From:* WTA-R2-013 (the Fluid Systems intake existed with nothing sending
to it), -002 (correlation names from the Fluid Systems backbone).
*Why:* the integrated platform is the Suite's claim. A handoff that loses
the correlation name turns "from Fluid Systems Studio" into "source not
stated" one app later.
*How to test:* a static guard in the style of
`src/__tests__/appRouteProtection.test.js`: every intake key read in `src/`
has at least one writer in another app. One chain e2e per pair: send from
the upstream app, open the downstream report, and assert the upstream
correlation name in the PDF text.

### RL12. The screen, the report and the saved project are one model
The Report tab and the PDF print the same rows from one builder, and the
plots share one series builder with the screen. Numbers match the screen to
the displayed precision and print in full ("3,800" where the old report
printed "3.80e+3"). The
exported project file is the saved payload itself and reads back to the
same state. Text is Latin-1 safe.
*From:* WTA-R2-014, -015; the "one calculation path" rule of round 2.
*Why:* a report that disagrees with the screen in the third digit starts an
argument the engineer cannot win. A hand-picked export list drops every
field added after it was written.
*How to test:* assert the Report tab rows equal the PDF rows; compare three
headline numbers on screen and in the PDF text; export the project, import
it, and deep-compare the state; a format test for values from 1,000 up.

## 3. How the lens is used

- RL1 to RL12 run beside PL1 to PL12 as Step 1 of every Reservoir app. They
  deepen PL7 (report), PL4 (status), PL2 and PL3 (doors) and PL9 (chain).
- Findings use the same IDs as the rest of Step 1 (`<APP>-U1-<nnn>`), with
  the RL number in the Check column.
- The grades are P (pass), Pa (partial), F (fail), NA. An app with no
  report is F on the report half of each check and is graded on its screen
  in the notes.
- The lens is written for Reservoir. It applies unchanged to any app whose
  output is an analysis someone signs (Nodal, Pore Pressure, Petrophysics,
  Economics). Those modules adopt it when their round starts.
- A future human round is sorted into PL and RL. A finding that fits
  neither becomes RL13.
