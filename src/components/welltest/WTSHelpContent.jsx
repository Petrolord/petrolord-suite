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
      Pick a model from the catalog and drag the parameter sliders until the model curves sit on the data. The
      auto-fit runs Levenberg-Marquardt on pressure and derivative simultaneously, starting from your manual match,
      and reports 95% confidence intervals. Storage and skin trade off strongly at early time, so a sensible manual
      starting point improves the regression.
    </P>

    <H>RTA (production data)</H>
    <P>
      The RTA tab analyzes daily production data (time in days, rate, flowing pressure) instead of a shut-in
      transient. Material-balance time te = Q/q collapses any rate history onto the constant-rate equivalent during
      boundary-dominated flow, so the log-log rate-normalized drawdown and its derivative merge on a late unit
      slope. The flowing material balance regresses the rate-normalized drawdown against te: the slope gives the
      connected oil in place N (for gas, the dynamic material balance iterates G, average pressure and
      material-balance pseudo-time and yields G) and the intercept gives the productivity index. The straight line
      only means something once boundary-dominated flow is established. The transient linear card regresses the
      early data against the square root of time for xf sqrt(k) (Wattenbarger).
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
      p*. Set the fit window inside the radial stabilization seen on the Diagnostics tab; storage-affected early data
      biases k high. The sqrt-time plot diagnoses linear flow, and for drawdowns a late-time Cartesian line during
      pseudo-steady state yields the connected pore volume.
    </P>

    <H>5. Report</H>
    <P>
      The report tab consolidates the match, straight-line answers, derived quantities (kh, skin pressure drop, flow
      efficiency, radius of investigation) and your interpretation notes. Projects save automatically to your account;
      export a PDF report or a JSON snapshot for sharing, and send results onward: the average pressure, permeability
      and skin prefill a new Reservoir Balance material balance case, and the tested permeability lands in the
      Waterflood Design Studio displacement inputs.
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
      Oilfield units throughout: md, ft, cp, psi, STB/D, RB/STB, hours. All results are recomputed from inputs on
      load; nothing is stored stale. Engines are validated against an independent oracle and published literature
      examples (see the Reservoir module documentation).
    </P>
  </div>
);

export default WTSHelpContent;
