# Report Kit and input provenance: design and status

Step 0 of the Reservoir module round of the app upgrade programme. Written
2026-10-02, branch `feat/report-kit`.

Two human testers shaped the Well Test Analysis Studio report (PR #810 and
PR #852, live since 2026-10-02): a reviewer has to be able to sign it. Every
other Reservoir app needs the same kind of report. This work takes that
report apart into a shared kit so no app builds it again, and moves the Well
Test report onto the kit with no change in its output.

| Piece | Where | State |
|---|---|---|
| Report Kit | `src/lib/reportKit/` | Built, self-tested |
| Test side of the kit | `src/lib/reportKit/testKit/` | Built, used by the Well Test tests |
| Input provenance | `src/lib/inputProvenance/` | Built, used by Well Test |
| PVT provenance contract | `src/lib/inputProvenance/pvtContract.js` | Written down, tested against the real backbones |
| Well Test report on the kit | `src/utils/wellTestReportExport.js` | Done, output identical (section 5) |
| Any other app on the kit | none yet | The Reservoir round, app by app |

## 1. Survey: how reports are produced today

Read at `origin/main` 8234bdc8c.

| App | Output today | Tables | Figures in the PDF | Units | Sources printed | PDF read back in tests |
|---|---|---|---|---|---|---|
| Well Test Analysis | PDF, jsPDF + autotable, A4 portrait mm | autotable grid, navy head, note under | Vector, drawn in jsPDF | Own oilfield / SI switch | Yes, per input | Yes (pdftotext, pdfinfo, pdfimages, pdftoppm) |
| Reservoir Balance (`utils/mbalReportExport.js`) | PDF and CSV | autotable grid, navy head | None; screen charts leave as PNG | Oilfield only | No | CSV only |
| DCA Studio (`utils/declineCurve/dcaExport.js`) | CSV, XLSX, chart PNG | none | No PDF | Oilfield only | No | No |
| Fluid Systems Studio | CSV, chart PNG | none | No PDF | Oilfield only | Correlation names in the handoff | No |
| SCAL Studio (`components/scalstudio/exports.js`) | CSV, JSON, chart PNG | none | No PDF | Oilfield only | No | No |
| Waterflood Design Studio | CSV | none | No PDF | Oilfield only | No | No |
| VRR Monitor | CSV, chart PNG | none | No PDF | Oilfield only | No | No |
| Recovery Factor Estimator | Nothing | none | No export at all | Oilfield only | No | No |
| Petrophysics (`services/petroReport.js`) | PDF | autotable grid, up to 17 columns | Raster: the CPI track plot as a PNG, one page per zone | Depth m or ft, own module | Methods and provenance as prose | Yes |
| Pore Pressure (`services/report.js`, `reportPlot.js`) | PDF and CSV | Drawn by hand | Vector, depth downward | Own module | Calibration as prose | Yes |
| Basin (`services/report.js`, `reportCharts.js`) | PDF | Drawn by hand | Vector: filled burial curves, maturity windows, event bars | Own module | Inputs as prose | Yes |
| Wellsite strip log (`services/stripLogPdf.js`) | PDF | none | Vector multi-track log to scale, paged down hole | Own module | No | Yes |

What they share:

- jsPDF, A4 portrait, millimetres, Helvetica, the navy and slate palette.
- The vector plots follow one house standard (white panel, light grid,
  legend on top, the Petrolord mark bottom right), yet Well Test, Pore
  Pressure and Basin each carry their own copy of the tick and axis code.
- Five separate Latin-1 guards (`pdfText`, `latin1Safe`, two `latin1`,
  `latin`) with different symbol tables.
- The builder returns the document and the caller saves it (all but
  Reservoir Balance), which is what makes a read-back test possible.
- A reviewer block (well, field, analyst, date, units) in Well Test,
  Petrophysics, Pore Pressure, Basin and Wellsite.

Where they differ, by how many apps it touches:

1. Six of the seven Reservoir apps have no PDF report at all. For them the
   kit is the whole report, and nothing has to be preserved.
2. Seven apps are oilfield only. The kit prints whatever units the app hands
   it; a unit switch is the app's work.
3. Bar, histogram and tornado charts (Reservoir Balance drive indices, DCA
   EUR distribution, Waterflood tornado, Recovery Factor low and high) and
   filled areas (Basin burial, DCA, Reservoir Balance aquifer) are not in the
   kit's plot.
4. Petrophysics, Pore Pressure, Basin and Wellsite open with the brand
   banner of `lib/pdfBrand` (`drawBrandHeader`); the kit header is the plain
   title of the Well Test report.
5. Depth plots need a reversed Y axis (Pore Pressure, Basin, Wellsite, SCAL
   saturation height). The kit has it now (`yReversed`).
6. Pore Pressure and Basin draw their tables by hand and print no page
   numbers. Moving them onto the kit changes their look.
7. One of a kind: the raster CPI page (Petrophysics), the multi-track log to
   scale with lithology and text tracks and a repeated page header
   (Wellsite), the sign-off block and DOCX output (Wellsite daily report).

## 2. The kit: `src/lib/reportKit`

Pure and free of React. jsPDF with jspdf-autotable for the tables, the stack
every Suite PDF already uses; no new dependency and no chart library. Every
string passes the Latin-1 filter.

    import { createReport, sig, fixed, reportUnits } from '@/lib/reportKit';
    import { loadPetrolordLogo } from '@/lib/pdfBrand';

    const r = createReport({ title: 'Decline Curve Report', appName: 'Petrolord DCA Studio', logo: await loadPetrolordLogo() });
    r.header({ identification: [['Well', 'W-7'], ['Field', 'Obodo']], displayUnits: 'Oilfield' });
    r.table('Headline results', ['Quantity', 'Value'], rows, { note: '...' });
    r.inputsTable(inputRows, { title: 'Inputs', note: '...' });
    r.figures([
      { id: 'rate', title: 'Rate history', caption: '...', panels: [{ height: 80, spec }] },
      { id: 'pz', title: 'p/z plot', statement: 'Does not apply: the fluid is oil.' },
    ]);
    const { doc, figures, pages } = r.finish({ footer: 'Decline Curve Report, Well W-7' });

| Module | Exports | What it does |
|---|---|---|
| `report.js` | `createReport({ title, appName, logo, strictText, page })` | The builder. Returns `header`, `heading`, `paragraph`, `table`, `inputsTable`, `section`, `startFigures`, `figure`, `figures`, `finish`, and `doc`, `layout`, `text` for anything bespoke. |
| | `header({ identification, displayUnits, generatedAt })` | Title, app name, identification grid two pairs to a row, display units, generated timestamp (UTC), a rule. A blank value prints `n/a`. |
| | `table(title, head, body, { columnStyles, note, emptyValue })` | Titled grid table, navy header row, optional note line. Breaks across pages by itself and repeats the header row; a table that fits on a page is kept with its title and note. Blank cells print `EMPTY_VALUE`. Returns false and prints nothing for no rows. |
| | `inputsTable(rows, { title, note })` | Rows of `{ label, value, unit, source }` as Input, Value, Unit, Source and quality. A dimensionless unit stays empty. |
| | `section(title, text, opts)` | A heading with a paragraph: notes, or the sentence that stands in for an empty table. |
| | `figure(fig)`, `figures(list)` | Numbered figure: title, one or more stacked plots, caption, kept on one page. Without `panels` it prints the title and `statement`, the "does not apply, because" line. Returns `{ id, number, page, plotted, panels }`. |
| | `finish({ footer })` | Footer on every page (report name left, `Page n of m` right). Returns `{ doc, figures, pages }`. |
| | `headerPairs`, `pairRows`, `inputsBody`, `INPUTS_HEAD` | The row builders, for a screen that shows the same block. |
| `plot.js` | `drawPlot(doc, box, spec)` | One vector plot. Axes linear or log (`xLog`, `yLog`), reversed (`xReversed`, `yReversed`), secondary Y (`axis: 'y2'`, `y2Title`), gridlines, series as `line`, `scatter` or `both` with circle or square markers and dashes, legend, X bands and Y bands with labels, reference lines, annotation `notes`, `xInclude` and `yInclude`, the Petrolord mark. Returns `drawn` (points per series), `total`, `marks`, `bands`, ranges, `plotArea`, `logo`. |
| | `niceTicks`, `decadeTicks`, `tickText` | Tick helpers. |
| `layout.js` | `createLayout(doc, page)` | Cursor `y`, `ensure(height)`, `keepTogether(...heights)`, `newPage()`, `room()`, `advance(mm)`. |
| `text.js` | `pdfText`, `unprintable`, `isPrintable`, `assertPrintable` | The Latin-1 guard. Known symbols are spelled out (delta, mu, phi, square root, superscripts, typographic dashes and quotes, arrows); the rest becomes `?`, or an error naming the characters when the report is built with `strictText: true`. |
| `format.js` | `sig`, `fixed`, `sci`, `plain`, `compact`, `thousands`, `percent`, `range`, `orNA`, `withUnit`, `timestampUtc`, `EMPTY_VALUE` | Number formats. Anything missing or not finite prints `n/a`. A string is never read as a number. |
| `units.js` | `reportUnits(resolvedUnits)`, `displayUnitsText(system)` | Labels, converted values and column heads from the Suite unit profile (`lib/units`): `label(family)`, `value(family, canonical)`, `head(text, family)`, `displayUnits(families)`. |
| `theme.js` | `PAGE`, `NAVY`, `SLATE`, `BODY`, `SERIES_RGB`, `SERIES_CYCLE` | Page geometry and colours. |

## 3. The test side: `src/lib/reportKit/testKit`

For jest only (node `fs` and `child_process`, and poppler, which CI
installs). A report test is a few lines:

    import { readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, checkGolden } from '@/lib/reportKit/testKit';

    const built = buildMyReport(args, { logo: chartLogo(), generatedAt: AT });
    const pdf = readPdf(built.doc, { ink: true });
    expect(pdf.pages).toBe(built.pages);
    expect(flat(pdf.text)).toMatch(/Net pay h 45 ft/);
    expect(listCaptions(pdf).map((c) => c.title)).toEqual(['Rate history', 'p/z plot']);
    expect(pointCounts(built.figures).rate[0]).toEqual({ Rate: screenSeries.length });
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    pdf.close();

| Function | What it reads |
|---|---|
| `readPdf(doc, { ink })` | `pages` (pdfinfo), `text` and `pageText` (pdftotext -layout), `images` (pdfimages), `raw` bytes, and `ink(page, box)` |
| `listCaptions(pdf)` | Every `Figure n. Title` line with its page |
| `pointCounts(figures)` | Points per series per panel, by figure id, to hold against the screen series |
| `plotMarks(pdf, page, plotArea)` | The line segments and markers inside a plot area, counted in the page's content stream |
| `expectFigureDrawn(pdf, figure, opts)` | Title on the reported page, enough points, the marks in the file equal to what the builder reports, ink in the box, optionally the embedded mark |
| `expectFigureStatement(pdf, figure, text)` | A conditional figure is the one-line statement |
| `checkGolden(built, { dir, name, update })` | Text line for line, page count, figure records and a SHA-256 of the document against fixtures; `UPDATE_REPORT_GOLDENS=1` rewrites them |
| `chartLogo()`, `flat(s)`, `pdfSha256(doc)` | The mark from `public/`, whitespace collapse, document hash |

A finding from building it: ink in the plot box does not separate a full
plot from a plot with two points, because the frame, grid, legend and mark
are most of the ink. It only catches the "No data to plot" panel. The count
of marks in the content stream is the check that holds the drawing against
the data, so `expectFigureDrawn` does both.

## 4. Input provenance: `src/lib/inputProvenance`

| Module | Exports | What it does |
|---|---|---|
| `model.js` | `INPUT_SOURCES`, `SOURCE_KINDS`, `normalizeMeta`, `isStated`, `countStated`, `setProvenanceField`, `serializeProvenance`, `deserializeProvenance`, `provenanceFromPayload`, `PROVENANCE_KEY` | One record per input: `{ source, correlation, note }`. Kinds: `''` entered with no source stated, `lab`, `correlation` (with its name), `offset` well, `assumed`. Saved under `inputMeta` in the project JSON, the key the Well Test projects already use. A project with no records opens unchanged. |
| `wording.js` | `sourceText(meta, auto)`, `assumedDefaultText(value)`, `computedText(how)`, `inputRow(...)`, `SOURCE_NOT_STATED`, `NOT_PROVIDED` | The words of the Source and quality column. What the app itself knows (a computed value, an applied default, a handoff) wins over the selector; the note follows as its own sentence. |
| `InputSourceControl.jsx` | `InputSourceControl({ label, meta, onChange, testId })` | The shared control: source selector, the correlation name when the source is a correlation, the quality note. Holds no state. Imported from its own file so the index stays free of React. |
| `pvtContract.js` | `PVT_PROPERTIES`, `pvtMethod`, `pvtPropertyProvenance`, `describePvtHandoff`, `validatePvtHandoff`, `pvtIntake(fluid, fieldMap)`, `intakeSourceText` | The PVT provenance contract, below. |

### The PVT provenance contract (version 1)

Fluid Systems Studio hands its "fluid backbone" to other apps through router
state as `location.state.fluidStudioData`. Well Test and the Pipeline Sizer
read it. The backbone already says how its PVT was computed; this contract
writes that down and nothing in what is sent changes.

    source        'black-oil-correlations' | 'eos' | 'lab'
    correlations  { pb_rs_bo: 'Vasquez-Beggs' | null, viscosity: 'Beggs-Robinson' | null }
    provenance    optional, { <property>: { source, correlation, note } } for one property that differs
    results       pb (psia), bo_at_pb (RB/STB), mu_o_at_pb (cp), at the bubble point
    inputs        oil_gravity (degAPI), gas_gravity (air = 1), rsb (scf/STB), inlet_temperature (degF)
    carried       gor (separator total), wat, pvt_table

Rules for a consumer: a result is reported with the method that produced it
(the named correlation of its group, the equation of state, a laboratory
measurement, or "method not stated by the handoff"); an input of the fluid
model is reported as that; a per-property record wins over the method; a
source the user then picks in the receiving app wins over the handoff.

`source: 'lab'` and the per-property `provenance` are allowed by the
contract and understood by consumers, but Fluid Systems Studio does not send
them yet. A consuming app maps the properties it takes with `pvtIntake`:

    pvtIntake(fluid, [
      { property: 'bo_at_pb', key: 'B', label: 'Bo' },
      { property: 'gas_gravity', key: 'gasGravity', storeKey: 'solutionGasGravity', label: 'gas gravity' },
    ]);
    // { patch, applied, intake: { fields, text, inputFields, inputText }, sources }

## 5. Well Test on the kit: proof of no change

Goldens were written from the report as it stood at main 8234bdc8c, before
any kit code existed (commit 48dd09670), by
`src/components/welltest/__tests__/wellTestReportGolden.test.jsx` into
`__fixtures__/reportGolden/`. Six cases, each built from the real provider
with the function the Export button calls:

| Case | What it covers | Pages |
|---|---|---|
| `oil-buildup-reviewed` | Identified, completed over part of the pay, sources stated, regression run, notes | 5 |
| `oil-buildup-bare` | Sample only, no match, no rate history | 4 |
| `gas-buildup` | Pseudo-pressure, the engine's correlations | 5 |
| `oil-linear-temperature` | Claimed linear-flow window (sqrt(t) plot), imported temperature panel, manual match | 6 |
| `oil-linear-temperature-si` | The same in SI | 6 |
| `oil-rta` | Production data: RTA table and the two RTA panels | 6 |

After the refactor all six reproduce: the pdftotext output line for line,
the page count, every figure's number, page, plot box and points per series,
and the SHA-256 of the document with only the creation date and file id
blanked. The documents are byte for byte the same. The existing Well Test
tests pass with no assertion changed; `reportTestKit.jsx` now re-exports the
PDF readers from the kit.

A deliberate change to the Well Test report regenerates the fixtures with
`UPDATE_REPORT_GOLDENS=1`, and the diff of the `.txt` files is its review.
A change inside the kit that alters the drawing of the Well Test report
fails these tests, which is the guard every later app's work on the kit
runs under.

## 6. What the kit does not cover yet

For the Reservoir round, in the order it will be met:

1. Histogram and tornado charts (DCA EUR distribution, Waterflood tornado
   and layer bars, Recovery Factor range). Vertical bars, stacked at each X
   in series order, are in the kit since the Material Balance round
   (`type: 'bar'`, `barWidth`; the test kit counts them as `bars`).
2. Filled areas between curves (Reservoir Balance aquifer influx, DCA
   forecast bands).
3. A date X axis: in the kit since the Material Balance round (`xDate`,
   values in milliseconds since 1970, ticks on calendar boundaries printed
   as years, months or days; `dateTicks`, `dateTickText`).
4. A unit switch in the seven oilfield-only apps. `reportUnits` gives the
   labels and conversions; each app still has to hold its values in known
   units.
5. Landscape pages and very wide tables (scenario comparisons, multi-well).
   `createReport` is A4 portrait.

For the Geoscience reports, should they move later:

6. The brand banner header (`pdfBrand.drawBrandHeader`) as an alternative to
   the plain title.
7. Raster figures (the Petrophysics CPI page) inside the figure numbering.
8. A multi-track depth log to scale with lithology and text tracks and a
   header repeated on every page (Wellsite strip log). This is its own
   drawing and should stay so.
9. Interval bars and polygons (Basin), a signature block and DOCX output
   (Wellsite daily report).
10. Pore Pressure and Basin print tables drawn by hand with no page numbers;
    on the kit they would change appearance, so that move needs a reviewer.

## 7. Rules for apps adopting the kit

- Build the report from rows and series the screen already shows. The kit
  formats; it calculates nothing.
- Every input goes in the inputs table with its unit and its source. A
  default the app applied is worded with `assumedDefaultText`.
- A conditional figure that does not apply is still listed, with its reason.
- Write a golden (`checkGolden`) and call `expectFigureDrawn` for every
  plotted figure; assert `pointCounts` against the screen series.
- Changing `src/lib/reportKit` must leave the Well Test goldens untouched
  unless the Well Test report is meant to change.

## 8. Additions since Step 0

| Date | From | What |
|---|---|---|
| 2026-10-02 | Risked Reserves Valuation U1 | `bars.js`: `drawBars(doc, box, spec)`, a bar chart on the house standard (categories on X, one bar per series, per-bar colours, value text over each bar, reference lines). A figure panel asks for it with `kind: 'bars'`. The test kit counts bars in the page content stream (`plotMarks().bars`, present only when the area holds one) and `expectFigureDrawn` holds them against `marks.bars`. Self-test `__tests__/reportKitBars.test.js`. This covers the bar part of gap 1 in section 6; histograms can use it with bins as categories; a tornado (horizontal bars from a base) is still open. |
| 2026-10-02 | Risked Reserves Valuation U1 | `plot.js`: a reference line takes `row` to drop its label by one line per step, so neighbouring labels do not overprint. Default 0: existing reports are unchanged (Well Test goldens byte-identical). |
| 2026-10-02 | ReservoirCalc Pro RL re-check | `drawPlot` used on a report that is not on the kit (its own jsPDF document and layout), with the kit test side reading it back: a way to give an older report a vector figure without changing its look. |
