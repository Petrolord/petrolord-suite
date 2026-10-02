// Help drawer content for the Material Balance Studio. Replaces the retired
// HelpGuideDialog, whose step list described tabs that did not exist yet; this
// guide covers the full shipped surface through MB7 (Cole and Campbell
// diagnostics, the cf-corrected p/z overlay, PVT prefill and chart exports)
// and the MBAL-U1 upgrade (display units, the import door, PVT taken from a
// Fluid Systems Studio project, the rebuilt report, sharing and packages).
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-pl-text mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-pl-muted leading-relaxed">{children}</p>;

const MbsHelpContent = () => (
  <div className="pb-8">
    <P>
      The studio takes a reservoir from production history to original volumes in place, drive mechanism and aquifer
      support using classical material balance on a validated engine. Create a case with the initial conditions, load
      the history, set PVT and aquifer models, then run. Every result carries a validation tier badge that names the
      published benchmark backing that specific engine path.
    </P>

    <H>1. Case</H>
    <P>
      A case holds one reservoir study: fluid system (oil, gas, or oil with a gas cap), initial pressure, temperature
      and water saturation. Cases live in your account database; everything you save on the tabs is stored with the
      case. Opening a case shows its last completed run. When an input was changed after that run, the studio
      says the results are from an earlier run, withholds their status and holds the report until you run again.
    </P>

    <H>Units</H>
    <P>
      The studio opens in the units of your Suite unit profile, and the switch in the left rail changes the view for
      this session: oilfield (psia, degF, STB, RB, scf, ft) or metric (kPa abs, degC, sm3, rm3, m). Every field,
      table, plot axis, the series file and the report follow it. Pressures are absolute. STB and sm3 are volumes at
      surface conditions; RB and rm3 are volumes in the reservoir. The case is stored in oilfield units whichever
      view you work in, so a colleague on the other view reads the same case.
    </P>

    <H>2. Data</H>
    <P>
      Load the production history as cumulative volumes per observation date: pressure plus cumulative oil, gas and
      water. Drop a file (CSV, text with tab, semicolon or space columns, or an Excel sheet), paste a table, or edit
      the rows directly, then save. The first row is the initial state and must carry zero cumulative production.
    </P>
    <P>
      The door finds each column by its name, in any order, and reads the unit from the header where one is written,
      for example Pressure (kPag) or Gp (MMscf). Where the header names no unit you choose it, and the door tells you
      which unit it assumed. Gauge pressures are raised by the atmospheric pressure shown, which you can change.
      Dates such as 03/04/2015 that could be day first or month first are asked for; the door never guesses them. A
      decimal comma is read as a decimal comma. Under the mapping you see what was read and every line that was left
      out with its reason: a title, a comment, a repeated header, a totals row, a row with no pressure.
    </P>
    <P>
      A load is a two-stage operation. The file is read and shown to you as a preview first, marked as not saved yet,
      and nothing reaches the case until you save it. That is deliberate, so a mis-mapped column is caught before it
      overwrites history you already have. The panel stays mounted while you move between tabs, so a pending preview
      is still waiting when you come back.
    </P>
    <P>
      Injected water and gas can be kept on the table and are printed in the report, but this engine version has no
      injection term: they are left out of the balance, and the Data tab, the Run tab and the report all say so. For
      a reservoir under injection the oil in place from this studio is therefore too high.
    </P>
    <P>
      A regression needs at least two rows in total, counting the initial state, which means one observed pressure
      below initial. A history match needs at least three. Those are floors to clear; more history gives a
      far more trustworthy line.
    </P>

    <H>3. PVT</H>
    <P>
      Choose correlated PVT (Standing, Vasquez-Beggs or Glaso families with Hall-Yarborough or
      Dranchuk-Abou-Kassem z factors and McCain water properties) or paste a laboratory table. Oil viscosity has its
      own selector, Beggs-Robinson or Beal-Standing, because the two families diverge noticeably on heavier crudes.
      The preview shows the properties the engine will use. Save to make the configuration the case default; runs
      inherit it.
    </P>
    <P>
      Each correlation was published for a particular range of gravity, temperature, pressure and gas gravity. When
      your inputs fall outside the range its author validated, the tab says so and names the property concerned. That
      is a caution and does not block you: you can still run, but a result built on an extrapolated correlation deserves
      a second look.
    </P>
    <P>
      Working from a laboratory table, Prefill from correlations fills the table with correlated values at your
      pressures so you have a starting grid to paste your measured numbers over, so you do not type every row from
      blank. It uses the Pb, Rs and Bo correlation selected on the tab and tells you which methods it used for the
      rest. A table built this way is reported as built from correlations, with the correlation names, and as
      edited by hand once you change a row. It is never reported as lab data.
    </P>
    <P>
      Take the PVT of a Fluid Systems Studio project fills the table from a saved fluid study and keeps what that
      study says about itself: the project, the fluid model, the method of every property, the liberation basis, the
      lab tuning and its range flags. The report prints them as the source of the PVT. The table has to cover every
      pressure of the case. Outside the table the engine would use the correlations of this tab, so one balance
      would mix two PVT descriptions; a table that stops short is refused with the reason, and a table typed by
      hand that stops short is flagged on the Run tab and in the limits of the report.
    </P>
    <P>
      A case whose Bo, Rs and Bg (or Z) come on the data rows needs no separate table. The tab says so and the rest
      of it (gravities, salinity, compressibilities) saves as usual.
    </P>

    <H>4. Aquifer</H>
    <P>
      The tab has two segments. Model configures the aquifer the engine runs with: none, pot, Fetkovich or
      Carter-Tracy. Pot solves aquifer size from the regression itself; Fetkovich and Carter-Tracy march water influx
      from your aquifer geometry and properties. Carter-Tracy supports a finite aquifer through the radius ratio, and
      defaults water viscosity from the McCain correlation and the reservoir radius from area when you leave them
      blank; every defaulted value is named in the run warnings and printed in the report as a default. The reservoir
      radius, the area, the water viscosity and the salinity have their own fields. Saving a model also tells the
      case that it has an aquifer, which the pressure history match reads. Each aquifer model carries its validation tier badge
      here on the configuration itself, so you can see what a choice is backed by before you commit a run to it
      as well as afterwards on the result.
    </P>
    <P>
      Screening is the absorbed Aquifer Influx Calculator: it computes a We history entirely in the browser by
      van Everdingen-Hurst (the reference constant-terminal-pressure superposition), Carter-Tracy (with the exact
      bounded-circle pD when you set the radius ratio) or Fetkovich (aquifer volume and productivity index, derivable
      from geometry). Load the case's dated pressures, explore aquifer sizes until the influx looks right, compare
      against the dashed We from the last engine run, then press Use in model to write the screened parameters into
      the case. First-row time zero sets the initial pressure. The screen is an estimate; the engine run and its
      validation tier remain the authority. The tab opens on the aquifer of a built-in example and says so until you
      change a value.
    </P>
    <P>
      Expect the screen and the engine to differ slightly on Carter-Tracy with a finite aquifer. The browser screen
      evaluates the bounded-circle dimensionless pressure directly, while the server engine blends the
      infinite-acting solution into the pseudo-steady-state one across the transition. Both are legitimate and the
      difference is small, so treat a modest gap as normal. It is not a sign that one of them is wrong. Where
      they disagree, the engine result is the one your tier badge and your report are built on.
    </P>

    <H>5. Run</H>
    <P>
      The tab has two segments. Regression runs the Havlena-Odeh straight line (or the p over z pot-aquifer plot for
      gas) on the server engine and reports OOIP or OGIP, aquifer size where applicable, the regression quality, and
      the drive index decomposition (depletion, gas cap, water and compressibility drives). Those indices are
      fractions of the hydrocarbon voidage the reservoir had to replace, so water you have produced is netted inside
      the water drive index and is not counted in the denominator. That makes them sum to one by construction, and a
      sum that drifts off one points at an inconsistent solution or inconsistent inputs. Rounding does not explain it. A
      negative water drive index is meaningful too: it says you produced more water than the aquifer supplied, so
      expansion energy had to make up the difference. Engine warnings surface anything the run had to assume or found
      suspicious.
    </P>
    <P>
      Two warnings mean the answer cannot be used at all, which is more than a call for care: an oil or gas in place at or
      below zero, and a negative pot aquifer volume. Both come from a regression line whose intercept landed on the
      wrong side of zero, and a high regression quality does not rescue either one, because points can sit on a
      straight line about the wrong model. Check the aquifer model first (a real aquifer analysed as none bends the
      plot, and a pot aquifer forced onto a depletion tank drives the water volume negative), then the pressure and
      production history for unit or sign errors, then whether the earliest points belong to a different flow regime
      and should be excluded.
    </P>
    <P>
      A note on the acronyms, because the textbooks disagree and the studio used to follow the wrong one. Ahmed calls
      the gas cap drive SDI, for segregation, while Pletcher and most gas work call the rock and connate water
      expansion ICD, for compressibility. The studio labels each row by what it is: depletion, gas cap, water, and
      rock and water. That last one is Ahmed's EDI. Results you ran before 11 September 2026 show the same numbers,
      but the rock and water row was labelled Segregation (SDI) then, which named it after the gas cap by mistake.
    </P>

    <P>
      History match works the other way round: the engine simulates the pressure history your production would have
      produced for a candidate set of tank parameters, then a Levenberg-Marquardt search adjusts the parameters you
      tick until the simulated pressures reproduce the observed ones. Each matched parameter comes back with a 95
      percent confidence interval; a parameter that finishes at its search bound or with a very wide interval is not
      really constrained by your data, and the warnings will say so. The pressure-match plot shows observed points,
      the simulated line, and the residual at every timestep. Starting values seed from the last run and the Aquifer
      tab; leave them blank to let the engine derive them. On short histories fit few parameters: OOIP or OGIP plus
      one aquifer size knob is usually all the data can support.
    </P>

    <H>6. Plots</H>
    <P>
      Diagnostic plots for the latest run, the same ones the report prints. The regression plot is drawn in the space
      the engine regressed in, which depends on the aquifer model: F against Et with no aquifer, F minus We against
      Et with a Fetkovich or Carter-Tracy aquifer, and the pot aquifer plot (F over the expansion against the
      pressure drop over the expansion) with a pot aquifer. Its line is the engine's own slope and intercept, filled
      circles are the points the fit used, and hollow squares are the points it left out. Beside it: the Campbell
      plot for oil or the Cole plot for gas, p over z for gas, measured against simulated pressure when a history
      match was run, the water influx, and the drive indices through time. A plot that does not apply to the run says
      why. A straight line with scatter tells you more than a forced fit; curvature usually means the aquifer model
      or the gas cap size is wrong.
    </P>
    <P>
      The Cole plot is the gas aquifer diagnostic and the Campbell plot is its oil counterpart, so you see whichever
      one matches your fluid system. They are read the same way: a flat trend points to depletion
      with no significant aquifer, while a rising trend points to water influx, and the steeper it rises the stronger
      the support. Either is the fastest check on whether an aquifer belongs in the model at all, before you spend
      time choosing between Fetkovich and Carter-Tracy.
    </P>
    <P>
      On the gas p over z plot, an overlay corrects for formation and water compressibility by the Ramagost-Farshad
      method. In an overpressured gas reservoir the raw p over z line bends and reads low on gas in place; the
      corrected line straightens it. A wide gap between the two lines is itself the signal that rock compressibility
      matters in this reservoir.
    </P>
    <P>
      Clicking any point on a diagnostic plot opens the underlying timestep: the pressure, the cumulative volumes, the
      PVT properties used and the computed water influx at that date. It is the quickest way to chase down a single
      point that sits off the trend.
    </P>

    <H>7. Forecast</H>
    <P>
      Fits an Arps decline (exponential, hyperbolic or harmonic, or automatic selection) to rates derived from your
      cumulative history, using the same decline engine as the DCA Studio, and forecasts to your economic limit.
      Remaining reserves count only production beyond the last history date. The reconciliation card then compares
      the decline forecast with the material balance: for gas, against the p over z recoverable at your abandonment
      pressure, interpolated through the p over z history of the last run; for oil, the implied ultimate recovery
      factor is checked against the statistical recovery ranges for the drive mechanism the engine diagnosed. A
      mismatch does not say which number is wrong; it says the two methods disagree and why is worth chasing.
    </P>

    <H>8. Contacts</H>
    <P>
      Screening estimates of fluid-contact movement from the last run: the water contact rises by the net aquifer
      influx (We minus produced water) and the gas-oil contact descends by the gas-cap expansion the material
      balance attributed, both spread over the contact areas you provide as piston-like fronts. Assumptions are
      uniform area with depth, no coning and no gravity smearing; treat the output as a screening view and confirm
      with surveillance logs. The contact depths and areas you type are saved with the case and printed in the
      report beside the pressure datum.
    </P>

    <H>9. Report</H>
    <P>
      Exports a PDF of the latest run for a reviewer. It carries the identification (company, field, licence,
      reservoir, zone, analyst, data dates, units, build), every input the engine read with its unit and its source,
      the pressure datum as you stated it, the data used with the timesteps left out of the fit and why, the result
      with the regression statement, the in-place volume by each method side by side, the drive indices with the
      convention they are computed by, the expansion terms, the PVT the engine used, the limits of the method with
      the published range of each correlation, and the plots. The series file (CSV) carries every per-timestep
      series with its units.
    </P>
    <P>
      Fill the report details on this tab: the identification, the datum depth and reference, whether the pressures
      were referred to the datum, and where each input came from (measured, a correlation, an offset, an
      assumption). An input with no source prints as entered, source not stated; a value the app filled by default
      prints as an assumption. Saving the details does not change a result, so the run stays current. The studio
      applies no correction to datum: pressures enter the balance as you typed them, and the report says so.
    </P>
    <P>
      The report always describes the run on screen. When an input, the PVT, the aquifer or the data changed after
      that run, the result is named an earlier run, its status words are withheld and the export waits for a new
      run. Putting the input back makes the result current again. A case run before October 2026 kept no record of
      what its run was made on, so it asks for one new run before it reports.
    </P>
    <P>
      Individual charts can also be lifted out on their own. Every chart in the studio carries a download button
      that saves the current view as a PNG, including all of the diagnostic plots as well as the history match,
      forecast, contacts and aquifer screening charts. That is usually what you want when a single plot has to go
      into a partner deck or a well review.
    </P>

    <H>Sharing and packages</H>
    <P>
      Share with my organisation, under the case picker, lets colleagues in your organisation open the case with its
      data, results, plots and report. They see it under Shared with me and it opens read-only: nothing they change
      is saved to your case. Save a copy gives a colleague a case of their own with the same conditions, production
      data and run settings, which they run themselves. Turn the switch off to make the case private again. Editing
      of one case by several people is planned.
    </P>
    <P>
      A case travels in a Petrolord package (.pld) with its production data, run settings, runs and results, from
      the package export of the Suite. Imported, it is your own private case, and its last run is current exactly
      when it was current where it came from.
    </P>

    <H>Validation</H>
    <P>
      The engine is benchmarked against published worked examples: Pletcher SPE 75354 for gas and oil pot-aquifer
      paths, Tarek Ahmed Example 11-3 and Dake Exercise 3.4 for depletion and gas cap drives, Dake Exercise 9.2 for
      Carter-Tracy, and Ahmed Examples 10-10 and 11-1 for Fetkovich and combination drive. The tier badge on each
      result names the benchmark and its tolerance.
    </P>
  </div>
);

export default MbsHelpContent;
