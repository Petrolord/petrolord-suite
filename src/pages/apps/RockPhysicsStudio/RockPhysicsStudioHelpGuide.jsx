// Rock Physics Studio in-app help guide (RP2, 2026-09-06). Full-page
// route on the shared HelpGuideLayout shell. Every control named here
// exists in the workstation today; the unit tables and curve aliases
// are quoted from the live services so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import SharingHelp from '@/components/recordSharing/SharingHelp';
import React from 'react';
import {
  BookOpen, Zap, Database, Ruler, Droplets, Activity, Triangle, UploadCloud, Link2, AlertTriangle, BookMarked, ScatterChart, AreaChart,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { CURVE_ALIASES } from './services/prep';
import { VELOCITY_UNITS, DENSITY_UNITS, DEPTH_UNITS } from './services/units';
import { DEFAULT_AVO, DEFAULT_WEDGE } from './services/defaults';

const APP_PATH = '/dashboard/apps/geoscience/rock-physics-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Rock Physics Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'inputs', icon: Database, title: 'Wells, curves and zones' },
  { id: 'units', icon: Ruler, title: 'Display units' },
  { id: 'fluids', icon: Droplets, title: 'Fluids and Gassmann substitution' },
  { id: 'crossplot', icon: ScatterChart, title: 'Impedance against Vp/Vs' },
  { id: 'elastic', icon: ScatterChart, title: 'Elastic logs and the local shear trend' },
  { id: 'workbench', icon: ScatterChart, title: 'Multi-well crossplot' },
  { id: 'avo', icon: Activity, title: 'AVO and the wet trend' },
  { id: 'gather', icon: AreaChart, title: 'Angle gather' },
  { id: 'wedge', icon: Triangle, title: 'Wedge and tuning' },
  { id: 'publish', icon: UploadCloud, title: 'Publishing and saving' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

const CURVE_ROLES = {
  DEPT: 'Measured depth, metres or feet as the log records',
  DT: 'Compressional sonic slowness (us/ft or us/m); Vp comes from it. When absent, Vp is estimated and badged',
  DTS: 'Shear sonic slowness; Vs comes from it when present',
  RHOB: 'Bulk density (g/cc or kg/m3)',
  RT: 'Deep resistivity (ohm m); only used to estimate Vp with Faust when the well has no sonic',
  PHIE: 'Effective porosity, fraction or percent; used first. A Petrophysics PHIE published before 2026-09-07 is total porosity and is labelled so',
  PHIT: 'Total porosity, fraction or percent; used when there is no PHIE (the basis is shown)',
  VSH: 'Shale volume, fraction or percent; drives the Greenberg-Castagna sand/shale split, the Gassmann VSH limit and, when ticked, clay in K_min',
  SW: 'Water saturation; sets fluid A per sample when "Sw from the SW log" is ticked',
};

function RockPhysicsStudioHelpGuideContent() {
  return (
    <HelpGuideShell
      title="Rock Physics Studio Help Guide"
      subtitle="Batzle-Wang pore fluids, Gassmann fluid substitution, AVO and wedge tuning on the shared Geoscience well registry"
      metaDescription="How to load a registry well, set the in-situ and substitute fluids, run Gassmann over a zone, read AVO intercept and gradient, tune a wedge and publish the substituted logs in Petrolord Rock Physics Studio."
      backTo={APP_PATH}
      backLabel="Back to Rock Physics Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Rock Physics Studio is</SectionHeading>
        <Para>
          Rock Physics Studio is the quantitative-interpretation bench of the Geoscience module. It reads a well's
          sonic, density and porosity curves and its zones from the shared registry, computes the pore fluids with
          Batzle and Wang (1992), substitutes one fluid for another over a zone with Gassmann's equation, shows the
          amplitude-versus-offset response of an interface with the exact Zoeppritz solution next to the Shuey and
          Aki-Richards approximations, and tunes a wedge with a Ricker wavelet. The substituted velocities and density
          can be published back to the well as logs for Seismolord synthetics and Well Correlation displays.
        </Para>
        <Para>
          Three panels: the registry wells and their curve inventory on the left, the Fluids &amp; Gassmann,
          Crossplot, AVO, Gather and Wedge views in the centre, and the scenario and rock model in the right dock. Every stored and computed
          value is SI; the ribbon's unit selectors change only what you see.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Pick a well">Click a registry well on the left. The inventory under it shows which engine inputs were found and from which curve.</Step>
        <Step n={2} title="Choose the zone">In Fluids &amp; Gassmann pick the zone. Zones come from Petrophysics Studio; a well without zones has nothing to substitute over.</Step>
        <Step n={3} title="Set the fluids">In the dock set the reservoir conditions, fluid A (in situ) and fluid B (substitute), each brine mixed with one hydrocarbon at its water saturation, and press Apply.</Step>
        <Step n={4} title="Read the result">The fluid table gives density and modulus of each fluid; the interval table gives Vp, Vs and density before and after; the chart shows both cases against depth.</Step>
        <Step n={5} title="Deliver">Publish substituted logs writes VP_SUB, VS_SUB, RHOB_SUB and DT_SUB to the well. CSV downloads the substitution with a reviewer header (type the field and your name beside it); PDF gives the same header with the interval table, the zone-top AVO and three plots on one page to sign. Save keeps the well, zone, scenario, rock model, AVO and wedge settings in your account.</Step>
      </GuideSection>

      <GuideSection id="inputs">
        <SectionHeading icon={Database}>Wells, curves and zones</SectionHeading>
        <Para>
          Wells, curves, tops and zones are the registry's (Well Data Manager imports the LAS files, Petrophysics
          Studio and Well Correlation pick the tops and zones). Curves are matched by mnemonic; the first curve whose
          base name is in the list is used, and a numbered duplicate such as DT:2 is ignored.
        </Para>
        <Table headers={['Engine input', 'Accepted mnemonics', 'Role']}
          rows={Object.entries(CURVE_ALIASES).map(([key, aliases]) => [key, aliases.join(', '), CURVE_ROLES[key]])} />
        <Callout tone="info" title="How the curves were read">
          Sonic and density go through the same unit table as Petrophysics Studio. A sonic with no unit whose values
          would be faster than any rock as us/m is read as us/ft; a shear sonic with no unit is read in the unit that
          gives a physical Vp/Vs; porosity, VSH and Sw above 1.5 are percent; -999 values are nulls; a kg/m3 label on
          values near 2.3 is g/cc. Every such reading is listed under the curve inventory.
        </Callout>
        <Callout tone="info" title="Estimated Vs is always badged">
          A well with no shear sonic gets Vs from the Greenberg-Castagna (1992) relations on the VSH sand and shale
          split, and the ribbon shows a Vs estimated badge for the whole well. Measured and estimated shear are never
          mixed within one well.
        </Callout>
        <Callout tone="warn" title="Wells with no sonic log: Vp is estimated">
          A well with a density curve but no sonic still opens. Vp is then estimated, by default with the Gardner
          inverse from density (rho = 0.23 V^0.25, Gardner and others 1974), or with Faust from deep resistivity and
          measured depth (V = 1948 (Z R)^(1/6), Faust 1953) when you choose it. The ribbon shows a Vp estimated badge,
          and the status line, the CSV and PDF header, the published curves and their provenance all say estimated.
          The box under the curve list sets the method and its constant, calibrates it on a registry well that has a
          sonic (the misfit shown is the fit on that well, the best case) and publishes the estimate to the well as
          DT_EST. Checked on 2026-10-01 against the two registry wells that have a sonic, the Gardner inverse missed
          the measured Vp by 16 and 25 percent RMS and Faust by 17 and 70 percent, with little sample-to-sample
          correlation, and constants fitted on one well made the other worse. Use an estimated sonic to screen the
          size of a fluid effect; it is no basis for absolute impedance, an AVO class or a well tie. Faust reads
          hydrocarbon and fresh water as fast rock.
        </Callout>
        <Callout tone="info" title="Estimated Vs where the rock holds hydrocarbon">
          The Greenberg-Castagna relations are for brine-filled rock. In a gas sand the in-situ Vp is low, so applying
          them straight to it gives a Vs that is too low (16 to 26 percent in the validation cases). With Iterative Vs
          in hydrocarbon rock ticked (the default), each hydrocarbon sample is taken to brine with Gassmann, the
          relation is applied to the brine Vp, and the shear modulus is carried back; this repeats until Vs settles.
          With the SW log read, every sample whose Sw is below 1 is treated this way; with a typed Sw, only the
          selected zone. The basis line under the substitution heading says how many samples were iterated, and the
          CSV, the PDF and the published curves say the same.
        </Callout>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Display units</SectionHeading>
        <Para>
          The Units selectors in the ribbon convert the tables, charts, zone and top labels and the manual AVO
          halfspaces. The engine, the saved project and the published curves stay in m/s, kg/m3 and metres. Velocity,
          density and depth start from your Suite units (Units in the dashboard sidebar); a change here holds for this
          session, and the app says when the view differs from your units.
        </Para>
        <Table headers={['Quantity', 'Choices']} rows={[
          ['Velocity', VELOCITY_UNITS.map((u) => u.label).join(', ')],
          ['Density', DENSITY_UNITS.map((u) => u.label).join(', ')],
          ['Depth', DEPTH_UNITS.join(', ')],
          ['Temperature, pore pressure, GOR (dock)', 'degC or degF; MPa, bar, kPa or psi; m3/m3 (L/L) or scf/STB, from your Suite units'],
          ['Salinity (dock)', 'weight fraction, ppm or wt% NaCl'],
        ]} />
        <Para>
          A slowness choice shows sonic transit time in place of velocity: the column heads read DTp and DTs, and a
          faster rock has a smaller number.
        </Para>
      </GuideSection>

      <GuideSection id="fluids">
        <SectionHeading icon={Droplets}>Fluids and Gassmann substitution</SectionHeading>
        <Para>
          Each fluid side is brine mixed with one hydrocarbon at the water saturation you type: gas by its gravity,
          dead oil by API, live oil by API, gas to oil ratio and solution gas gravity. Brine follows the salinity in the
          conditions. The mixture modulus is the Wood (Reuss) average and the density the volume average. Fluid mixing in the dock switches to patchy saturation, the Voigt (arithmetic) average: the stiff bound, for phases that sit in patches too large for pore pressure to even out in a seismic period. A real rock lies between the two; ten percent gas takes most of the stiffness out of a uniform mix and almost none out of a patchy one, so run both to bracket the effect. The table
          reports density, bulk modulus and, where the fluid has one, its own velocity.
        </Para>
        <SubHeading>The rock model</SubHeading>
        <Para>
          The mineral modulus is the Voigt-Reuss-Hill average of the mineral fractions in the dock, or the K_min
          override when typed. Porosity comes from PHIE (effective), else PHIT (total), else the constant; the panel
          says which. With effective porosity the clay belongs to the solid: tick Clay from VSH and each sample's
          K_min mixes clay in at its VSH. When Petrophysics Studio&apos;s mineral model has been published on the well,
          tick Minerals from Petrophysics and each sample&apos;s K_min is the Voigt-Reuss-Hill mix of those fractions (their
          share of the solid); samples with no fractions use the table, and the heading counts them. Dry rock moduli are inverted from the in-situ curves with fluid A, then
          refilled with fluid B, sample by sample over the zone. With Sw from the SW log ticked, fluid A at each sample
          is brine and the hydrocarbon at that sample's log Sw.
        </Para>
        <SubHeading>Inputs from the other apps</SubHeading>
        <Para>
          When Pore Pressure Studio has published its PP curve on the well, the dock offers its mean over the selected
          zone under the pore pressure field (in your pressure unit); press the button, then Apply. The basis line, the
          CSV and the PDF then name Pore Pressure Studio as the source, and typing another number clears it. A PP curve
          in a mud-weight or gradient unit is converted at the true vertical depth from the well&apos;s survey.
        </Para>
        <Para>
          Tick Sw from saturation-height under fluid B to take fluid B&apos;s water saturation, sample by sample, from a
          SCAL Studio project&apos;s saturation-height function: the Sw at each sample&apos;s height above the free-water
          level, read through the same code Petrophysics Studio uses. Leave the free-water level blank to use the
          project&apos;s, or type another (true vertical depth subsea, in the depth unit) to see the logs as they would
          be with the contact elsewhere. Where the function has no value the typed Sw stands in, and the count is shown.
        </Para>
        <SubHeading>Gassmann limits</SubHeading>
        <Para>
          Gassmann holds for connected porosity in reservoir rock. Samples with VSH above the limit or porosity below it
          (0.5 and 0.03 by default) keep their in-situ values; the heading counts them and the published curves carry
          the in-situ values there. The interval table compares the substituted samples before and after, with
          acoustic impedance, Vp/Vs and Poisson&apos;s ratio beside Vp, Vs and density.
        </Para>
        <Callout tone="warn" title="Samples the engine refuses">
          A sample whose inverted dry modulus is unphysical (for example porosity at or above the critical value, or a
          saturated modulus above the mineral modulus) is skipped and counted; the first reason is printed under the
          heading. The published curve carries the in-situ value at a skipped sample.
        </Callout>
      </GuideSection>

      <GuideSection id="crossplot">
        <SectionHeading icon={ScatterChart}>Impedance against Vp/Vs</SectionHeading>
        <Para>
          Crossplot draws the zone&apos;s samples as acoustic impedance against Vp/Vs: the in-situ samples as dots
          coloured by Sw, VSH, porosity or depth, and the fluid-substituted samples as open diamonds. A gas sand plots
          at lower impedance and lower Vp/Vs than its brine state, so the two clouds show the size of the fluid effect
          at a glance. Impedance is in the display units; a long zone draws every n-th sample and says so.
        </Para>
        <SubHeading>Template lines</SubHeading>
        <Para>
          Three reference lines are computed at the conditions and mineral in Scenario &amp; rock. The brine sand line
          and the fluid B sand line use the critical-porosity model (Nur): the dry frame weakens linearly from the
          mineral at zero porosity to nothing at a porosity of 0.40, and Gassmann puts the fluid in; porosity is
          marked at 0.10, 0.20 and 0.30. The mudrock line is Castagna&apos;s (1985) brine trend with Gardner density.
          They are guides for reading the cloud. Under Rock model you can draw the lines from soft sand, stiff sand, constant cement or Xu-White instead, with their parameters, and fit the soft- or stiff-sand coordination number to the zone's water-bearing samples (Sw 0.9 or more).
        </Para>
      </GuideSection>

      <GuideSection id="elastic">
        <SectionHeading icon={ScatterChart}>Elastic logs and the local shear trend</SectionHeading>
        <Para>
          Elastic logs shows the zone means of AI, SI, Vp/Vs, Poisson&apos;s ratio, the bulk and shear moduli,
          λρ and μρ (Goodway, 1997) and the extended elastic impedance EEI at the angle χ you type (Whitcombe and
          others, 2002), and draws any of them against depth. EEI uses K, the zone mean of (Vs/Vp)², and the zone
          means of Vp, Vs and density as references, so EEI at 0 degrees is the acoustic impedance.
        </Para>
        <SubHeading>Local shear trend</SubHeading>
        <Para>
          On a well with a shear log, Fit to this zone regresses Vs on Vp over the zone&apos;s water-bearing samples
          (Sw 0.9 or more), linear or quadratic, and draws the 90 percent prediction interval. Use this trend
          saves it in the project. Wells with no shear log then take their Vs from the trend in place of
          Greenberg-Castagna, including the brine state of the hydrocarbon iteration, and carry a Vs uncertainty
          from the interval. The shear note on those wells names the trend, and counts samples outside the Vp
          range it was calibrated on.
        </Para>
      </GuideSection>

      <GuideSection id="workbench">
        <SectionHeading icon={ScatterChart}>Multi-well crossplot</SectionHeading>
        <Para>
          Multi-well plots any two of Vp, Vs, density, porosity, VSH, Sw, depth, AI, SI, Vp/Vs, Poisson&apos;s ratio,
          λρ, μρ and EEI for every well you tick, over every sample or a zone the wells share, and draws every
          sample. Colour by well, by fluid (Sw below 0.7 is hydrocarbon), by lithology (VSH below 0.5 is sand) or by
          a third property. EEI takes one K and one set of references across the wells, so they sit on one scale.
        </Para>
        <SubHeading>Pooling</SubHeading>
        <Para>
          The table gives each well&apos;s sample count, means and standard deviations, and the pooled values. When a
          well&apos;s mean sits more than one within-well standard deviation from the pooled mean, a note says so:
          the wells may be different populations (a depth trend, compaction or a different rock), and pooling them
          blurs the separation a feasibility study looks for.
        </Para>
        <SubHeading>Facies polygons</SubHeading>
        <Para>
          Draw a facies polygon, name it and close it; the table counts each well&apos;s samples inside it. A sample in
          two polygons counts in the first. Polygons belong to the axes and units they were drawn on.
          Write facies to the wells saves RP_FACIES on each plotted well you own, over its whole depth: 1, 2 and
          so on by polygon, 0 inside none. The polygons, axes and units travel with the curve. A well a colleague
          shared with you is read-only and is skipped with a note.
        </Para>
      </GuideSection>

      <GuideSection id="avo">
        <SectionHeading icon={Activity}>AVO and the wet trend</SectionHeading>
        <Para>
          From top averages the curves over a window either side of a registry top ({DEFAULT_AVO.windowM} m by default,
          typed in the depth unit) to give the upper and lower halfspaces. Manual halfspaces takes the six numbers
          directly, in the display units. The panel prints the Shuey intercept A and gradient B, the
          Rutherford-Williams class, the exact Zoeppritz reflection coefficient against angle with the two-term Shuey
          and the Aki-Richards curves, and the intercept-gradient crossplot with the class bands.
        </Para>
        <Table headers={['Class', 'Where it plots']} rows={[
          ['I', 'Positive intercept, negative gradient: a hard sand whose amplitude dims with offset.'],
          ['II', 'Intercept near zero: a phase change with offset.'],
          ['III', 'Negative intercept, negative gradient: the classic bright gas sand.'],
          ['IV', 'Negative intercept, positive gradient: a soft sand whose amplitude dims with offset.'],
        ]} />
        <SubHeading>Fluid replacement</SubHeading>
        <Para>
          In From top mode the panel also runs the lower rock through the same Gassmann substitution as the Fluids
          panel, with fluid B in place of fluid A as set in Scenario & rock, and draws that interface in amber beside
          the in situ one: the curve, the intercept and gradient, the class and a second crossplot point. Set fluid A
          to what the rock holds. On the harness gas sand, gas in situ and brine as fluid B shows the sand moving from
          class III to class II: the answer to what the sand would look like if it were wet. When fluid A is not what
          the rock holds, the substitution is unphysical and the panel says so.
        </Para>
        <SubHeading>The wet trend</SubHeading>
        <Para>
          Brine-filled sands and shales plot along a line through the origin of the intercept-gradient plane;
          hydrocarbons pull an interface off it. With Wet trend ticked the panel blocks the well&apos;s logs within
          the fit window around the top (150 m either side and 5 m blocks by default), takes the hydrocarbon out
          through the SW log where there is one, fits the line through the block boundaries and draws it with the
          background points. The distance of the in situ point and of the fluid B point from the line is printed:
          negative is the hydrocarbon side. When the window holds fewer than 8 interfaces, and for manual halfspaces,
          the line is Castagna, Swan and Foster&apos;s (1998) for the Vs/Vp at hand (B = -A at Vp/Vs = 2), and the
          panel says which line it drew and why. With no SW log any hydrocarbon in the window is part of the fit, and
          with estimated Vs the trend follows the Greenberg-Castagna line by construction; both are said.
        </Para>
      </GuideSection>

      <GuideSection id="gather">
        <SectionHeading icon={AreaChart}>Angle gather</SectionHeading>
        <Para>
          Gather draws the zone and a pad of rock above and below it as a synthetic angle gather, in situ beside the
          fluid-substituted case at one gain: one trace per incidence angle, the reflection coefficient of every
          interface at that angle (exact Zoeppritz, or Aki-Richards) placed in two-way time and convolved with the
          wavelet. Time runs downward from the top of the window. The chart below picks the amplitude at the zone top
          on each trace, and the table fits the intercept and gradient to the picks up to 30 degrees beside the
          single-interface values.
        </Para>
        <Para>
          The wavelet is a Ricker with the frequency and constant phase you type, or the wavelet Seismolord measured
          at this well when its tie was committed. Seismolord stores that wavelet&apos;s peak frequency and phase, so
          it is rebuilt here as a phase-rotated Ricker, and the summary line says so. The gather is primaries only,
          with one incidence angle per trace and no transmission loss or spreading; past the critical angle the real
          part of the exact coefficient is drawn and a note says so. The exact curve reproduces the two polarity
          reversals at 25 and 49 degrees published by van der Baan and Smit (2006) for their model.
        </Para>
        <Para>
          Publish gather to Seismolord saves the gather on screen (both cases, the angles, the wavelet and the picks)
          with your project. In Seismolord, open the synthetics window, pick the same well and press Show the Rock
          Physics angle gather: it is drawn there with the same picture, beside the well synthetic. It is your own
          project&apos;s gather (other users do not see it), time is from the top of the gather window, and publishing
          again replaces it.
        </Para>
      </GuideSection>

      <GuideSection id="wedge">
        <SectionHeading icon={Triangle}>Wedge and tuning</SectionHeading>
        <Para>
          The wedge convolves a Ricker wavelet with a top and base reflection coefficient across thicknesses from zero
          to the maximum, in two-way time. The panel draws the traces and the peak amplitude against thickness, and
          reports the tuning thickness, where the amplitude peaks. The defaults ({DEFAULT_WEDGE.freqHz} Hz Ricker,
          {DEFAULT_WEDGE.dtMs} ms sampling) tune at 16 ms; doubling the frequency halves the tuning thickness. The wedge
          Vp states the tuning thickness in depth as well (half the two-way time times the velocity: 16 ms at
          {' '}{DEFAULT_WEDGE.vpWedge} m/s is 20 m). The wedge needs no well.
        </Para>
      </GuideSection>

      <GuideSection id="publish">
        <SectionHeading icon={UploadCloud}>Publishing and saving</SectionHeading>
        <Para>
          Publish substituted logs writes three curves to the well in the registry: VP_SUB and VS_SUB in m/s and
          RHOB_SUB in kg/m3, over the well's whole depth grid, with the in-situ log outside the zone and the
          substituted case inside. The provenance records the zone, the scenario, the rock model, the mineral modulus,
          whether Vs was measured or estimated, and the input curves. Publishing again from the same project replaces
          those three curves; other apps' curves and other projects' publishes are left alone. The explorer lists
          what this app has published on the selected well.
        </Para>
        <Para>
          Save keeps the scenario, rock model, AVO and wedge settings as your project; it is restored when you return.
        </Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Well Data Manager', 'Well data in the ribbon opens the selected well on its logs, where the published curves are listed and can be deleted.'],
          ['Pore Pressure Studio', 'Its published PP curve fills the pore pressure of the fluids (the zone mean), on request.'],
          ['Petrophysics Studio and SCAL Studio', 'The published mineral model can set K_min per sample; a SCAL Studio saturation-height function can set fluid B Sw per sample.'],
          ['Petrophysics Studio, Well Correlation, Mapping & Surface Studio and the rest', 'Open in lists the Geoscience apps for the selected well; Petrophysics and Well Correlation open on that well.'],
          ['Seismolord', 'The synthetics window lists DT_SUB and RHOB_SUB (labelled fluid substituted) beside the measured sonic and density; pick them to see the substituted synthetic. A published DT_EST is listed last, labelled ESTIMATED sonic, with a warning that it is no basis for a tie. The gather published from the Gather view is shown there on request.'],
          ['Geoscience home', 'The home icon at the left of the ribbon.'],
        ]} />
              <SharingHelp record="project" where="Press Share in the ribbon once the project is saved.">
          <Para>
            Sharing the project also lets colleagues see its published gather in Seismolord's synthetics window for the same well.
            When colleagues have shared projects with you, a project list appears in the ribbon: My project, then Shared with me.
            The studio keeps one project per user, so Save a copy replaces your own project with what is on screen, after asking.
          </Para>
        </SharingHelp>
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The zone list is empty</SubHeading>
        <Para>The well has no zones in the registry. Add them in Petrophysics Studio (Zones) and reload the well.</Para>
        <SubHeading>Every sample is skipped</SubHeading>
        <Para>The porosity or the mineral modulus is inconsistent with the sonic and density curves. Check the units the curves were imported in, the PHIE curve, and the K_min override.</Para>
        <SubHeading>The numbers differ from Petrel</SubHeading>
        <Para>Compare in the same unit (choose it in the ribbon), the same fluid model (Batzle-Wang, Wood mixing) and the same mineral modulus. The engine matches its published references to the digit; a different mixing law or a different K_min is the usual reason.</Para>
        <SubHeading>Publish is disabled</SubHeading>
        <Para>No sample in the zone was substituted; see the skipped count. Publishing needs at least one substituted sample.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Gassmann', 'The relation between the dry, saturated, mineral and fluid bulk moduli of a porous rock at low frequency.'],
          ['K_min', 'The mineral (grain) bulk modulus; the Voigt-Reuss-Hill average of the mineral table unless overridden.'],
          ['Wood mixing', 'The Reuss average of the fluid moduli, weighted by saturation; the effective modulus of a uniform fluid mixture.'],
          ['Patchy saturation', 'Brine and hydrocarbon in separate patches; here mixed with the Voigt (arithmetic) average of their moduli, the stiff bound.'],
          ['Wet trend (fluid line)', 'The line brine-filled interfaces follow on the intercept-gradient plane; an interface with hydrocarbon sits off it.'],
          ['Pseudo-sonic', 'A P velocity estimated from density (Gardner inverse) or resistivity and depth (Faust) for a well with no sonic log; always marked estimated.'],
          ['Intercept and gradient', 'The Shuey A and B: the normal-incidence reflection coefficient and its change with the sine squared of the angle.'],
          ['Tuning thickness', 'The bed thickness at which the top and base reflections add to the largest amplitude.'],
          ['Slowness', 'Sonic transit time, the inverse of velocity, in us/ft or us/m.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}

// Design system rollout batch 4D: the guide follows the same per-user theme
// as Rock Physics Studio itself, so the look does not flip between the two pages.
export default function RockPhysicsStudioHelpGuide() {
  return (
    <div className="min-h-screen" data-testid="rp-help-theme-scope">
      <RockPhysicsStudioHelpGuideContent />
    </div>
  );
}
