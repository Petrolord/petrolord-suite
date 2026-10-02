# Well Test Analysis Studio: tester round 2 (the report)

Review received 2026-10-02 from a second human tester, who read the PDF
report as the reviewer who would have to sign it. Eleven recommendations and
four strengths to keep. Branch `fix/welltest-report-r2`; engines PR
Petrolord/petrolord-engines #298 (left for the owner to merge, vendored
byte-identical meanwhile).

The previous tester round is PR #810 (CSV units and columns, shut-in time,
match method, PDF header with Analyst and Field).

## 1. What the report had before this round

Read from `src/utils/wellTestReportExport.js` and the Report tab at
`origin/main` 04f5ee492, and from a PDF exported from the sample buildup.

| Tester item | PDF before | Report tab before |
|---|---|---|
| 1 Reservoir and fluid parameter table | None. h appeared only through kh. | None. The inputs lived on the Data rail. |
| 2 Source and quality of each input | None. The gas correlations were named in a help paragraph only. | None. |
| 3 Perforated interval against net pay | No perforation input existed. One skin, undivided. | Same. |
| 4 Well identification | Project, Well, Field, Analyst, Test type, Fluid (PR #810). No licence, zone, perforations, dates. | Well, Field, Analyst on one line. |
| 5 Flow and shut-in summary | None. tp and the shut-in time in the header. | None. A Flow periods table (type, start, end, rate) on the Data tab, with no duration, choke or volumes. |
| 6 Test overview plot | No plots at all in the PDF. | Pressure history of the analysed period and a rate chart on the Data tab. No temperature anywhere: the import skipped that column. |
| 7 Log-log with the model match | Not in the PDF. | On the Diagnostics and Match tabs. |
| 8 Horner or MDH plot | Not in the PDF. | On the Specialized tab; the fit window was not marked on the plot. |
| 9 sqrt(t) plot | Not in the PDF; the slope was quoted only when linear flow was detected or its window set. | On the Specialized tab, always drawn. |
| 10 History match | Not in the PDF. | On the Match tab, the analysed period only. |
| 11 RTA plots | Not in the PDF; an RTA results table when production data was loaded. | On the RTA tab. |

Strengths already there, which this round keeps and now pins with tests:
95 percent confidence intervals on the regression parameters, the flow
regimes with their time windows, results by more than one method (model
match, Horner or MDH, multi-rate), and the regression statement that is
withdrawn when the match is moved by hand (PR #810).

## 2. Findings and outcomes

| ID | Tester item | Lens | Outcome |
|---|---|---|---|
| WTA-R2-001 | 1 | PL7 | **Done.** "Reservoir and fluid inputs" table in the PDF and on the Report tab: h, phi, rw, Sw, ct, mu_o, Bo, API gravity, GOR, gas gravity, temperature, pi, q, kv/kh, the perforated interval in MD and TVD and the perforated length, each with its unit in the display system and its source. ct is one number ("entered as total") or built from cf + So co + Sw cw + Sg cg in the engine, with every term listed. Not provided prints `n/a`. |
| WTA-R2-002 | 2 | PL7, PL4 | **Done.** A source selector per input (measured in the lab, correlation and which, offset well, assumed) with a free-text note, saved with the project. Values the studio computed name themselves: the gas viscosity and z-factor carry the correlation names the engine returned (`buildGasPvtTable(...).source`), ct from components carries the formula, and a Fluid Systems Studio handoff carries the correlation names that app's backbone states. |
| WTA-R2-003 | 3 | PL1 | **Done.** Perforated interval (top and base, MD and TVD), top of net pay and kv/kh are inputs. The partial-penetration pseudo-skin is the Papatzacos (1987) correlation in the engine; the report gives total skin, s_pp and the mechanical skin s_d = (hp/h)(s - s_pp) separately, with the formula named. kv/kh blank is 0.1 and is printed as an assumption. A perforated length greater than h, an interval running out of the pay, and a zero kv/kh are refused with the reason and the skin stays undivided. |
| WTA-R2-004 | 4 | PL7, PL9 | **Done.** Licence or block, zone or sand, test dates and how the test was run (DST, production test, wireline formation test, injectivity test) join well, field and analyst in the header block and the saved state, with the perforations in MD and TVD. "Propose from the wells registry" offers the well name, the zone, net pay, porosity and Sw from a published Petrophysics zone summary, and the perforation TVDs through the well's deviation survey; each is ticked and applied by the user. |
| WTA-R2-005 | 5 | PL8 | **Done.** "Flow and shut-in summary": one row per period of the rate history with start, duration, choke, rate, volume in the period, running total, recovered volume and a remark. Choke, recovered volume and remark are entered per period on the Data tab. With no rate history the periods come from the test setup and the table says so. An open-ended period is `n/a`, never zero. |
| WTA-R2-006 | 6 | PL6, PL2 | **Done.** Test overview in the PDF and on the Data tab: gauge pressure and rate over the whole gauge record on one test clock, and the gauge temperature in a second panel when the file carried it. The gauge import reads an optional temperature column from its header (degF or degC). Without one the caption says it was not imported. |
| WTA-R2-007 | 7 | PL6 | **Done.** Log-log pressure change and Bourdet derivative with the model match overlaid and the flow-regime windows shaded and named. With no model matched the plot shows the data and says so. |
| WTA-R2-008 | 8 | PL6 | **Done.** Horner (buildup, falloff) or MDH (drawdown, injection), whichever the analysis used, with the fitted line, the fit window shaded, and the slope and window printed on the plot and in the caption, with where the window came from. |
| WTA-R2-009 | 9 | PL4 | **Done.** The sqrt(t) plot is drawn only when linear flow was detected on the derivative or the analyst set its window; otherwise one line says it does not apply. |
| WTA-R2-010 | 10 | PL6 | **Done.** History match of model against gauge pressure. When the gauge record holds the period before the shut-in, that period is included and modelled with the same catalog model at the test rate. With no model matched, one line says so. |
| WTA-R2-011 | 11 | PL4 | **Done.** Flowing material balance and the rate-normalized log-log plot when production data is loaded; otherwise "Rate transient analysis was not run". |
| WTA-R2-012 | strengths | PL7 | **Kept and pinned.** Confidence intervals, regimes with time windows, the regression statement, and a new "Cross-check of methods" table that sets k and skin from the model match beside the Horner or MDH line and the multi-rate line. |
| WTA-R2-013 | found here | PL9 | **Done.** The Fluid Systems Studio intake existed but nothing sent to it. Fluid Systems Studio now has a Send to Well Test Analysis Studio button, and its backbone names the correlations it used. |
| WTA-R2-014 | found here | PL5 | **Done.** Export project JSON wrote a hand-picked list of fields, so anything new would have been dropped. It now writes the saved payload itself, and Import project JSON reads it back. |
| WTA-R2-015 | found here | PL12 | **Done.** Missing values in the PDF printed as a dash; they now print as `n/a` (EMPTY_VALUE). kh from 1,000 up printed as "3.80e+3"; it now prints in full. |

## 3. How it is built

- **Engines first.** `partialPenetration.js` (Papatzacos, Brons and Marting
  as a second estimate, the skin split), `compressibility.js`,
  `flowSummary.js`, and `gas.js` naming its correlations, in
  Petrolord/petrolord-engines PR #298. Vendored into `packages/engines` with
  nine ledger rows in `VENDOR.json`; `src/utils/welltest/` has re-export
  shims.
- **One calculation path.** `src/utils/welltest/plotData.js` builds every
  plotted series once. The tab charts and the PDF figures both read them.
  `reportModel.js` builds the inputs table, the skin components, the
  identification rows and the flow summary once; the Report tab and the PDF
  both print them. `reportFigures.js` decides which figures apply; the Report
  tab lists the same figures the PDF draws.
- **Plots are vectors.** `pdfPlot.js` draws into the jsPDF page, the route
  the Pore Pressure, Basin and Rock Physics reports take: white panel, grid,
  series in the studio's chart colours, the Petrolord mark in the corner,
  axis titles with units. The text is read back by pdftotext.
- **No migration.** Identification, completion, input sources, period notes
  and the ct components live in the project jsonb. A project saved before
  this round opens with the defaults and reports the new fields as `n/a`.

## 4. Validation

**Partial-penetration pseudo-skin.** No published worked example of the
Papatzacos or Brons and Marting correlations could be read: SPE-13956-PA,
the SPE texts that tabulate it and the open papers that work examples were
behind paywalls or blocked. What was read: the Papatzacos formula with its
symbol definitions on slide 21 of a university lecture deck that cites
SPE-13956-PA, and the statement that damage skin is magnified by h/hp in the
total skin, citing Saidikowski (SPE 8204), on the IHS well test reference
page. The Brons and Marting polynomial is as quoted in an open paper's
abstract page.

The gate is therefore an independent calculation, and it calls the engine:

- `tools/validation/welltest/oracle_partial_penetration.py` (stdlib Python)
  computes the pseudo-skin of a uniform-flux line source in a slab with
  sealed top and base from the cosine series of the slab's Green function,
  with K0 integrated numerically. It shares no formula with the engine.
- Papatzacos approximates an infinite-conductivity well, so the engine is
  held to a band: 0.6 skin units and 10 percent. Over eleven geometries the
  largest difference is 0.50 skin units (2 percent).
- Negative control, run: with kv/kh inverted in the engine 16 of 44 tests
  fail; without the hp/h factor in the split 4 fail. The test also shows
  kh/kv for kv/kh, a missing square root, and A exchanged with B each leave
  the band on every case where the mistake changes the value.
- Exact properties, to machine precision: zero at full penetration, an
  interval and its mirror image equal, and s = (h/hp) s_d + s_pp closing on
  the reported numbers.

This is weaker than a published example. It would not catch an error in
the published formula as transcribed if the error stayed inside the band.

**The rest.** ct and the period volumes are checked against longhand
arithmetic in the same oracle. The plots have no new math.

## 5. Tests

| Test | What it proves |
|---|---|
| `packages/engines/__tests__/welltest.partialPenetration.test.js` (44) | The engine gate above. |
| `packages/engines/__tests__/welltest.reportInputs.test.js` (20) | ct from components, flow summary, the gas PVT table naming its correlations. |
| `src/utils/welltest/__tests__/reportModel.test.js` | Items 1 to 5 through the studio's own builders, hostile inputs, an old project. |
| `src/utils/welltest/__tests__/gaugeImport.test.js` | The temperature column: found from the header, units, nothing guessed. |
| `src/utils/welltest/__tests__/registryProposal.test.js` | TVD through a deviation survey, zone summary proposals. |
| `src/components/welltest/__tests__/wellTestReportR2.test.jsx` (21) | The real provider is mounted, the sample fitted, and the PDF built by the function the Export button calls, then read back with pdfinfo, pdftotext, pdfimages and pdftoppm: every item, the figures by caption, page count, point counts against the screen series, ink in each plot box, the embedded Petrolord mark, the strengths, Latin-1 only, hostile inputs, gas, SI, RTA, an old saved project and the JSON round trip. |
| `e2e/well-test-report-r2.spec.js` | The report door at 1366x768, 1440x900 and 390 wide in light and dark; the exported PDF read back; a gauge file with a temperature column; the registry proposals; a refused skin split; SI. |

## 6. Not built

- **Lab PVT tables as an input.** The engine accepts a (p, mu, z) table and
  reports it as "Supplied PVT table", but the studio has no screen to load
  one. The source selector covers a lab value typed in.
- **Limited-entry transient model.** The pseudo-skin is the late-time
  correction. The spherical flow a limited entry shows on the derivative is
  not a model in the catalog; it stays on the named future scope list.
- **Partial penetration for a deviated or horizontal well.** Papatzacos is
  for a vertical well. Measured depths are used when no TVD is given and
  the report says that is exact for a vertical hole only.
