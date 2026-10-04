// Help drawer content for SCAL Studio. Covers every tab (Curves, Lab Data,
// Capillary, Height and Saturation, Report, Export) and the upgrade of
// 2026-10 (SCAL-U1: report, kr-1 handoff, units, lab doors, datum, sharing).
// Plain sentences, no em dashes (owner copy rule).
import React from 'react';

const H = ({ children }) => <h4 className="text-sm font-semibold text-pl-text mt-5 mb-1.5">{children}</h4>;
const P = ({ children }) => <p className="text-xs text-pl-muted leading-relaxed">{children}</p>;

const ScalHelpContent = () => (
  <div className="pb-8" data-testid="scal-help">
    <P>
      SCAL Studio is the special core analysis workstation: design Corey relative permeability curves, fit them to
      core data, build capillary pressure through the Leverett J-function, and scale both to your reservoir rock.
      The scope is deliberately thin: Corey and Leverett J only. There is no hysteresis between drainage and
      imbibition, no three-phase model and no LET or Thomeer form; the report says so in its limits.
    </P>

    <H>Units</H>
    <P>
      The selector in the header shows the project in oilfield or SI units (Pc in psi or kPa, IFT in dyn/cm or
      mN/m, depths and heights in ft or m, temperature in degF or degC). A new workspace follows your Suite unit
      profile; a saved project keeps the system it was saved with. Values are stored in field units underneath,
      which is what other apps read, so switching never changes a number, only how it is shown.
    </P>

    <H>1. Curves</H>
    <P>
      Corey parameter sets for oil-water and gas-oil systems: end point saturations, end point kr values and the two
      exponents. Under each set the app says where it came from: entered by you, or fitted to a sample's
      lab table (with the fit's r2), or fitted and then edited, in which case the fit statistics no longer describe
      it. The optional fractional flow preview is curves only; displacement design stays in the Waterflood Design
      Studio.
    </P>

    <H>2. Lab Data</H>
    <P>
      Core samples with their rock properties, their pedigree (lab or analog, the kr and Pc test methods, drainage
      or imbibition, wettability, core condition, test temperature, laboratory and report number) and their lab
      tables. The kr, gas-oil and Pc doors read CSV, tab, semicolon or space separated files and Excel workbooks
      (the first sheet that holds the table is read, and its name is kept), with comma decimals, a header
      in any order or none, and units in the header such as Pc (kPa) or Sw (%). When the file names no unit, the
      unit you choose above the buttons is used. After each import the app shows what it read: which column became
      what, in which unit, how many rows were read and every row left out with the reason. The same record goes
      into the report.
    </P>
    <P>
      Each sample with a kr table gets a Corey fit of the two exponents with 95 percent confidence intervals; Swc
      and Sor come from the first and last rows of the table. When the table stops short of an end point, as
      unsteady-state data often do at residual oil, state Swc and Sor for the fit on the sample: every row must
      lie between them, and the kr end point the table does not reach becomes a fitted value with its own
      confidence interval. The card, the report and the kr-1 block say which end points were entered and which
      were fitted. Apply a fit to
      the Curves tab with one click; the record of the fit travels with the set. The normalised overlay compares
      curve shapes across samples. The synthetic demo pair is marked as an analog wherever it is printed.
    </P>
    <P>
      A sample can also carry a gas-oil table at connate water (Sg, krg, krog), read by its own door. It is fitted
      the same way, at the Swc of the test: the one you state for the sample, or else the working gas-oil Swc. Sgc
      is the first Sg of the table and Sorg is 1 minus Swc minus its last Sg. Use gas-oil fit on the Curves tab
      applies it, and the gas-oil set then says which sample it was fitted to, on screen, in the report and in the
      kr-1 block.
    </P>

    <H>3. Capillary</H>
    <P>
      The working J-function. In manual mode you type a power law J = a times Sw-star to the minus b, with Sw-star
      the saturation normalised above Swirr. In samples mode the studio averages the J tables computed from your lab
      capillary data (geometric mean on a normalised axis) and refits the power law. One Swirr is used for every
      sample, both to normalise them and to map the fit back to Sw: the override when you type one (it must sit below
      the lowest Sw of every sample), otherwise the lowest Sw of the included samples less 0.02. Fit Swirr with a
      and b fits the three together to the pooled lab J of the included samples and uses that Swirr, with its 95
      percent interval printed beside it; the lowest Sw less 0.02 is only a guess and sets the start. The reservoir rock
      inputs scale the J curve to capillary pressure through Pc = J sigma cos theta divided by 0.21645 root k over
      phi; the lab points scaled the same way are drawn over the curve.
    </P>

    <H>4. Height and Saturation</H>
    <P>
      Converts the reservoir Pc curve into a saturation-height profile with h equal to Pc over 0.4335 times the
      water minus hydrocarbon specific gravity difference. The free water level is entered as TVDSS, or as TVD below
      the depth reference of a well from the wells registry, which the Suite's datum module turns into TVDSS (or
      refuses, with the reason, when the well has no reference elevation). The FWL is marked on the chart.
    </P>
    <P>
      The water and oil gravities can come from a saved Fluid Systems Studio project: choose it (or open SCAL Studio
      with the project in the address), state the reservoir pressure or leave it at the bubble point, and take them.
      The oil density is the stock-tank oil and its dissolved gas over Bo, and the brine density the standard density
      for the salinity over Bw, read from the project's PVT table at that pressure and never extrapolated past it. A
      card beside them keeps the source: it says when the Fluid project now holds a different fluid, and when you
      typed over a value. The interfacial tension is not part of the Fluid project's PVT block, so it stays as entered.
    </P>

    <H>5. Report</H>
    <P>
      The Special Core Analysis Report as a PDF: identification (company, field, licence, well, zone, cored interval,
      laboratory, report number, dates, analyst, build and units), headline results, every input with its unit and
      source, the Leverett scaling by component, the samples and their pedigree, the lab tables imported, the Corey
      fits, the averaged J, the model and its basis, the limits of the analysis with flags, the tables, the kr-1 block
      and the figures of the other tabs. State the source of each input on this tab; a value still at the app's
      starting value prints as an assumption.
    </P>

    <H>6. Export</H>
    <P>
      Send to Waterflood Design Studio hands over the working oil-water set with its kr-1 block: where it came from,
      the sample pedigree, the project and the time. A saved project is saved first and its id goes in the address,
      so Waterflood can read it again by id; Waterflood keeps the source with its own project and shows it on a card
      that says when the SCAL project changed since or when a value was edited after the intake. Petrophysics,
      Earth Modeling, Rock Physics and ReservoirCalc Pro read the saturation-height function of a saved project by
      id and print its source.
    </P>
    <P>
      Simulator keywords writes the working sets as SWOF and SGOF tables for an Eclipse or OPM Flow deck, in FIELD
      units (Pc in psi) or METRIC units (Pc in bar). SWOF runs from Swc to Sw = 1, with the capillary pressure of
      the working J curve in its fourth column when that switch is on; SGOF runs from Sg = 0 to 1 minus Swc, so the
      two tables close, which needs the same Swc in both sets. Gas-oil capillary pressure is written as zero. The
      file opens with comment lines saying where the curves came from, the units and the conventions. The export
      is refused, with the reason, when the two Swc differ or when Swc sits at or below the Swirr of the J curve
      (the power law has no finite Pc there). Simulation Studio reading the file by id comes with its own round.
    </P>
    <P>
      The CSV files (oil-water kr, gas-oil kr at connate water, reservoir Pc, saturation-height) open with lines starting with # that say where they came
      from and in which units. The project JSON is the saved payload itself; importing it restores the whole
      project on screen. Every chart has a PNG download button.
    </P>

    <H>Projects and sharing</H>
    <P>
      Projects save to your account with autosave about ten seconds after a change. You can share a project with
      your organisation for viewing or editing; a colleague edits one at a time with the check-out bar, a newer
      save made elsewhere is refused with the reason, and Save a copy makes your own version.
    </P>

    <H>Validation</H>
    <P>
      The engine is pinned by jest suites: Corey identities and fitting recovery, the exact Pc to J round trip, and
      the Leverett collapse test in which capillary data from three very different rocks reduce to a single J curve
      to machine precision. The Leverett 1941 drainage curve is armed as a literature golden from its reproduction
      in Ahmed, Reservoir Engineering Handbook (Figure 4-18 and Example 4-7). A re-read of the original 1941 scan is
      recorded as pending until the source document is supplied, and is not quietly passed.
    </P>
  </div>
);

export default ScalHelpContent;
