// Help drawer content for the Well Test Analysis Studio.
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-slate-200 mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-slate-400 leading-relaxed">{children}</p>;

const WTSHelpContent = () => (
  <div className="pb-8">
    <P>
      The studio takes a pressure transient test from raw gauge data to a matched analytical model: import and QC the
      data, diagnose flow regimes on the Bourdet derivative, match a model manually or by regression, confirm with the
      classic straight lines, and assemble the report.
    </P>

    <H>1. Data</H>
    <P>
      Choose the test type and enter the reservoir and fluid properties (net thickness, porosity, wellbore radius,
      total compressibility, FVF, viscosity, rate, initial pressure). Import the gauge as a two-column CSV: elapsed
      time in hours (shut-in time for a buildup) and pressure in psi. For a buildup, set the producing time tp and the
      flowing pressure at shut-in; if left blank the earliest gauge point is used. The spike filter removes isolated
      gauge outliers and dense data is thinned to a set number of points per log cycle. The Sample button loads a
      synthetic homogeneous buildup so you can explore the workflow.
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
      Pick a model from the catalog (homogeneous with wellbore storage and skin in this release; fractured, dual
      porosity and bounded models follow) and drag the parameter sliders until the model curves sit on the data. The
      auto-fit runs Levenberg-Marquardt on pressure and derivative simultaneously, starting from your manual match,
      and reports 95% confidence intervals. Storage and skin trade off strongly at early time, so a sensible manual
      starting point improves the regression.
    </P>

    <H>4. Specialized</H>
    <P>
      The Horner plot (buildup) or MDH semilog plot (drawdown) gives the slope m, permeability, skin and extrapolated
      p*. Set the fit window inside the radial stabilization seen on the Diagnostics tab; storage-affected early data
      biases k high. The sqrt-time plot diagnoses linear flow, and for drawdowns a late-time Cartesian line during
      pseudo-steady state yields the connected pore volume.
    </P>

    <H>5. Report</H>
    <P>
      The report tab consolidates the match, straight-line answers, derived quantities (kh, skin pressure drop, flow
      efficiency, radius of investigation) and your interpretation notes. Projects save automatically to your account;
      export a JSON snapshot for sharing. PDF export and result handoffs to Reservoir Balance arrive in a later phase.
    </P>

    <H>Conventions</H>
    <P>
      Oilfield units throughout: md, ft, cp, psi, STB/D, RB/STB, hours. All results are recomputed from inputs on
      load; nothing is stored stale. Engines are validated against an independent oracle and published literature
      examples (see the Reservoir module documentation).
    </P>
  </div>
);

export default WTSHelpContent;
