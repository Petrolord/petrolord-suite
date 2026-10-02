// Help drawer content for the Well Test Analysis Studio.
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-pl-text mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-pl-muted leading-relaxed">{children}</p>;

const WTSHelpContent = () => (
  <div className="pb-8">
    <P>
      The studio takes a pressure transient test from raw gauge data to a matched analytical model: import and QC the
      data, diagnose flow regimes on the Bourdet derivative, match a model manually or by regression, confirm with the
      classic straight lines, and assemble the report.
    </P>

    <H>The diagnostics rail</H>
    <P>
      The rail down the right side follows you across tabs and shows the state of the interpretation as it stands:
      the test type, how many gauge points were imported and how many survived QC, the permeability and skin from the
      current match with their confidence intervals, and the derived quantities. It changes with the tab you are on
      so the numbers in view are the ones that matter to the step you are working through.
    </P>
    <P>
      It also flags a match that has gone stale. Change an input after a fit and the rail says so, which is the
      reminder to re-run the regression before quoting a number that was computed against the old inputs.
    </P>

    <H>1. Data</H>
    <P>
      Choose the test type and enter the reservoir and fluid properties (net thickness, porosity, wellbore radius,
      total compressibility, FVF, viscosity, rate, initial pressure). Add the field and analyst names beside the well
      name; all three head the PDF report.
    </P>
    <P>
      Import the gauge as a CSV with a time column and a pressure column in any order. The studio reads the column
      headers to find them (Time, Elapsed, Delta t, Date for time; Pressure, P, Pws, Pwf, BHP for pressure) and skips
      columns such as temperature or rate. Units written in the headers are picked up too: hours, minutes, seconds,
      days or date/time stamps for time, and psia, psig, kPa, bar or MPa (absolute or gauge) for pressure. After the
      import a mapping card shows the columns and units that were used, and changing any of them re-reads the file at
      once. Gauge readings are converted to absolute pressure by adding one standard atmosphere, because the analysis
      compares the gauge with the initial pressure in psia. A file without headers is read as time then pressure.
    </P>
    <P>
      For a buildup, set the producing time tp. When the gauge record also holds the flowing period, enter the shut-in
      time on the gauge clock: elapsed shut-in time Δt then counts from that moment and the flowing readings are set
      aside. The flowing pressure pwf at shut-in is the pressure at Δt = 0 hr. Enter it, or leave it blank and the
      studio takes the gauge reading at the shut-in, or failing that the last flowing reading in the 15 minutes before
      it. The Data tab states the value, the gauge time it refers to and where it came from. If none of these exist the
      earliest buildup point anchors the plot and skin is withheld. The spike filter removes isolated gauge outliers and dense data is thinned to a set number of points
      per log cycle. The Sample button loads a synthetic homogeneous buildup so you can explore the workflow.
    </P>
    <P>
      Fluid properties can also arrive from Fluid Systems Studio, so you need not type them in. Its Send to Well Test
      Analysis Studio button fills the formation volume factor and viscosity at the bubble point, with API gravity,
      solution GOR, gas gravity and temperature, and tells you it has done so. The handoff names the correlations (or
      the equation of state) the fluid model used, and the report prints them beside those values. Total
      compressibility is deliberately left for you to review, because ct depends on the rock and the saturations as
      well as the fluid.
    </P>
    <P>
      Identify the well and the test under Test setup: licence or block, zone or sand, the test dates and how the test
      was run (drill stem test, production test, wireline formation test, injectivity test). These head the report
      beside the well, field and analyst. Propose from the wells registry reads the wells you can see in Well Data
      Manager. Choose the well and, if it has zones, the zone tested. The studio then proposes the well name, the zone,
      the net pay, porosity and water saturation from a published Petrophysics zone summary, and the true vertical
      depths of the perforations through the well's deviation survey. Each proposal has a tick box and nothing
      changes until you press Apply.
    </P>
    <P>
      Total compressibility can be entered as one number or built from its components. Choose Built from components
      and enter the formation compressibility cf and each saturation with its fluid compressibility; the studio
      computes ct = cf + So co + Sw cw + Sg cg, uses it in the analysis and lists every term in the report. The
      saturations must sum to 1, and a phase that is present needs its compressibility. In gas mode a gas saturation
      with no cg takes the gas compressibility at pi from the correlation.
    </P>
    <P>
      Under Completion enter the perforated interval, top and base, in measured depth and in true vertical depth when
      you have it, and the top of the net pay. When the perforated length is less than the net pay h the studio
      computes the partial-penetration pseudo-skin with the Papatzacos (1987) correlation and the Report tab splits
      the total skin into that geometric part and the mechanical (damage) skin, s_d = (hp/h)(s - s_pp). The
      correlation needs kv/kh. Leave it blank and 0.1 is assumed, and the report says it is an assumption. True
      vertical depths are used when both ends carry one; measured depths are exact for a vertical hole only. A
      perforated length greater than h, or a kv/kh of zero, is refused with the reason and the skin stays undivided.
    </P>
    <P>
      Input sources and quality opens a list of the inputs. For each one say whether it was measured in the lab, taken
      from a correlation (and which one), borrowed from an offset well or assumed, and add a note on the sample
      quality or contamination. The report prints this in the Source column. An input you leave unstated prints as
      Entered, source not stated.
    </P>
    <P>
      The gauge import also reads a temperature column when the file has one (Temperature, Temp or BHT in the header,
      in degF or degC). It is plotted on the test overview with the pressure and the rate. The flow and shut-in
      summary on the Data tab lists one row per period of the rate history with its start, duration, rate and the
      volume produced; add the choke and the recovered volume for each period there. With no rate history the periods
      are taken from the test setup and the table says so.
    </P>

    <H>2. Diagnostics</H>
    <P>
      The log-log plot shows the pressure change and its Bourdet derivative against elapsed time (drawdown) or Agarwal
      equivalent time (buildup). The derivative is computed with a smoothing window of L log cycles (0.1 standard).
      Flow regimes are flagged from the derivative slope: unit slope for wellbore storage, a flat derivative for
      infinite-acting radial flow, half slope for linear flow, quarter slope for bilinear flow, and a late rise toward
      unit slope for closed-boundary depletion. The radial stabilization level itself fixes kh.
    </P>

    <H>3. Match</H>
    <P>
      Pick a model from the catalog and drag the parameter sliders until the model curves sit on the data. The
      auto-fit runs Levenberg-Marquardt on pressure and derivative simultaneously, starting from your manual match,
      and reports 95% confidence intervals. Storage and skin trade off strongly at early time, so a sensible manual
      starting point improves the regression.
    </P>
    <P>
      The auto-fit is optional. A match made with the sliders alone is reported as a manual match, with no regression
      status and no confidence intervals. The regression status and its intervals appear in the report only while the
      match still holds the values the auto-fit returned. Moving a slider, changing the model or editing the data
      after a fit turns the match back into a manual one.
    </P>

    <H>Units and gas pseudo-time</H>
    <P>
      The unit system selector on the Data tab switches every input and result between oilfield (psi, ft, STB/D) and
      SI (kPa, m, m3/d) display. Projects always store oilfield values internally, so switching is instant and
      lossless. Permeability stays in millidarcies in both systems. For gas tests the Diagnostics tab also offers a
      normalized pseudo-time abscissa, which integrates mu(p) ct(p) along the gauge pressures; the same transform is
      applied to the model overlay, and the straight-line analyses stay on elapsed time.
    </P>

    <H>Model catalog guidance</H>
    <P>
      Homogeneous: the workhorse. Storage hump, then a flat derivative whose level fixes kh. This is the only model
      that accepts negative skin; stimulated vertical wells belong here or on a fracture model.
    </P>
    <P>
      Sealing fault: the derivative doubles from the radial plateau to twice its level. The transition time fixes the
      distance L. Constant-pressure boundary: the pressure stabilizes and the derivative falls away late; typical of
      an aquifer, a gas cap or an active injector. Parallel faults (channel): after radial flow the derivative climbs
      on a half slope as flow becomes linear down the channel; the width W sets when. Closed circle: late unit slope
      on the derivative (pseudo-steady state); use the Cartesian line on the Specialized tab for the connected pore
      volume, and re fixes the drained radius.
    </P>
    <P>
      Closed rectangle: the general closed shape. The well sits at the four boundary distances L1/L2 (east-west) and
      W1/W2 (north-south), so an off-center well shows staged derivative doublings before the late unit slope; the
      product of the side lengths is the drainage area. With clean data the regression recovers the area well, but the
      individual distances trade off against each other unless the doublings are distinct, so seed any distances you
      know from geology as starting values before the auto-fit. A very long rectangle behaves as a channel until the
      far ends are felt.
    </P>
    <P>
      Dual porosity (Warren-Root): a dip in the derivative between two parallel radial stabilizations. The storativity
      ratio omega sets the depth of the dip (semilog line separation is half of ln(1/omega)) and lambda sets when the
      matrix wakes up. Choose pseudo-steady interporosity flow for a sharp dip or transient slabs for a shallower,
      earlier transition. Skin is bounded at zero on these models.
    </P>
    <P>
      Dual porosity with a sealing fault is the crossed case, for a fractured reservoir that also has a boundary in
      range of the test. Read it in two stages: the omega dip resolves first as the matrix begins to feed the
      fractures, then the derivative doubles when the fault is felt. It needs a long, clean test to be worth
      choosing, because a dip and a doubling that overlap in time are difficult to separate. If the two features are
      not clearly apart on the derivative, match the simpler dual porosity model and treat the late rise as
      unresolved. Do not reach for the extra parameter.
    </P>
    <P>
      Horizontal well: three regimes in sequence. Early radial flow in the vertical plane (plateau at
      70.6 qBmu divided by Lw times the square root of kh kv), then linear flow toward the well (half slope) once the
      top and bottom are felt, then late pseudoradial flow on the full kh h (plateau at 70.6 qBmu/kh h). The well
      length sets the first plateau level, kv/kh shifts when the boundaries arrive, and the standoff moves the
      transition shape. Skin here is referenced to kh h like every model in the catalog.
    </P>
    <P>
      Vertical fractures: infinite conductivity (Gringarten) shows an early half slope on both pressure and
      derivative; the half-length xf sets its level. Finite conductivity (Cinco-Ley) shows an early quarter slope
      (bilinear flow) controlled by FcD, then linear, then radial flow. Fractured wells usually need little or no
      extra skin; use the choked-fracture skin only for a damaged connection. The finite-conductivity solution solves
      a small linear system per point, so its auto-fit takes noticeably longer than the other models.
    </P>

    <H>4. Specialized</H>
    <P>
      The Horner plot (buildup) or MDH semilog plot (drawdown) gives the slope m, permeability, skin and extrapolated
      p*. With both window bounds empty the line is fitted over the radial flow detected on the Diagnostics tab, and
      the rail says which hours it used; type a bound to set your own window. Keep a manual window inside the radial
      stabilization: storage-affected early data steepens the line and pulls k well below the truth (on the sample
      test a line through every point gives 23 md against 85). The sqrt-time plot diagnoses linear flow, and for drawdowns a late-time Cartesian line during
      pseudo-steady state yields the connected pore volume. The report quotes the sqrt-time slope only when linear flow
      was detected or you set its window.
    </P>

    <H>5. RTA (production data)</H>
    <P>
      The RTA tab analyzes daily production data (time in days, rate, flowing pressure), which is a different kind of
      input from the shut-in transient the other tabs work on. Material-balance time te = Q/q collapses any rate
      history onto the constant-rate equivalent during boundary-dominated flow, so the log-log rate-normalized
      drawdown and its derivative merge on a late unit slope. The flowing material balance regresses the
      rate-normalized drawdown against te: the slope gives the connected oil in place N (for gas, the dynamic material
      balance iterates G, average pressure and material-balance pseudo-time and yields G) and the intercept gives the
      productivity index. The straight line only means something once boundary-dominated flow is established. The
      transient linear card regresses the early data against the square root of time for xf sqrt(k) (Wattenbarger),
      and you can override the window it regresses over when the automatic pick lands on the wrong stretch of data.
    </P>

    <H>6. Report</H>
    <P>
      The report tab consolidates the match, straight-line answers, derived quantities (kh, skin pressure drop, flow
      efficiency, radius of investigation), the flow regimes read off the diagnostic plot, the rate transient results
      where production data was analyzed, and your interpretation notes. The PDF header lists the project, well,
      field, licence, zone, analyst, test type and dates, the perforations in MD and TVD, producing time, the shut-in
      time and the pwf at shut-in time 0 hr. Projects save automatically to your account;
      export a PDF report or a JSON snapshot for sharing. The JSON carries the whole study, including the gas
      deliverability points, the rate transient inputs, the unit system, the identification, the completion, the
      input sources and the period notes, so a colleague opens it in the state you left it. Import project JSON
      reads such a file back into the workspace.
    </P>
    <P>
      The report is written for the person who has to sign it. It carries a Reservoir and fluid inputs table with
      every value the analysis used, its unit and its source; the skin components; a cross-check that sets the
      permeability and skin from the model match beside the Horner or MDH line and the multi-rate line; the flow
      regimes with their time windows; and the flow and shut-in summary. Anything not provided prints as n/a.
    </P>
    <P>
      The PDF also carries the plots, drawn from the same series as the tabs: the test overview (pressure and rate,
      and temperature when it was imported), the log-log plot with the model match and the flow-regime windows
      shaded, the Horner or MDH plot with its straight line, fit window and slope, the history match, and the rate
      transient plots when production data is loaded. The square-root-of-time plot appears only when linear flow was
      detected or you set its window. A plot that does not apply is replaced by one line saying why, and the Report
      tab lists which plots the PDF will carry.
    </P>
    <P>
      Results also travel to other studios directly. Sending to Material Balance Studio opens a new case with the
      average pressure carried in as the initial pressure, along with the reservoir temperature, the fluid system
      and a case name taken from the well. Permeability and skin travel in the notification text for reference and
      are not written into the case, because material balance has no field for them. Sending to Waterflood Design
      Studio writes the tested permeability into the displacement inputs, where it feeds the dip and gravity term.
    </P>

    <H>Gas wells, injection tests and multi-rate</H>
    <P>
      Setting the fluid to gas runs every analysis in real-gas pseudo-pressure m(p), built from the Papay z-factor and
      Lee-Gonzalez-Eakin viscosity correlations at reservoir temperature (leave ct blank to use the computed gas
      compressibility at pi). Permeability and skin come from the 1637 qT/kh semilog slope; the reported skin on a gas
      well is the apparent skin s' which includes the rate-dependent term. The Specialized tab adds gas deliverability:
      enter flow-after-flow or isochronal points to get the Rawlins-Schellhardt C and n, the Houpeurt LIT coefficients
      a and b, and the AOF by both methods.
    </P>
    <P>
      Injection and falloff tests mirror onto the drawdown and buildup machinery with q the injection rate: an
      injection raises pressure above pi exactly as a drawdown lowers it, and a falloff decays from the shut-in
      injection pressure like a buildup in reverse. Enter the injection time as tp for a falloff. When the rate history
      holds more than one flowing rate, the studio also fits the Odeh-Jones multi-rate superposition line and reports
      its k and skin next to the single-rate answers.
    </P>

    <H>Conventions</H>
    <P>
      Display units follow the selector on the Data tab, in either oilfield (md, ft, cp, psi, STB/D, RB/STB, hours) or
      SI (kPa, m, m3/d). Permeability stays in millidarcies in both. Projects store oilfield values internally
      whichever system you are viewing, so switching is instant and nothing is lost in the round trip. All results are
      recomputed from inputs on load; nothing is stored stale. Engines are validated against an independent numerical
      oracle and against published worked examples from the well test literature.
    </P>
  </div>
);

export default WTSHelpContent;
