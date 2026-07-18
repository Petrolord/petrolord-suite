// Help drawer content for SCAL Studio. Covers only what ships (SC3: Curves
// and Capillary; Lab Data, Height and Export join in SC4-SC5). Plain
// sentences, no em dashes (owner copy rule).
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-slate-200 mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-slate-400 leading-relaxed">{children}</p>;

const ScalHelpContent = () => (
  <div className="pb-8">
    <P>
      SCAL Studio is the special core analysis workstation: design Corey relative permeability curves, build
      capillary pressure through the Leverett J-function, and scale both to your reservoir rock. The scope is
      deliberately thin and validated. Corey and Leverett J only, with the math golden-tested against the Leverett
      collapse principle; LET correlations, hysteresis and three phase models are out of scope until this core has
      earned its keep in real studies.
    </P>

    <H>1. Curves</H>
    <P>
      Corey parameter sets for oil-water and gas-oil systems: endpoint saturations, endpoint kr values and the two
      exponents. The chart draws the curves on a linear or semilog axis. The optional fractional flow preview shows
      the mobility picture for the oil-water set at your viscosities; it is curves only, and displacement design
      (Welge tangents, breakthrough, recovery) stays in the Waterflood Design Studio where it belongs.
    </P>

    <H>2. Lab Data</H>
    <P>
      Core samples with their rock properties and lab tables. Import kr and Pc CSVs per sample (templates are a
      click away; the lab system presets fill sigma and theta for air-brine, air-mercury and oil-brine
      measurements). Each sample with a kr table gets a Corey fit with confidence intervals; apply a fit to the
      Curves tab with one click. The normalized overlay compares curve shapes across samples so you can judge
      whether one exponent set represents the rock. Averaging stays your decision; the studio shows the spread and
      never silently blends. The synthetic demo pair is generated from one shared J curve, so the Capillary tab
      shows the Leverett collapse working.
    </P>

    <H>3. Capillary</H>
    <P>
      The working J-function. In manual mode you type a power law J = a times Sw-star to the minus b, with Sw-star
      the saturation normalized above Swirr. In samples mode the studio averages the J tables computed from your
      lab capillary data (geometric mean on a shared normalized axis) and refits the power law; a poor refit
      usually means the shared Swirr needs the override. The reservoir rock inputs scale the J curve back to a
      capillary pressure curve through Pc = J sigma cos theta divided by 0.21645 root k over phi.
    </P>

    <H>Projects</H>
    <P>
      Projects save to your account (inputs only; every curve and fit is recomputed from inputs on load). Autosave
      runs a few seconds after your last change once a project is open.
    </P>

    <H>Validation</H>
    <P>
      The engine is pinned by jest suites: Corey identities and fitting recovery, the exact Pc to J round trip, and
      the Leverett collapse test in which capillary data from three very different rocks must reduce to a single J
      curve to machine precision, which is the 1941 paper's central claim.
    </P>
  </div>
);

export default ScalHelpContent;
