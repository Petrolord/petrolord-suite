// Seismolord in-app help guide (SL0, 2026-09-06). Full-page route on the
// shared HelpGuideLayout shell: the condensed, in-app companion of the
// nine Seismolord handbooks. Every control named here exists in the
// workspace today. Copy rule: no em dashes. Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Layers, Activity, GitBranch, CircleDot, Map as MapIcon, Box, Rows, Ruler, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { SURFACE_EXPORT_FORMATS } from './services/surfacesService';

const APP_PATH = '/dashboard/apps/geoscience/seismolord';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Seismolord is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (15 min)' },
  { id: 'volumes', icon: Database, title: 'Volumes and SEG-Y import' },
  { id: 'viewing', icon: Layers, title: 'Sections, slices and display' },
  { id: 'horizons', icon: Activity, title: 'Horizon interpretation' },
  { id: 'faults', icon: GitBranch, title: 'Fault interpretation' },
  { id: 'wells', icon: CircleDot, title: 'Wells, synthetics and well ties' },
  { id: 'maps', icon: MapIcon, title: 'The Map window, surfaces and export' },
  { id: 'cube', icon: Box, title: 'The 3D window' },
  { id: 'lines', icon: Rows, title: '2D lines and misties' },
  { id: 'units', icon: Ruler, title: 'Domains and units' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function SeismolordHelpGuide() {
  return (
    <HelpGuideShell
      title="Seismolord Help Guide"
      subtitle="3D and 2D seismic interpretation in the browser: SEG-Y volumes, horizons, faults, wells and ties, surfaces and the shared registry"
      metaDescription="How to import SEG-Y, view sections and slices, pick and track horizons, interpret faults, tie wells with synthetics, grid and export surfaces, and hand surfaces to the other Geoscience apps in Petrolord Seismolord."
      backTo={APP_PATH}
      backLabel="Back to Seismolord"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Seismolord is</SectionHeading>
        <Para>
          Seismolord is the seismic interpretation workstation of the Geoscience module. It decodes SEG-Y in the
          browser into bricked float32 volumes stored privately in your account, shows inlines, crosslines, time slices
          and traverses, tracks horizons and picks faults, ties registry wells with synthetics, grids horizons into
          surfaces and publishes them to the shared registry the other apps read. Every computation runs in your
          browser; nothing leaves your account but the objects you share.
        </Para>
        <Para>
          The layout is Petrel-like: the ribbon (Home, Interpretation, Wells, Surfaces, View and more) across the top,
          the explorer tree (Volumes, Horizons, Surfaces, Faults, Wells, Traverses, 2D lines) on the left, the viewer
          windows in the centre, the copilot dock on the right and the status bar with the cursor readout below.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (15 min)</SectionHeading>
        <Step n={1} title="Import a volume">Volumes, Import: choose a SEG-Y, confirm the inline, crossline and coordinate byte positions the scan proposes, declare the CRS, and let the decode run in the background.</Step>
        <Step n={2} title="Look around">Select the volume in Home; step inlines with the slider or the wheel; switch to crosslines and time slices; adjust gain, AGC and the colormap in the Display group.</Step>
        <Step n={3} title="Pick a horizon">Interpretation: New horizon, then click seeds on a section and Track along the line or through the volume; Undo and Redo cover every pick.</Step>
        <Step n={4} title="Tie a well">Wells: import a well or use one from the registry, load its sonic and density, build the synthetic and drag the tie; the T-D relation is saved with the well.</Step>
        <Step n={5} title="Map and publish">Surfaces: grid the horizon, look at it in the Map window in time or depth, then Publish it to the registry or export it as a file.</Step>
      </GuideSection>

      <GuideSection id="volumes">
        <SectionHeading icon={Database}>Volumes and SEG-Y import</SectionHeading>
        <Para>
          The import scan reads the binary and textual headers, proposes the byte positions of inline, crossline and
          coordinates from the traces themselves (the textual header is only a hint), detects IBM or IEEE samples and
          the coordinate scalar, and shows the measured geometry before anything is written. Decoding happens in a
          web worker and streams 64 by 64 by 64 float32 bricks to your private storage; the storage meter in the
          explorer shows what your account holds. Amplitudes are stored as they are; gain and AGC are display only.
        </Para>
        <Callout tone="warn" title="Declare the CRS">
          The project CRS in the status bar and the volume's CRS decide where wells and surfaces land. A volume
          imported under an unknown CRS cannot be mapped against the registry's wells.
        </Callout>
      </GuideSection>

      <GuideSection id="viewing">
        <SectionHeading icon={Layers}>Sections, slices and display</SectionHeading>
        <Para>
          Home chooses the active volume, the orientation (inline, crossline, time slice, traverse) and the line.
          The Display group sets gain, AGC, the colormap and its reversal, wiggle overlay and the overlay volume
          with its blend. Domain switches an inline or crossline from time to depth through the volume's velocity
          model (a constant, a gradient or a layer cake set in the Velocity model editor); depth is a display
          stretch, so picking stays in time.
        </Para>
      </GuideSection>

      <GuideSection id="horizons">
        <SectionHeading icon={Activity}>Horizon interpretation</SectionHeading>
        <Para>
          Seed picks snap to the chosen phase (peak, trough or zero crossing); Track along line follows the event
          across the section and Track volume grows the pick through the cube within the correlation and jump limits
          set in the Interpretation tab. Every horizon keeps versions; the explorer shows the chain and any version
          can be shown, compared or restored. Picks live on the volume's lattice in two-way time and are yours until
          you share the horizon with the organization.
        </Para>
      </GuideSection>

      <GuideSection id="faults">
        <SectionHeading icon={GitBranch}>Fault interpretation</SectionHeading>
        <Para>
          Faults are sets of sticks picked on sections; sticks on neighbouring lines are joined into a surface you
          can show in the Map and 3D windows. Fault polygons drawn in Mapping &amp; Surface Studio are listed under
          Culture and can be shown on the map for comparison.
        </Para>
      </GuideSection>

      <GuideSection id="wells">
        <SectionHeading icon={CircleDot}>Wells, synthetics and well ties</SectionHeading>
        <Para>
          Wells are the shared registry's (Well Data Manager): a deviation survey, tops, checkshots and logs. A
          registry well appears here with no re-import; import here writes to the registry too. The Wells tab
          builds a synthetic from sonic and density with the chosen wavelet, and the tie window drags the synthetic
          against the seismic; the resulting time-depth relation is saved with the well and drives its projection
          on sections and the map.
        </Para>
        <Para>
          Right-click a well in the explorer for Show or Hide, Well data (Well Data Manager on its tops) and Open in,
          which lists the other Geoscience apps for that well.
        </Para>
      </GuideSection>

      <GuideSection id="maps">
        <SectionHeading icon={MapIcon}>The Map window, surfaces and export</SectionHeading>
        <Para>
          The Map window draws a horizon as a structure map in two-way time or, with a velocity model, in depth; it
          extracts amplitude attributes along the horizon, contours and labels the map, and overlays wells, faults,
          registry surfaces and culture. Surfaces gridded from horizons are first-class objects: publish them to the
          registry for Mapping &amp; Surface Studio, Earth Modeling and ReservoirCalc Pro, or export them as files.
        </Para>
        <Table headers={['Format', 'Notes']} rows={SURFACE_EXPORT_FORMATS.map((f) => [f.label, `.${f.ext}`])} />
        <Callout tone="info" title="Sign convention">
          Exported and published depth surfaces are elevations: negative below the datum, in the unit the dialog
          states. Time surfaces stay positive two-way time in milliseconds.
        </Callout>
      </GuideSection>

      <GuideSection id="cube">
        <SectionHeading icon={Box}>The 3D window</SectionHeading>
        <Para>
          The 3D window shows the three slice planes, the interpreted horizons and faults and the wells in one
          cube; orbit with the mouse, exaggerate the vertical axis, hide a surface, and click a plane to open that
          orientation in the section viewer. Shift and wheel over a plane steps its position.
        </Para>
      </GuideSection>

      <GuideSection id="lines">
        <SectionHeading icon={Rows}>2D lines and misties</SectionHeading>
        <Para>
          2D SEG-Y lines import with their own CRS, draw their navigation on the map and open in the 2D Lines
          window, where horizons are picked along the line under the same names as in 3D. Where lines cross, the
          Misties tool measures the time difference at every crossing, solves least-squares bulk shifts per line and
          applies them as statics without changing the stored samples.
        </Para>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Domains and units</SectionHeading>
        <Para>
          Seismic is stored and picked in two-way time in milliseconds. Depth displays (the section's Depth domain,
          the map's depth domain, the cursor readout) convert through the velocity model. The Depth unit selector in
          Home (m or ft) starts from your Geoscience depth setting, the one Mapping &amp; Surface Studio, Earth
          Modeling and the other apps use, and is remembered in this browser. Wells keep their registry depths in
          metres and are converted at the edge like everything else.
        </Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Well Data Manager', 'Well data on a well in the explorer opens it on its tops; wells imported there appear here without re-import.'],
          ['Petrophysics Studio, Well Correlation, Pore Pressure Studio and the rest', 'Open in on a well lists the Geoscience apps for it.'],
          ['Mapping & Surface Studio and Earth Modeling', 'Published surfaces are listed there; their surfaces and fault polygons are listed here under Surfaces and Culture.'],
          ['ReservoirCalc Pro', 'Reads published surfaces in its Surface import.'],
          ['Geoscience home', 'The back arrow at the top of the explorer.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The wells do not land on the survey</SubHeading>
        <Para>The volume's CRS or the project CRS is unset or wrong. Both are declared, never guessed; fix them in the status bar and the volume settings.</Para>
        <SubHeading>Depth is greyed out</SubHeading>
        <Para>Set a velocity model in the Velocity model editor; a layer cake also needs its boundary horizons loaded.</Para>
        <SubHeading>The picks look one sample off after a tie</SubHeading>
        <Para>Picks live in time; the tie changes the well's time-depth relation, so the well moves, the picks do not.</Para>
        <SubHeading>An export opens flipped in another program</SubHeading>
        <Para>CPS-3 and ZMAP+ are column-major, north to south, and depth is negative down. The export dialog states the convention; match the reader's expectations rather than editing the file.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Brick', 'A 64 by 64 by 64 block of float32 samples; volumes are read brick by brick, never whole.'],
          ['Lattice', 'The inline, crossline, sample grid of a volume; picks are stored on it.'],
          ['Traverse', 'An arbitrary polyline section through the volume.'],
          ['Time-depth relation', 'The checkshot or tie-derived pairs that convert a well between time and depth.'],
          ['Mistie', 'The time difference between the same horizon on two crossing 2D lines.'],
          ['Static', 'A bulk time shift applied to a 2D line to remove its mistie.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
