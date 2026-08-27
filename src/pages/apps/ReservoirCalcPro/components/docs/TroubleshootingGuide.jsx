import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const TroubleshootingGuide = () => (
  <Article
    title="Troubleshooting"
    lead="Real failure modes, their real causes, and the check that settles each one. Most bad volumes in this app come from a declared unit, a declared depth convention, or a filter that is still switched on."
  >
    <H2>The result is zero, or wildly implausible</H2>
    <P>
      Work through these in order. The first three account for most cases.
    </P>
    <OL>
      <li>
        <strong>Check which input method is active.</strong> The <Code>simple</Code> method is analytic. It
        multiplies area by thickness and has no depth reference at all, so OWC and GOC are ignored entirely.
        If you entered contacts and the volume did not move, this is why. Switch
        to <Code>hybrid</Code> (top surface plus a constant gross thickness) or <Code>surfaces</Code> (top
        plus base) to make contacts bite.
      </li>
      <li>
        <strong>Check the Z convention against the contacts.</strong> The engine converts a surface Z to a
        downward depth using the surface's declared convention: an <Code>elevation</Code> surface is negated,
        a <Code>depth</Code> surface is used as is. Your OWC and GOC are converted the same way. If the
        surface is declared elevation and you type a positive OWC, the contact lands above the structure and
        the reservoir column falls entirely into the water leg.
      </li>
      <li>
        <strong>Read the warnings.</strong> A contact-based run that finds nothing emits either
        <em> no hydrocarbon-bearing cells found</em> or <em>zero in-place volume with the column below the
        OWC</em>. A deterministic run also reports a consistency score out of 100 alongside its warning list,
        and both appear in the deterministic PDF under Input Quality Check.
      </li>
      <li>
        <strong>Check the petrophysics.</strong> The validator flags porosity outside 0 to 1, porosity above
        0.4, Sw outside 0 to 1, NTG outside 0 to 1, and non-positive area or thickness. An Sw of 1 or more
        leaves no hydrocarbon pore volume at all, which produces a legitimate zero.
      </li>
      <li>
        <strong>Check for a fraction entered as a percentage.</strong> Porosity, Sw and NTG are fractions.
        Recovery factors are percentages. A porosity of 20 rather than 0.20 is caught by the validator, but a
        recovery factor of 0.25 rather than 25 silently returns a hundredth of the recoverable volume.
      </li>
    </OL>

    <H2>The Bg unit mistake</H2>
    <P>
      This is the single most common gas error. PVT reports frequently quote Bg in rb/Mscf, while the input
      defaults to rcf/scf. The two differ by more than two orders of magnitude, and the number looks
      unremarkable either way.
    </P>
    <UL>
      <li>Typical Bg in rcf/scf or rm3/sm3 sits between about 0.002 and 0.05.</li>
      <li>The same gas in rb/Mscf is a number of order 1.</li>
      <li>
        Entering the rb/Mscf figure while the dropdown still reads rcf/scf raises the warning that a gas FVF
        above 0.1 is non-physical for most reservoirs, and costs 10 points of consistency score.
      </li>
    </UL>
    <P>
      The fix is to select the unit your report actually quotes rather than to convert by hand. Unit
      selection is a display setting, and the stored value stays canonical, so the conversion is exact and
      reversible.
    </P>
    <Note tone="warn" title="Which way the error goes">
      Since GIIP divides HCPV by Bg, a Bg that is too large by a factor of roughly 180 makes GIIP too small
      by the same factor. A gas volume that comes out implausibly small is almost always this.
    </Note>

    <H2>The grid does not cover the whole area</H2>
    <P>
      Contact-based volumetrics build a regular grid across the bounding box of your surface points, then
      discard any cell whose nearest control point is further away than a hull radius. That radius is twice
      the mean sample spacing, which is derived from the surface extent and its point count.
    </P>
    <P>
      This masking is deliberate. It stops the interpolator from inventing structure in the empty corners of
      a bounding box that the survey never covered. What it looks like when it surprises you:
    </P>
    <UL>
      <li>A sparse or irregularly shaped survey loses a visible fringe of cells around its edge.</li>
      <li>An L-shaped or crescent-shaped survey loses the empty interior of its bounding box, which is correct.</li>
      <li>A surface with very few points has a large mean spacing, so the hull radius is large and less is masked.</li>
    </UL>
    <P>
      If genuine reservoir area is being masked out, the cause is gaps in the control points. Add points, or
      regenerate the surface at a spacing that reflects the area you want integrated.
    </P>

    <H2>The gross rock volume is unexpectedly small</H2>
    <P>
      Check whether an AOI is still active. In the AOI panel the active polygon is highlighted and its button
      reads <Code>Active</Code>. An active AOI clips every integration cell to the polygon, and partially
      covered cells contribute only their covered fraction.
    </P>
    <P>
      Click the active AOI's name to deselect it and the clip is removed. Structural methods honour the
      active AOI; the simple method has no geometry and ignores it.
    </P>
    <Note tone="info" title="Selecting is not deleting">
      Deselecting an AOI leaves the polygon in the project. It stops filtering the calculation and stays
      available for the next run.
    </Note>

    <H2>Volumes wrong by a large factor on an imported surface</H2>
    <P>
      When a volume is out by roughly ten or eleven times, the XY unit declared at import does not match the
      coordinates in the file.
    </P>
    <Formula>1 m = 3.28084 ft, so an XY unit error scales AREA by 3.28084^2 = 10.76</Formula>
    <Table
      headers={['File actually contains', 'Declared at import', 'Effect on area and volume']}
      rows={[
        ['Metres', 'Feet', 'Roughly 10.76 times too small'],
        ['Feet', 'Metres', 'Roughly 10.76 times too large'],
        ['Metres', 'Metres', 'Correct'],
        ['Feet', 'Feet', 'Correct'],
      ]}
    />
    <P>
      Confirm the declared unit in the Data Manager, where every surface row prints its point count, its Z
      range, its XY unit and its Z convention. A quick sanity check on the coordinates themselves: UTM
      eastings in metres run to six digits, and the same survey in feet runs to seven.
    </P>
    <P>
      There is no in-place edit for a mis-declared surface. Re-import the file with the correct XY unit
      selected, then delete the wrong one.
    </P>

    <H2>A time surface imported by mistake</H2>
    <P>
      A two-way-time grid in milliseconds is not a length surface. Its Z axis carries travel time, so every
      thickness, every contact comparison and every volume derived from it is meaningless.
    </P>
    <P>
      When you pull a surface in from another Suite app, the import dialog labels each candidate as either
      depth or TWT and warns explicitly that a two-way-time surface will not produce meaningful volumetric
      results. Heed that warning. Depth convert the horizon in the app that produced it, then import the
      depth version.
    </P>
    <P>
      For a file import there is no such label, so check the Z range yourself. A TWT grid usually spans a few
      hundred to a few thousand milliseconds, and its numbers are positive even when the survey convention is
      elevation.
    </P>

    <H2>Monte Carlo reports a high rejection rate</H2>
    <P>
      When a normal or lognormal marginal carries truncation bounds, any draw falling outside those bounds is
      discarded and the whole realisation is dropped. If more than 5 percent of iterations are discarded the
      run adds a diagnostic warning naming the exact percentage, and the Detailed Audit PDF prints the
      rejected count alongside it.
    </P>
    <P>
      A high rate means the distribution is too wide for the bounds you gave it. The consequences are worth
      understanding:
    </P>
    <UL>
      <li>Your effective sample size is smaller than the iteration count you selected.</li>
      <li>The surviving sample is a truncated distribution, so its tails are thinner than you specified.</li>
      <li>P90 and P10 tighten toward P50, which understates the uncertainty you meant to model.</li>
    </UL>
    <P>
      Fix it by narrowing the standard deviation, widening the bounds, or switching that parameter to a
      triangular marginal, which is bounded by construction and never rejects.
    </P>

    <H2>Base-case drift warnings</H2>
    <P>
      With base-case consistency mode on, every distribution's central value is compared against the matching
      deterministic input. A central value more than 5 percent away is outlined in red under its editor with
      a note that it deviates from the base case, and running with any such deviation raises a toast saying
      the run is proceeding anyway.
    </P>
    <P>
      This is advisory and never blocks a run. A deliberately shifted distribution is a legitimate modelling
      choice. The warning exists to catch the accidental case where you edited a deterministic input and
      forgot to recentre the study, or the reverse.
    </P>
    <H3>A separate message about the Monte Carlo P50</H3>
    <P>
      The probabilistic results header reports how far the Monte Carlo P50 sits above or below the
      deterministic base case, in percent. A gap is expected and is not an error: the P50 of a product of
      distributions rarely equals the product of the base-case inputs. Above 40 percent the banner turns
      amber, which is a prompt to review whether your input distributions are centred where you think they
      are.
    </P>

    <H2>Nothing is there after a reload</H2>
    <P>
      The workspace lives in the browser tab. Reloading the page, closing the tab or navigating away discards
      inputs, surfaces, AOIs, results and any audit entries recorded since the last save. Only
      an explicit project save writes the model to your account, and saving requires being signed in.
    </P>
    <P>
      Map views saved from the visualisation panel behave differently again. They are written to the
      browser's own IndexedDB store on that machine and that browser profile. They are local, they are not
      part of the project, they do not travel in an exported workspace file, and clearing site data removes
      them. The Map Gallery lists the property maps held in the project, which is the set that does persist
      with a save.
    </P>
    <Note tone="danger" title="Save before anything irreversible">
      Save the project before switching reservoirs, before loading a different project and before starting a
      new one. Those actions replace the live workspace.
    </Note>

    <H2>A known label contradiction around the Z convention</H2>
    <P>
      Two pieces of interface text in the app disagree with each other, and neither of them controls the
      calculation.
    </P>
    <UL>
      <li>
        The banner above the geometry inputs states that the Z axis is negative downwards, giving the example
        that -8000 ft is deeper than -7000 ft.
      </li>
      <li>
        The helper line under the fluid contact fields states the opposite, that Z values are assumed to be
        depth, positive downwards.
      </li>
    </UL>
    <Note tone="warn" title="What actually governs">
      Neither label. The engine reads the <Code>zConvention</Code> stored on the surface itself, chosen at
      import as either Elevation with Z negative downward or Depth with Z positive downward. Contacts you
      type are interpreted in that same convention. Check the convention on the surface row in the Data
      Manager, match your OWC and GOC to it, and ignore both labels until they are reconciled.
    </Note>
    <P>
      A one-line check that removes all doubt: run once, then move the OWC 100 units in the direction you
      believe is deeper. If the volume grows, your sign convention matches the surface. If it shrinks, it
      does not.
    </P>
  </Article>
);

export default TroubleshootingGuide;
