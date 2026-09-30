// Stratigraphy Studio in-app help guide (series close-out, 2026-09-06).
// Full-page route on the shared HelpGuideLayout shell. Every control named
// here exists in the workstation today; the vocabulary comes from the
// engine so the guide cannot drift from what the app stores.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.

import React from 'react';
import {
  BookOpen, Zap, ListTree, Tags, Rows, Image, GitCompare, Hourglass, Clock, Map, ScanLine, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { SURFACE_TYPES, SYSTEMS_TRACTS, MOTIFS, displayLabel } from '@/lib/stratigraphy/vocabulary';
import { INTERVAL_KINDS, LITHOLOGIES } from '@/lib/stratigraphy/lithology';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { RANKS } from '@/lib/stratigraphy/column';

const APP_PATH = '/dashboard/apps/geoscience/stratigraphy-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Stratigraphy Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'column', icon: ListTree, title: 'The stratigraphic column' },
  { id: 'tops', icon: Tags, title: 'Typed surfaces on the tops' },
  { id: 'intervals', icon: Rows, title: 'Interval logs: lithology, core, facies' },
  { id: 'core', icon: Image, title: 'Core photographs' },
  { id: 'section', icon: GitCompare, title: 'The section: tracts, stretch, ghost curve' },
  { id: 'wheeler', icon: Hourglass, title: 'The Wheeler chart' },
  { id: 'ages', icon: Clock, title: 'Ages, biozones and the Basin handoff' },
  { id: 'maps', icon: Map, title: 'Stratigraphic maps' },
  { id: 'seismic', icon: ScanLine, title: 'Seismic stratigraphy in Seismolord' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary, both schemes' },
];

// Design system rollout W4B: the guide shares the Studio's theme scope, so
// the user's light or dark choice holds between the app and its guide.
export default function StratigraphyHelpGuide() {
  return (
    <div className="min-h-screen" data-testid="strat-help-theme-scope">
    <HelpGuideShell
      title="Stratigraphy Studio Help Guide"
      subtitle="The stratigraphic framework on the shared Geoscience well registry"
      metaDescription="How to build a stratigraphic column, type sequence-stratigraphic surfaces, log lithology and core, record systems tracts, read the Wheeler chart and age-depth plot, map net sand and flatten seismic sections in Petrolord Stratigraphy Studio."
      backTo={APP_PATH}
      backLabel="Back to Stratigraphy Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Stratigraphy Studio is</SectionHeading>
        <Para>
          Stratigraphy Studio is the specialist stratigrapher's home in the Geoscience module. It holds the
          stratigraphic column, the typed sequence-stratigraphic surfaces on the shared tops, the interval logs
          (lithology, core description, facies, environment, motifs, systems tracts, biozones), the core
          photographs, the Wheeler chart and the age-depth plot. Everything it writes is a shared registry row,
          so a surface typed here draws by type in Well Correlation, Petrophysics Studio and Well Data Manager,
          and a lithology log written here maps as net sand in Mapping &amp; Surface Studio.
        </Para>
        <Para>
          The stored vocabulary is Catuneanu's. Exxon terminology is a display option in the ribbon (Terms):
          it relabels every list, marker and chart on every app at once and changes nothing that is stored.
          Where Exxon has no term the Catuneanu name shows with a badge.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Build the column">In the Column view add a group, then the formations inside it. Pick a stage from the ICS chart to fill both ages, or type them. Save column.</Step>
        <Step n={2} title="Type the surfaces">Pick a well on the left, open Tops. Give each top a surface type (a maximum flooding surface, a subaerial unconformity ...), the unit it is the top of, a confidence and an age. An unconformity also takes the age its hiatus ends at. Save.</Step>
        <Step n={3} title="Log the rock">In Intervals choose a kind (lithology first), add rows or paste a table with top, base and code. Abbreviations such as SST, SH, LS and DOL resolve to the vocabulary. In Core add photographs with their depths.</Step>
        <Step n={4} title="Read the section">Open Section. The section you built in Well Correlation opens here with every top drawn by type and the systems tracts the surfaces imply as fills. Record tracts writes them to the wells. Stretch between two surfaces, or drag a ghost curve across wells.</Step>
        <Step n={5} title="Read time">Wheeler re-plots the section in time; Ages shows one well's age-depth plot with its rates and hiatuses. Send to Basin hands the dated column to Basin &amp; Charge Modeling.</Step>
      </GuideSection>

      <GuideSection id="column">
        <SectionHeading icon={ListTree}>The stratigraphic column</SectionHeading>
        <Para>
          A column is a tree of units with ranks {RANKS.join(', ')}. Each unit carries an order among its siblings
          (youngest first), a top and base age in Ma and a colour. The editor refuses a save when a child sits
          outside its parent's rank order or age range, when the base is younger than the top, or when the parent
          chain loops, and says which unit is wrong.
        </Para>
        <Table headers={['Control', 'What it does']} rows={[
          ['Add unit', 'a new top-level formation to name, rank and place inside a parent'],
          ['Import units', 'reads a Petrel zone hierarchy, a StrataBugs chart or a spreadsheet (name, rank or level, parent by name, top and base age in Ma or ka, colour) in any column and row order; the rows arrive unsaved, names already in the column are left as they are, repeats and overlaps are named'],
          ['From stage', `fills the top and base ages from a stage of the ICS chart (${TIMESCALE_VERSION})`],
          ['Save column', 'validates every unit and writes the additions, changes and removals; a problem refuses the whole save'],
          ['map', 'beside a unit in the explorer once a top names it: opens the top\'s structure map in Mapping'],
          ['SVG, PNG', 'exports the graphic column with a header: timescale, field, prepared by, date and build'],
        ]} />
        <Callout tone="info" title="Removing a unit">
          Its children keep their rows with no parent, and any top that named it loses the reference. Nothing cascades.
        </Callout>
      </GuideSection>

      <GuideSection id="tops">
        <SectionHeading icon={Tags}>Typed surfaces on the tops</SectionHeading>
        <Para>
          A top is still the shared registry row Well Correlation and Petrophysics pick. Stratigraphy Studio adds
          a surface type, the unit it is the top of, a confidence, an age and, for an unconformity, the age the
          hiatus ends at. Every well app draws the type as a distinct line style and puts the abbreviation in the
          tag.
        </Para>
        <Table headers={['Stored code', 'Catuneanu', 'Exxon display']} rows={SURFACE_TYPES.map((s) => [
          s.code, s.name, displayLabel(s.code, 'exxon', { kind: 'surface' }).fallback ? 'no equivalent (Catuneanu name shown)' : displayLabel(s.code, 'exxon', { kind: 'surface' }).label,
        ])} />
        <SubHeading>The tract below</SubHeading>
        <Para>
          The Tops table reads each pair of consecutive sequence surfaces (formation tops, biozone datums and
          unclassified unconformities between them carry no sequence position and are stepped over) and names the
          systems tract they bound:
          a subaerial unconformity or correlative conformity below a maximum regressive surface bounds a lowstand,
          a maximum regressive surface below a maximum flooding surface a transgressive tract, a maximum flooding
          surface below a basal surface of forced regression a highstand, and that surface below the correlative
          conformity a falling stage. A pair that spans two tracts names none; an unpicked internal boundary shows
          a question mark.
        </Para>
      </GuideSection>

      <GuideSection id="intervals">
        <SectionHeading icon={Rows}>Interval logs: lithology, core, facies</SectionHeading>
        <Para>
          An interval is a named thing between two depths on a well. One table holds every kind:
        </Para>
        <Table headers={['Kind', 'Meaning']} rows={INTERVAL_KINDS.map((k) => [k.name, k.description])} />
        <Para>
          The editor shows one kind at a time. Lithology and core rows pick from the vocabulary
          ({LITHOLOGIES.slice(0, 6).map((l) => l.name).join(', ')} and more) with a grain size; core rows add an
          environment; facies rows are free names; systems tracts take a stacking pattern; biozones take a scheme and
          ages. Overlaps within one kind are refused; a lithology and a facies interval may overlap.
        </Para>
        <SubHeading>Doors</SubHeading>
        <Table headers={['Door', 'What arrives']} rows={[
          ['Replace from paste', 'a table with top, base and code columns in measured depth, feet or metres (a unit in the header such as "Top (ft)" is read; semicolon files with comma decimals too); abbreviations resolve, unknown codes are kept as typed. A TVD, TVDSS, elevation, time or age column is refused with the reason'],
          ['LAS 3.0 import (Well Data Manager)', 'a file with a core or lithology block imports its intervals, on by default, with dropped rows named'],
          ['Publish facies (Petrophysics Studio)', 'the crossplot facies polygons become facies intervals on the well'],
          ['Record tracts (Section view)', 'the systems tracts the typed surfaces imply, written on every own well of the section that has any; a well with none keeps what it has and is named'],
          ['Biozone scheme (Intervals view)', 'a CSV with scheme, zone, top and base age and source (Zonation, Top Age, Base Age and Reference are read too; ages in ka when the header says so) dates the biozone intervals whose scheme and zone match; a zone given two different ages is refused, a second file adds its schemes; remembered in this browser only'],
        ]} />
        <Para>
          Every well app draws a registry interval kind as a strip track: the Lithology quicklook template carries a
          lithology strip, and the layout editor's Add strip offers every kind.
        </Para>
      </GuideSection>

      <GuideSection id="core">
        <SectionHeading icon={Image}>Core photographs</SectionHeading>
        <Para>
          The Core view (and Well Data Manager's Core tab, the same panel) takes JPEG, PNG or WebP photographs with a
          top and base depth and a caption. Limits: 5 MB per image and 200 MB per well, refused before anything
          uploads. The strip on the left stacks the photographs in proportion to their depth spans. Photographs live in
          your private wells storage under the well; an org-shared well shows them read-only.
        </Para>
      </GuideSection>

      <GuideSection id="section">
        <SectionHeading icon={GitCompare}>The section: tracts, stretch, ghost curve</SectionHeading>
        <Para>
          The Section view opens a section saved in Well Correlation (the one you pick, else the newest): the same
          wells, order, template and datum, drawn by the same painter. Build and save sections there; interpret them
          here.
        </Para>
        <Table headers={['Control', 'What it does']} rows={[
          ['Section', 'picks one of your named Well Correlation sections; Save view remembers it'],
          ['Depth', 'MD, TVD or TVDSS through each survey and KB, or TWT through the checkshots, in metres or feet; tracts and motifs follow the reference'],
          ['Datum', 'Structural, Flatten on a surface (one datum line, placed at the surface\'s depth in the first well carrying it), or Stretch between two surfaces: the rock between the two picks is stretched onto two common lines, the rest shifts rigidly; a well with one of the surfaces shifts onto that line and says so'],
          ['Tracts', 'fills between typed surfaces coloured by tract; implied until Record tracts writes them, hatched when the tract needs an unpicked boundary'],
          ['Motifs', 'outlines the log motif intervals beside the first track'],
          ['Record tracts', 'writes the implied systems tracts as intervals on every own well of the section'],
          ['Columns', 'auto, fit or a fixed width (120 to 300 px) with a horizontal scroll, as in Well Correlation'],
          ['Horizons', 'Seismolord horizons converted to surfaces, sampled where each wellbore crosses them and drawn dotted (time horizons through the checkshots); a well a horizon cannot reach is named with the reason; Datum can flatten or stretch on a horizon. Read only'],
          ['Strips', 'the PAY flag and zone summaries Petrophysics Studio published, and the units of this column, as narrow strips beside each well; a well without the data says so'],
          ['Ghost', 'draws one well\'s first track (or all of them) translucent on another column at a shift in the display unit (ms on TWT), stretched or squeezed about its middle, to correlate by eye'],
          ['Map net sand', 'opens Mapping on the net sand between a tract\'s two surfaces across the section wells'],
          ['Save view', 'keeps the section, depth reference, datum, ghost, horizons, strips, column width and the Prepared by and Field of the status bar with your stratigraphy project'],
        ]} />
        <Para>The systems tracts and motifs the engine knows:</Para>
        <Table headers={['Code', 'Catuneanu', 'Exxon display']} rows={SYSTEMS_TRACTS.map((t) => [
          t.code, t.name, displayLabel(t.code, 'exxon', { kind: 'tract' }).fallback ? 'no equivalent' : displayLabel(t.code, 'exxon', { kind: 'tract' }).label,
        ])} />
        <Table headers={['Motif', 'Reads as']} rows={MOTIFS.map((m) => [m.name, m.description])} />
      </GuideSection>

      <GuideSection id="wheeler">
        <SectionHeading icon={Hourglass}>The Wheeler chart</SectionHeading>
        <Para>
          The Wheeler view re-plots the section with geologic time down the axis. For each well the rock between
          two dated surfaces becomes a deposition cell spanning their ages, coloured by the tract the surfaces
          imply (the same tract rows the section fills, recorded ones first); an unconformity with a hiatus end becomes
          a hatched hiatus cell. ICS stages sit behind the columns. The columns are the section's wells in order; the
          chart is not interpolated between wells. Spacing places the columns at equal spacing, by the distance
          between wellheads (in their coordinate system), or along the section line drawn in Well Correlation, with
          each gap printing its distance; wells in different coordinate systems fall back to equal spacing and say
          so. Pick another named section from the header. A well with fewer than two dated surfaces is listed as not placed,
          with the reason. SVG and PNG export the chart with a header naming the wells, section, field, terms,
          timescale, preparer, date and build.
        </Para>
        <Callout tone="info" title="What the chart needs">
          Ages on the tops (Tops view) and, for an unconformity, the age its hiatus ends at. Ages are constant-rate
          interpolated between dated surfaces; an inversion (a deeper surface younger than a shallower one) is refused by name.
        </Callout>
      </GuideSection>

      <GuideSection id="ages">
        <SectionHeading icon={Clock}>Ages, biozones and the Basin handoff</SectionHeading>
        <Para>
          The Ages view shows the selected well's age-depth plot: the dated surfaces joined by segments at constant
          accumulation rate, the rate written on each, a hiatus bar at every dated unconformity, and the ICS stage of
          each surface. The table below repeats the rates and hiatuses. On a well with a survey, depths and rates are
          vertical (TVD below KB); on a vertical well or one without a survey they are MD, and the axis says which.
        </Para>
        <Table headers={['Control', 'What it does']} rows={[
          ['Biozone datums', 'turns every biozone range of the well (Intervals view, kind Biozone, with scheme and ages) into two typed biozone tops carrying the ages and the scheme'],
          ['Send to Basin', 'creates a Basin & Charge Modeling model: one layer per top with its vertical (TVD) thickness through the survey, ages from the bounding surfaces, the dominant lithology from the log, every hiatus as an erosion event whose amount you must type; undated layers keep placeholders and say so'],
          ['Open Basin', 'opens Basin & Charge Modeling, where the new model is listed with the well remembered as its tie'],
        ]} />
              <Para>
          The Events view holds a well's biostratigraphic events. Add events pastes depth, event and taxon (columns in
          any order; feet or metres from the header; FDO, LDO, LAD, FAD, top and base of acme, first and last common
          occurrence, and the short forms T, B, HO and LO). Each event becomes a biozone datum named with its event and
          taxon (LAD Discoaster quinqueramus), so every app that lists tops lists it. Event dictionary loads the
          calibrated ages you use (taxon, event, age in Ma or ka, reference) into your stratigraphy project; Date from
          dictionary gives every undated event its age, reading an FDO as the taxon's LAD and an LDO as its FAD when
          the dictionary has no well-site row, and says which it did. The range chart draws each taxon's observed range
          in the well, depth down, with open ends marked.
        </Para>
        <Para>
          Age model from the events fits a straight line through the dated events by least squares, age on vertical
          depth (TVD through the survey), and starts a new line below every dated unconformity. Each segment shows its
          rate, R-squared and residual standard deviation; each event its residual, and an event more than two residual
          standard deviations off the line is flagged as a caving or reworking candidate (it stays in the fit). Date
          undated tops lists the age the line gives each undated top, marks any beyond the events of its segment as
          extrapolated, and writes nothing until Apply. The least-squares core reproduces the NIST certified regression
          results for its reference data set.
        </Para>
        <Para>
          Biozone ranges paste with their scheme and ages: in Intervals choose Biozone and Replace from paste; a
          StrataBugs export maps Zone, Zonation, Top and Base Depth, and Top and Base Age (Ma, or ka converted to Ma).
          An age column is never read as a depth, and a range whose base age is not older than its top is refused by
          row. The Section view outlines the ranges beside the first track with their scheme and ages (Biozones).
        </Para>
        <Para>
          Depths (ribbon) shows the Tops, Intervals, Core and Ages tables, the age-depth plot, the rates and the summary
          PDF in metres or feet. The registry keeps metres; a value you type in feet converts at the door, and a cell you
          leave as shown keeps its stored metres exactly. The choice is saved with your stratigraphy project.
        </Para>
        <Para>
          Summary PDF (Ages view) writes the well's stratigraphy for a reviewer: the header (well, field, section,
          prepared by and on, build, timescale, terms, depth basis), the typed tops with MD, TVD, type, unit, age, ICS
          stage, the chart each age was entered on and the tract below, the age-depth plot with depth down and its
          rates and hiatuses, the well's Wheeler cells, the column, and a reviewed-by line.
        </Para>
        <Callout tone="info" title="Timescale: chart versions">
          Lookups, stage fills and exports use the ICS chart {TIMESCALE_VERSION}. Every age you type or fill is stamped
          with the chart it was entered under (in your stratigraphy project). Ages entered before are read as ICS
          2023/09: one that sits on a boundary the new chart moved (the Jurassic/Cretaceous boundary moved from 145.0 to
          143.1 Ma) is flagged in Tops, Column and the Timescale view with the change, and Accept updates every such age
          of the project at once. An age off the boundaries keeps its number; the Timescale view names its new stage
          when it changed. Ages on shared wells stay for their owner.
        </Callout>
      </GuideSection>

      <GuideSection id="maps">
        <SectionHeading icon={Map}>Stratigraphic maps</SectionHeading>
        <Para>
          In Mapping &amp; Surface Studio the source picker offers Stratigraphy: between two tops. Choose net sand,
          gross thickness or net to gross, the upper and lower tops and the lithologies counted as net; each well
          with both tops and a lithology log becomes a control point, and the surface grids, krigs, clips and
          publishes like any other. The environment that dominates the interval is listed per well. Facies and
          Paleogeography polygons take the vocabulary colour of the name you give them.
        </Para>
        <Callout tone="warn" title="Thickness basis">
          Thicknesses are vertical: each well's tops and lithology log go through its survey to TVD, so a deviated
          well maps its vertical thickness (the isochore). A well with no survey is taken as vertical, and its
          measured-depth thicknesses are used and named in the status and the surface's provenance. The correction
          for bed dip (true vertical thickness, TVT) is not applied.
        </Callout>
      </GuideSection>

      <GuideSection id="seismic">
        <SectionHeading icon={ScanLine}>Seismic stratigraphy in Seismolord</SectionHeading>
        <Table headers={['Where', 'What']} rows={[
          ['Home tab, Flatten', 'hangs the section on a visible horizon: every trace shifts so the pick sits on one datum, display only; picks land in true time; saved with the session'],
          ['Export dialog, Stratal slice', 'the amplitude a fraction of the way between two horizons at every trace, exported or published as a registry surface'],
          ['Interpretation tab, Terminations', 'onlap, downlap, toplap and truncation markers placed by click on the section, removed by Alt+click, saved with the session'],
        ]} />
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Shared with it']} rows={[
          ['Well Data Manager', 'the same tops with their types, the Intervals and Core tabs, the LAS 3.0 block import; Edit in Well Data Manager in the explorer'],
          ['Well Correlation', 'the same sections and tops; typed markers, tract bands, stretch and ghost curve are in its painter too'],
          ['Petrophysics Studio', 'typed markers; Publish facies as intervals'],
          ['Mapping & Surface Studio', 'net sand, gross and net-to-gross grids from the lithology log; Map net sand and map launchers'],
          ['Basin & Charge Modeling', 'Send to Basin builds a model from the dated column'],
          ['Seismolord', 'flatten on a horizon, stratal slices, terminations'],
        ]} />
        <Para>
          Well Data Manager's Open in menu opens this app on a well (<Code>?well=</Code>).
        </Para>
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <Table headers={['Symptom', 'Cause and fix']} rows={[
          ['No tract fills on the section', 'the surfaces between the fills are not typed, or a plain formation top sits between two typed surfaces; type it or leave it out of the sequence'],
          ['The Wheeler view lists a well as not placed', 'it has fewer than two dated surfaces, or an inversion; add ages in Tops'],
          ['The hiatus does not draw', 'the unconformity has no hiatus end; type it in Tops (it must be older than the surface age)'],
          ['Save column refused', 'read the message: a child outside its parent\'s rank or ages, or a loop'],
          ['Net sand skips a well', 'it lacks one of the two tops, a location, or a lithology log; the status names the reason'],
          ['Exxon shows a badge', 'Exxon has no term for that surface or tract; the Catuneanu name is shown and nothing changes in storage'],
          ['A shared well is read-only', 'org sharing is read-only by design; the owner edits'],
        ]} />
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary, both schemes</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Sequence boundary', 'the Exxon name for a subaerial unconformity and its correlative conformity'],
          ['Transgressive surface', 'the Exxon name for the maximum regressive surface (or the ravinement surface that replaces it)'],
          ['Maximum flooding surface', 'the end of transgression; the Exxon downlap surface'],
          ['Systems tract', 'the deposits between two sequence-stratigraphic surfaces: lowstand, transgressive, highstand, falling stage, regressive'],
          ['Stacking pattern', 'how parasequences step: progradational, retrogradational, aggradational'],
          ['Wheeler chart', 'a section re-plotted in time: deposition and hiatus per well'],
          ['Hiatus', 'time with no rock preserved, from the unconformity\'s age to the age of the rock below it'],
          ['Stratal slice', 'a horizontal sample of a seismic volume a fraction of the way between two horizons'],
          ['Net sand', 'the thickness of the sand-family lithologies between two surfaces, from the lithology log'],
        ]} />
        <Para>References: Catuneanu (2006) Principles of Sequence Stratigraphy; Catuneanu et al. (2009) Earth-Science Reviews 92; Van Wagoner et al. (1988, 1990); Mitchum et al. (1977); Wheeler (1958); the ICS International Chronostratigraphic Chart ({TIMESCALE_VERSION}, CC BY 4.0).</Para>
      </GuideSection>
    </HelpGuideShell>
    </div>
  );
}
