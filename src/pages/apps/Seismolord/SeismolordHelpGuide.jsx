// Seismolord in-app help guide (SL0, 2026-09-06). Full-page route on the
// shared HelpGuideLayout shell: the condensed, in-app companion of the
// nine Seismolord handbooks. Every control named here exists in the
// workspace today. Copy rule: no em dashes. Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Layers, Activity, GitBranch, CircleDot, Map as MapIcon, Box, Rows, Ruler, Link2, AlertTriangle, BookMarked,
  Waves, Sparkles,
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
  { id: 'attributes', icon: Waves, title: 'Attribute volumes and co-rendering' },
  { id: 'wells', icon: CircleDot, title: 'Wells, synthetics and well ties' },
  { id: 'automation', icon: Sparkles, title: 'Tops to Horizons and automatic faults' },
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
        <SubHeading>What Seismolord makes for you, and what you ask for</SubHeading>
        <Para>
          An import makes the volume itself and, for large surveys, an 8-bit display copy for fast viewing. Nothing
          else is computed until you ask: attribute volumes (Interpretation, Attribute volume), horizons and faults
          (by hand, by seeded tracking, or automatically through Tops to horizons), surfaces (Make surface) and maps.
          Every automatic result is a proposal you review; nothing is saved until you accept it.
        </Para>
        <SubHeading>Start here and the tour</SubHeading>
        <Para>
          Start here, at the top right beside Help, opens a panel in the right dock that lists what the upload made
          for the open volume, what it already has (attribute volumes, horizons and how many came from well tops,
          faults and how many were picked automatically, wells, surfaces, the velocity model) and the next steps.
          Each step has a Go button, or says why it is not available yet, for example while a large survey is still
          uploading its full-precision copy. The first visit in a browser opens Start here and a short tour of the
          workspace; Take the tour at the bottom of Start here runs it again.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (15 min)</SectionHeading>
        <Step n={1} title="Import a volume">Volumes, Import: choose a SEG-Y, confirm the inline, crossline and coordinate byte positions the scan proposes, declare the CRS, and let the decode run in the background.</Step>
        <Step n={2} title="Look around">Select the volume in Home; step inlines with the slider or the wheel; switch to crosslines and time slices; adjust gain, AGC and the colormap in the Display group.</Step>
        <Step n={3} title="Pick a horizon">Interpretation: New horizon, then click seeds on a section and Track along the line or through the volume; Undo and Redo cover every pick.</Step>
        <Step n={4} title="Tie a well">Wells: import a well or use one from the registry, load its sonic and density, build the synthetic and drag the tie; the T-D relation is saved with the well.</Step>
        <Step n={5} title="Let the wells build the framework">With wells that carry tops shown, Interpretation: Tops to horizons ties the wells, matches every top to its seismic event, can pick the faults for you, tracks one named horizon per top and saves them when you Accept.</Step>
        <Step n={6} title="Make a surface">Right-click the horizon in the explorer and choose Make surface: Grid in Seismolord shows the surface in the Map window, Publish to the registry saves it for Mapping &amp; Surface Studio. Export writes it as a file.</Step>
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
        <SubHeading>Large surveys</SubHeading>
        <Para>
          Before anything is written, check the survey the scan reports (samples per trace, sample interval, format
          code, trace count, inline and crossline ranges) against what you know of the data; stop if they disagree.
          View it now in the import dialog shows inlines and crosslines straight from the file on your computer while
          it converts. The conversion then uploads in two stages in the background, with progress in the status bar:
          first a compact display copy, after which the volume opens (its explorer row says display copy, and cursor
          readouts mark its amplitudes with a leading approximately sign), then the full-precision copy. Uploads can be
          paused, resumed and carried on in a later session without the SEG-Y file. Attribute volumes wait for the
          full-precision copy.
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
        <SubHeading>Stepping, going to a line and the player</SubHeading>
        <Para>
          The Line group in Home holds the slice player. Step sets the increment (every Nth inline, crossline or
          sample, remembered per orientation); the arrow keys in the Section and 3D windows, Shift and wheel, and the
          step buttons all move by it. Go to takes an inline or crossline number, or a time in ms on a time slice,
          and jumps straight there. Play runs through the slices at the chosen speed in slices per second; it waits
          for each slice to load before stepping, stops at the end of the survey, and pauses as soon as you move
          the slice yourself. Step size and speed are saved with named sessions.
        </Para>
        <SubHeading>Showing and hiding the slice planes</SubHeading>
        <Para>
          Under the active volume in the explorer, Inline, Crossline and Time slice each carry an eye. The eye is one
          switch for every window: it shows or hides the plane in the 3D window, its dashed intersection line in the
          Section window, and its location line (or, for the time slice, the amplitude slice) in the Map window. The
          3D window's Planes menu flips the same switch. A plane you hide stays hidden while you scrub, and the
          choice is saved with the volume and with named sessions.
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
        <Para>
          Every picking action can be undone with Ctrl+Z and redone with Ctrl+Shift+Z or Ctrl+Y (the Home tab has
          the same buttons). In a horizon edit session one whole paint or erase stroke is one step. Saving the
          session, Track volume and Grow target are undoable too: undoing a Save or a Grow writes the previous picks
          back into the same horizon, and undoing a Track volume removes the horizon it created.
        </Para>
        <Para>
          Import horizons with the upload icon on the Horizons section (or Export, Import). Any file name or extension
          is accepted: the content decides the format. Supported: Charisma 3D interpretation lines (every INLINE and
          XLINE marker form, with or without a horizon-name column), IESX, EarthVision scattered data, CPS-3 points,
          CPS-3 and ZMAP+ grids, il xl x y z, x y z, and any other table through the column mapping step. A file that
          holds several named horizons becomes one horizon per name; tick the ones to import. Lines that cannot be
          read are listed with their line and column, and the rest of the file imports. Imported picks are two-way
          time.
        </Para>
      </GuideSection>

      <GuideSection id="faults">
        <SectionHeading icon={GitBranch}>Fault interpretation</SectionHeading>
        <Para>
          Faults are sets of sticks picked on sections; sticks on neighbouring lines are joined into a surface you
          can show in the Map and 3D windows. Fault polygons drawn in Mapping &amp; Surface Studio are listed under
          Culture and can be shown on the map for comparison.
        </Para>
        <Para>
          The interpretation toolbox (the wrench button at the top right, or Toolbox in the Interpretation tab)
          docks every picking tool beside the viewports. For horizons it has the target, Manual picking, Seed, the
          eraser with its brush size, and seeded tracking (Track 2D, Track 3D, Grow) with the event, the search
          window and the correlation threshold. For faults, choose the active fault first: New fault starts a named
          fault, and choosing an existing fault loads its sticks so new sticks belong to it. The stick tools are
          Extend (a click adds a point at the nearer end of the selected stick), Select stick, Shorten (click a
          point: it and the part of the stick beyond it are removed), Move node (drag a point), Delete node and
          Delete stick; Trim top and Trim bottom shorten the selected stick by one point, and Delete fault removes
          the active fault. Save writes the sticks to the active fault. Alt+click deletes the nearest point in any
          stick tool, and every step can be undone.
        </Para>
        <Para>
          Right-click a horizon or a fault in the explorer and choose Settings to rename it or set its colour, line
          weight and opacity. The settings apply to sections, the 3D window and the map at once and are saved with
          the interpretation, so they come back on the next visit. A new fault keeps the colour of every existing
          one, and each settings change or rename can be undone with Ctrl+Z.
        </Para>
        <Para>
          Import fault sticks with the upload icon on the Faults section. Supported: Charisma fault sticks (split or
          joined INLINE markers, names with spaces), IESX fault sticks, x y z stick number, and any table through the
          column mapping (X, Y, time, stick, fault name; without a stick column a blank line ends each stick). Each
          named fault saves as its own fault with its stick order kept; unreadable lines are listed by line and
          column.
        </Para>
      </GuideSection>

      <GuideSection id="attributes">
        <SectionHeading icon={Waves}>Attribute volumes and co-rendering</SectionHeading>
        <Para>
          Interpretation, Attribute volume (or Compute attribute volume on a volume in the explorer) derives a new
          volume from the open one on the identical lattice; the parent's stored amplitudes are never modified. The
          attribute volume lists under its parent in the explorer, counts against your storage and can be cancelled
          while it runs.
        </Para>
        <Table headers={['Attribute', 'Use']} rows={[
          ['Envelope (reflection strength)', 'Bright spots and strong impedance contrasts, independent of phase.'],
          ['Instantaneous phase', 'Event continuity through weak amplitudes; terminations and pinch-outs.'],
          ['Instantaneous frequency', 'Thinning beds, absorption shadows below gas.'],
          ['Sweetness', 'Envelope over the square root of frequency: clean sands in shale.'],
          ['RMS amplitude', 'Windowed energy (window length in ms).'],
          ['AGC amplitude', 'Balanced amplitudes for picking (window length in ms).'],
          ['Relative acoustic impedance', 'The trace integrated, with its slow trend (Trend window, ms) removed: layers instead of interfaces, so sand bodies read as blocks.'],
          ['Spectral decomposition', 'Amplitude at one frequency (Hz) in a moving window (ms), the whole volume. Thin beds tune at a frequency set by their thickness; compare a low, a middle and a high frequency.'],
          ['Variance (discontinuity)', 'Faults and channel edges light up; vertical window in ms and trace radius. Dip steering (ms) aligns the neighbouring traces first so dipping reflectors stay dark; use it for a volume that will feed Detect faults.'],
          ['Fault likelihood', 'The automatic fault picker\'s own measure, 0 to 1: dip-steered variance sharpened along each lineament. Detect faults can start from it and then runs fastest.'],
          ['Edge (Sobel)', 'How fast amplitude changes sideways on each time slice (amplitude per trace), summed over a short vertical window: channel banks and fault edges as sharp lines.'],
          ['Chaos', '0 where reflectors are orderly and parallel, towards 1 where they are disordered: salt, gas chimneys, slumps and mass transport.'],
          ['Dip magnitude', 'Reflector dip in ms per trace from the local structure. Steep flanks and drag against faults stand out.'],
          ['Dip azimuth (lattice)', 'The down-dip direction in degrees, measured on the survey grid from increasing inline number towards increasing crossline number, so its zero follows the survey orientation. Opens with a cyclic colormap.'],
          ['Most positive and most negative curvature', 'How the reflectors bend (ms per trace squared). Most positive picks out crests, ridges and the upthrown edge of faults; most negative the troughs and the downthrown edge. Anticlines read positive.'],
        ]} />
        <Para>
          To see an attribute over the seismic, open the Co-render group in Home and choose the overlay volume, its
          colormap, the blend and the opacity. Multiply darkens the seismic by the overlay, which suits variance.
          Attribute volumes open with a suitable colormap (cyclic for phase and azimuth, diverging for curvature,
          white to black for variance, fault likelihood, edge and chaos); change it as usual.
          Attributes along a horizon, between two horizons and at one frequency (isofrequency) are made in the
          Export dialog's amplitude section and in the Map window.
        </Para>
        <Callout tone="info" title="Attributes need full precision">
          A volume imported with 16-bit storage, or a large survey still uploading its full-precision copy, cannot
          be used as a parent. Wait for the upload, or re-import without compression.
        </Callout>
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
          A well draws on the seismic in two-way time through its own checkshots (a tie-derived set wins over the
          imported one), or through the volume's velocity model when it has none. Seismolord never guesses a
          velocity: a visible well that cannot be drawn shows a warning on its explorer row with the reason, for
          example no time-depth relationship (add checkshots or a time-depth table in Well Data Manager, or save a
          velocity model for this volume), outside the survey time window, or off the survey. Well projection
          distance in the Wells tab sets how far from a section, in metres, a well and its tops still draw on it;
          empty means 1.5 bins. Tops show as labelled ticks on sections and crosses in 3D.
        </Para>
        <Para>
          Right-click a well in the explorer for Show or Hide, Well data (Well Data Manager on its tops) and Open in,
          which lists the other Geoscience apps for that well.
        </Para>
      </GuideSection>

      <GuideSection id="automation">
        <SectionHeading icon={Sparkles}>Tops to Horizons and automatic faults</SectionHeading>
        <Para>
          Interpretation, Tops to horizons turns the field's well tops into a named, well-tied horizon framework.
          Every visible well with tops takes part, so show the wells first. Each step explains its choices and
          nothing is saved until you accept.
        </Para>
        <Step n={1} title="Wells">Tie and match tops ties every well with a sonic log automatically (the others use their checkshots, or the volume's velocity model with a wider uncertainty), agrees one polarity and phase for the field from the tied wells, and reports the tuning thickness.</Step>
        <Step n={2} title="Review">A board of tops by wells: each cell is the event chosen for that top at that well, how far it sits from the predicted time and its score, with a trace thumbnail. Click a cell to choose another event, or leave a top out. Thin beds below tuning are shown riding on a neighbour.</Step>
        <Step n={3} title="Faults">Tick the existing faults to use as barriers, or Pick faults over an area of interest (inline, crossline and sample ranges, up to 24 million samples at a time; the default is the wells' area). Each proposed fault shows its confidence, sticks and strike; Save the ticked faults keeps them as ordinary faults you can edit.</Step>
        <Step n={4} title="Track">Track the framework grows every accepted top into a horizon that never crosses its neighbours, stops at fault barriers and carries across a fault into blocks no well reaches. The table gives coverage, tuned and jumped cells, the leave-one-well-out error and the misties at the wells. Accept and save writes one horizon per top, named after it.</Step>
        <Step n={5} title="Prognosis">Choose a well, planned or drilled, to see where it meets each horizon in MD and TVDSS with a band from the framework's own error.</Step>
        <SubHeading>Detect faults on its own</SubHeading>
        <Para>
          Interpretation, Detect faults (or Go on its Start here step) runs the same automatic fault picking without
          the wells: the area of interest starts around the line on screen, Whole survey takes the largest area that
          fits, and the proposals are saved the same way.
        </Para>
        <Para>
          Automatic fault picking measures discontinuity (dip-steered semblance) itself, so you do not need to make a
          variance volume first. Start from can instead take a Variance (best with dip steering) or a Fault
          likelihood volume of the open volume; a Fault likelihood volume skips the heaviest step, so on a large survey compute it once for the
          whole survey and pick area after area from it. Starting from the seismic also measures the data quality
          (the reflector coherence, shown after each run): noisy data lowers the detection thresholds, down to half
          the standard, so faults are still found. Sensitivity overrides it: Standard for clean data, High for noisy
          data, and a volume input, which cannot measure the quality, uses Standard unless you choose High. Saved horizons carry a confidence map (tuned cells and
          cells carried across a fault score lower) that the Map window can show. In Wells, Calibrate from wells (velocity
          calibration), each top is paired automatically with the horizon made from it.
        </Para>
        <SubHeading>The copilot</SubHeading>
        <Para>
          The AI tab opens the interpretation copilot in the dock on the right. It can describe the volume, report
          horizon statistics, run tracking and grid and export surfaces; it asks before it acts, and its tools run in
          your browser.
        </Para>
      </GuideSection>

      <GuideSection id="maps">
        <SectionHeading icon={MapIcon}>The Map window, surfaces and export</SectionHeading>
        <Para>
          The Map window draws a horizon as a structure map in two-way time or, with a velocity model, in depth; it
          extracts amplitude attributes along the horizon, contours and labels the map, and overlays wells, faults,
          registry surfaces and culture. Surfaces gridded from horizons are first-class objects in the shared
          registry that Mapping &amp; Surface Studio, Earth Modeling and ReservoirCalc Pro read.
        </Para>
        <Para>
          To make one, right-click a horizon and choose Make surface (or Make surface in the Interpretation tab). Both
          buttons grid the picks here with the fault-aware gridder and save one surface: Grid in Seismolord also shows
          it in the Map window, and Publish to the registry leaves the view as it is and links to Mapping &amp; Surface
          Studio. No file export or re-import is involved. The Export dialog offers the same through Save as surface,
          with every gridding option, and Grid &amp; download writes the surface as a file.
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
          orientation in the section viewer. Shift and wheel over a plane steps its position by the step size; with
          the 3D window focused, the arrow keys step the plane under the cursor, or the Section window's
          orientation when the cursor is elsewhere.
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
          ['Geoscience home', 'The Geoscience link at the left end of the ribbon, as in the other Geoscience studios.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The wells do not land on the survey</SubHeading>
        <Para>The volume's CRS or the project CRS is unset or wrong. Both are declared, never guessed; fix them in the status bar and the volume settings.</Para>
        <SubHeading>A well is on the map but not on the sections</SubHeading>
        <Para>Look for the warning on the well's explorer row. Most often the well has no checkshots and the volume has no velocity model, so it has no time-depth relationship; add checkshots or a time-depth table in Well Data Manager. A deviated well may also pass further from the section than the Well projection distance.</Para>
        <SubHeading>The section says the slice did not load</SubHeading>
        <Para>A data request that gets no answer is stopped after 30 seconds and tried once more; if that also fails the Section window says so and offers Retry, and the 3D window offers Retry on its message bar. Nothing needs a page reload. A repeat usually means the connection dropped.</Para>
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
          ['Attribute volume', 'A volume derived from another on the same lattice, such as envelope or variance.'],
          ['Variance', 'A discontinuity measure: near 0 where neighbouring traces agree, high at faults and edges.'],
          ['Display copy', 'The compact 8-bit copy of a large survey used for viewing while the full-precision copy uploads.'],
          ['Area of interest', 'The inline, crossline and sample box automatic fault picking runs over.'],
          ['Tuning thickness', 'The bed thickness below which top and base reflections merge into one event.'],
          ['Leave-one-well-out', 'Tracking again without each well in turn to measure how well the framework predicts it.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
