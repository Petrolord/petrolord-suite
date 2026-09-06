// Rock Physics Studio in-app help guide (RP2, 2026-09-06). Full-page
// route on the shared HelpGuideLayout shell. Every control named here
// exists in the workstation today; the unit tables and curve aliases
// are quoted from the live services so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Ruler, Droplets, Activity, Triangle, UploadCloud, Link2, AlertTriangle, BookMarked,
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
  { id: 'avo', icon: Activity, title: 'AVO' },
  { id: 'wedge', icon: Triangle, title: 'Wedge and tuning' },
  { id: 'publish', icon: UploadCloud, title: 'Publishing and saving' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

const CURVE_ROLES = {
  DEPT: 'Measured depth, metres or feet as the log records',
  DT: 'Compressional sonic slowness (us/ft or us/m); Vp comes from it',
  DTS: 'Shear sonic slowness; Vs comes from it when present',
  RHOB: 'Bulk density (g/cc or kg/m3)',
  PHIE: 'Porosity, fraction or percent; the constant in the rock model stands in when absent',
  VSH: 'Shale volume, fraction or percent; drives the Greenberg-Castagna sand/shale split',
  SW: 'Water saturation; read for reference',
};

export default function RockPhysicsStudioHelpGuide() {
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
          can be published back to the well as logs for Seismolord ties and Well Correlation displays.
        </Para>
        <Para>
          Three panels: the registry wells and their curve inventory on the left, the Fluids &amp; Gassmann, AVO and
          Wedge views in the centre, and the scenario and rock model in the right dock. Every stored and computed
          value is SI; the ribbon's unit selectors change only what you see.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Pick a well">Click a registry well on the left. The inventory under it shows which engine inputs were found and from which curve.</Step>
        <Step n={2} title="Choose the zone">In Fluids &amp; Gassmann pick the zone. Zones come from Petrophysics Studio; a well without zones has nothing to substitute over.</Step>
        <Step n={3} title="Set the fluids">In the dock set the reservoir conditions, fluid A (in situ) and fluid B (substitute), each brine mixed with one hydrocarbon at its water saturation, and press Apply.</Step>
        <Step n={4} title="Read the result">The fluid table gives density and modulus of each fluid; the interval table gives Vp, Vs and density before and after; the chart shows both cases against depth.</Step>
        <Step n={5} title="Deliver">Publish substituted logs writes VP_SUB, VS_SUB and RHOB_SUB to the well. Save keeps the scenario, rock model, AVO and wedge settings in your account.</Step>
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
        <Callout tone="info" title="Estimated Vs is always badged">
          A well with no shear sonic gets Vs from the Greenberg-Castagna (1992) relations on the VSH sand and shale
          split, and the ribbon shows a Vs estimated badge for the whole well. Measured and estimated shear are never
          mixed within one well.
        </Callout>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Display units</SectionHeading>
        <Para>
          The Units selectors in the ribbon convert the tables, charts, zone and top labels and the manual AVO
          halfspaces. The engine, the saved project and the published curves stay in m/s, kg/m3 and metres. The
          choices are remembered in this browser; the depth unit starts from your Geoscience depth setting, the same
          one Mapping &amp; Surface Studio and Earth Modeling use.
        </Para>
        <Table headers={['Quantity', 'Choices']} rows={[
          ['Velocity', VELOCITY_UNITS.map((u) => u.label).join(', ')],
          ['Density', DENSITY_UNITS.map((u) => u.label).join(', ')],
          ['Depth', DEPTH_UNITS.join(', ')],
        ]} />
        <Para>
          A slowness choice shows sonic transit time instead of velocity: the column heads read DTp and DTs, and a
          faster rock has a smaller number.
        </Para>
      </GuideSection>

      <GuideSection id="fluids">
        <SectionHeading icon={Droplets}>Fluids and Gassmann substitution</SectionHeading>
        <Para>
          Each fluid side is brine mixed with one hydrocarbon at the water saturation you type: gas by its gravity,
          dead oil by API, live oil by API, gas to oil ratio and solution gas gravity. Brine follows the salinity in the
          conditions. The mixture modulus is the Wood (Reuss) average and the density the volume average. The table
          reports density, bulk modulus and, where the fluid has one, its own velocity.
        </Para>
        <SubHeading>The rock model</SubHeading>
        <Para>
          The mineral modulus is the Voigt-Reuss-Hill average of the mineral fractions in the dock, or the K_min
          override when typed. Porosity comes from the PHIE curve, or from the constant when the well has none. Dry
          rock moduli are inverted from the in-situ curves with fluid A, then refilled with fluid B, sample by sample
          over the zone.
        </Para>
        <Callout tone="warn" title="Samples the engine refuses">
          A sample whose inverted dry modulus is unphysical (for example porosity at or above the critical value, or a
          saturated modulus above the mineral modulus) is skipped and counted; the first reason is printed under the
          heading. The published curve carries the in-situ value at a skipped sample.
        </Callout>
      </GuideSection>

      <GuideSection id="avo">
        <SectionHeading icon={Activity}>AVO</SectionHeading>
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
      </GuideSection>

      <GuideSection id="wedge">
        <SectionHeading icon={Triangle}>Wedge and tuning</SectionHeading>
        <Para>
          The wedge convolves a Ricker wavelet with a top and base reflection coefficient across thicknesses from zero
          to the maximum, in two-way time. The panel draws the traces and the peak amplitude against thickness, and
          reports the tuning thickness, where the amplitude peaks. The defaults ({DEFAULT_WEDGE.freqHz} Hz Ricker,
          {DEFAULT_WEDGE.dtMs} ms sampling) tune at 16 ms; doubling the frequency halves the tuning thickness. The wedge
          needs no well.
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
          ['Petrophysics Studio, Well Correlation, Mapping & Surface Studio and the rest', 'Open in lists the Geoscience apps for the selected well; Petrophysics and Well Correlation open on that well.'],
          ['Seismolord', 'Ties a well with VP_SUB and RHOB_SUB to show the substituted synthetic.'],
          ['Geoscience home', 'The home icon at the left of the ribbon.'],
        ]} />
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
          ['Intercept and gradient', 'The Shuey A and B: the normal-incidence reflection coefficient and its change with the sine squared of the angle.'],
          ['Tuning thickness', 'The bed thickness at which the top and base reflections add to the largest amplitude.'],
          ['Slowness', 'Sonic transit time, the inverse of velocity, in us/ft or us/m.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
