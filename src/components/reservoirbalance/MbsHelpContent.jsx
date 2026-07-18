// Help drawer content for the Material Balance Studio (MB3). Replaces the
// retired HelpGuideDialog, whose step list described tabs that did not exist
// yet; this guide covers only what ships (screening added in MB4, history
// match in MB5; MB6 adds contacts/forecast/report).
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-slate-200 mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-slate-400 leading-relaxed">{children}</p>;

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
      case and results are recomputed by the engine on demand, never replayed from stored numbers.
    </P>

    <H>2. Data</H>
    <P>
      Load the production history as cumulative volumes per observation date: pressure plus cumulative oil, gas and
      water (and injection where present). Upload CSV files or edit the table directly, then save. The first row is
      the initial state and must carry zero cumulative production. Two timesteps below initial pressure are the
      minimum for a regression; more history gives a far more trustworthy line.
    </P>

    <H>3. PVT</H>
    <P>
      Choose correlated PVT (Standing, Vasquez-Beggs or Glaso families with Hall-Yarborough or
      Dranchuk-Abou-Kassem z factors and McCain water properties) or paste a laboratory table. The preview shows the
      properties the engine will use. Save to make the configuration the case default; runs inherit it.
    </P>

    <H>4. Aquifer</H>
    <P>
      The tab has two segments. Model configures the aquifer the engine runs with: none, pot, Fetkovich or
      Carter-Tracy. Pot solves aquifer size from the regression itself; Fetkovich and Carter-Tracy march water influx
      from your aquifer geometry and properties. Carter-Tracy supports a finite aquifer through the radius ratio, and
      defaults water viscosity from the McCain correlation and the reservoir radius from area when you leave them
      blank; every defaulted value is named in the run warnings.
    </P>
    <P>
      Screening is the absorbed Aquifer Influx Calculator: it computes a We history entirely in the browser by
      van Everdingen-Hurst (the reference constant-terminal-pressure superposition), Carter-Tracy (with the exact
      bounded-circle pD when you set the radius ratio) or Fetkovich (aquifer volume and productivity index, derivable
      from geometry). Load the case's dated pressures, explore aquifer sizes until the influx looks right, compare
      against the dashed We from the last engine run, then press Use in model to write the screened parameters into
      the case. First-row time zero sets the initial pressure. The screen is an estimate; the engine run and its
      validation tier remain the authority.
    </P>

    <H>5. Run</H>
    <P>
      The tab has two segments. Regression runs the Havlena-Odeh straight line (or the p over z pot-aquifer plot for
      gas) on the server engine and reports OOIP or OGIP, aquifer size where applicable, the regression quality, and
      the drive index decomposition (depletion, gas cap, water and compressibility drives, which should sum to about
      one). Engine warnings surface anything the run had to assume or found suspicious.
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
      Diagnostic plots for the latest run: the Havlena-Odeh straight line, p over z for gas, drive indices through
      time and the water influx history. A straight line with scatter tells you more than a forced fit; curvature
      usually means the aquifer model or the gas cap size is wrong.
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
      with surveillance logs.
    </P>

    <H>9. Report</H>
    <P>
      Exports a PDF of the latest run (case summary, headline volumes with validation tier and benchmark reference,
      drive indices, pressure history, the history match with confidence intervals when one was run, and all engine
      warnings) plus a CSV with every per-timestep series for spreadsheet work.
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
