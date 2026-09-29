// Well Correlation in-app help guide (Mapping MS5 follow-up, 2026-09-06).
// Full-page route on the shared HelpGuideLayout shell. Every control
// named here exists in the workstation today.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Columns, Ruler, ArrowDownToLine, Crosshair, Layers, GitBranch,
  ImageDown, Link2, AlertTriangle, BookMarked, FolderOpen, FileUp, Waves, BarChart3, Route, Sparkles,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { DEPTH_REF_LABEL } from './engine/sectionFrame';
import { CORR_PARAMS } from './components/CorrelationWorkstation';

const APP_PATH = '/dashboard/apps/geoscience/well-correlation';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Well Correlation is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (5 min)' },
  { id: 'wells', icon: Database, title: 'Wells on the section' },
  { id: 'tracks', icon: Columns, title: 'Tracks and templates' },
  { id: 'depth', icon: Ruler, title: 'Depth reference, unit and spacing' },
  { id: 'datum', icon: ArrowDownToLine, title: 'Flattening on a datum' },
  { id: 'tops', icon: Crosshair, title: 'Tops: pick, drag, rename, delete' },
  { id: 'zones', icon: Layers, title: 'Zone fills' },
  { id: 'propagate', icon: GitBranch, title: 'Propagating a top' },
  { id: 'assist', icon: Sparkles, title: 'Suggested picks' },
  { id: 'topsfiles', icon: FileUp, title: 'Tops files in and out' },
  { id: 'seismic', icon: Waves, title: 'Time and seismic horizons' },
  { id: 'strips', icon: BarChart3, title: 'Pay, zones and units' },
  { id: 'line', icon: Route, title: 'Section line and corridor' },
  { id: 'sections', icon: FolderOpen, title: 'Named sections and undo' },
  { id: 'export', icon: ImageDown, title: 'PNG and PDF export, saving' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function CorrelationHelpGuide() {
  // Design system rollout W4A: the guide shares the app's theme scope, so
  // the user's light or dark choice holds between the app and its guide.
  return (
    <div className="min-h-screen" data-testid="corr-help-theme-scope">
    <HelpGuideShell
      title="Well Correlation Help Guide"
      subtitle="Multi-well log sections, tops and zones on the shared Geoscience well registry"
      metaDescription="How to build a well section, pick and drag tops, flatten on a datum, fill zones, propagate tops and export the section in Petrolord Well Correlation."
      backTo={APP_PATH}
      backLabel="Back to Well Correlation"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Well Correlation is</SectionHeading>
        <Para>
          Well Correlation is the well section window of the Geoscience module. It draws the wells of your registry
          side by side as multi-track log columns, lets you pick, drag and propagate tops across them, flattens the
          section on a datum, fills zones between tops and exports the picture. The tops you pick here are the
          same registry rows Petrophysics Studio, Well Data Manager, Mapping &amp; Surface Studio and Seismolord read,
          so a pick made here reaches a structure map or a well tie with no re-import.
        </Para>
        <Para>
          Three panels: the explorer on the left (wells to add, the ordered section list, a small map of the section
          path), the section in the centre, and the dock on the right (datum, view, tops, zones, propagate). The status
          bar reports every action in words.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (5 min)</SectionHeading>
        <Step n={1} title="Add wells">In the explorer click the plus beside two or more wells. They join the section in that order; reorder them with the arrows in the ordered list.</Step>
        <Step n={2} title="Choose a template">In the dock under View pick a track template. Standard triple combo draws GR, resistivity and density-neutron; Raw quicklook draws GR, resistivity, density-neutron and sonic as logged; Lithology quicklook adds the GR ramp and cut-off.</Step>
        <Step n={3} title="Pick a top">Under Tops click Pick top, then click on a well column at the depth. Name it in the popover. Repeat on the other wells with the same name.</Step>
        <Step n={4} title="Flatten">Under Datum choose Flatten on top and the top. Every well shifts so that top sits on one line, drawn where the first well carrying it has it.</Step>
        <Step n={5} title="Fill and export">Set Zones to between shown tops, type the field and analyst under Report header, then PNG in the ribbon to download the section with its header, and Save section to keep it. The status bar says unsaved changes until you save.</Step>
      </GuideSection>

      <GuideSection id="wells">
        <SectionHeading icon={Database}>Wells on the section</SectionHeading>
        <Para>
          The explorer lists every well you can see: your own and the ones shared with your organization. Adding a
          well appends it to the section; the ordered list shows the order, the count and, for your own wells, an
          Edit well data link into Well Data Manager on the tops tab. The small map draws the surface locations and
          the section path between them in order.
        </Para>
        <Para>
          Wells arrive from other apps too. Well Data Manager's Open in Well Correlation, and the same launcher in
          Petrophysics Studio, open this app with those wells already on the section (a <Code>?wells=</Code> link).
          Wells the link names that are not in your registry are skipped and named in the status. A saved section that names a well since deleted or no longer shared opens without it, and the status says how many were left out.
        </Para>
      </GuideSection>

      <GuideSection id="tracks">
        <SectionHeading icon={Columns}>Tracks and templates</SectionHeading>
        <Para>
          Each well column is drawn from the active track template, the same templates Petrophysics Studio uses.
          Curves are resolved against every curve of the well through the shared alias table, so GR, resistivity on a
          log scale, density-neutron with the standard gas and shale crossover, and any raw mnemonic (a track address
          such as <Code>log:ILD</Code>) all draw. Header rows print the scale of every track.
        </Para>
        <Para>
          Fills that depend on a parameter read fixed values on the section: GR clean {CORR_PARAMS.grClean} and clay{' '}
          {CORR_PARAMS.grClay} API, porosity cut-off {CORR_PARAMS.cutPhi}, Vsh cut-off {CORR_PARAMS.cutVsh}, Sw cut-off{' '}
          {CORR_PARAMS.cutSw}. Interpret the well in Petrophysics Studio when you need the per-well values; the section
          is for correlation.
        </Para>
        <Para>
          Track layout opens the shared layout editor, where a built-in template forks into an editable copy. The
          layout, unit, reference, spacing, zone mode, shown tops, ghost curve and report header persist with a saved section.
        </Para>
      </GuideSection>

      <GuideSection id="depth">
        <SectionHeading icon={Ruler}>Depth reference, unit and spacing</SectionHeading>
        <Table headers={['Control', 'What it does']} rows={[
          ['unit', 'm or ft for every depth you see and type: the scale, tops, the datum depth and the propagate depth.'],
          ['depth', Object.values(DEPTH_REF_LABEL).join(', ') + ': the plotting reference. TVD and TVDSS go through each well\'s deviation survey and KB, the same frame the checkshot and export doors use.'],
          ['spacing', 'equal columns, or by distance along the section path with the distance printed in each gap. Distances are in metres from each well\'s coordinates in its own CRS unit (m, ft or US survey ft); wells in different coordinate systems, or with no location, keep equal columns and the status says why. With a section line drawn, along the section line spaces the wells by their distance along it.'],
          ['columns', 'auto fits the wells to the window until a column would be narrower than 90 px, then gives every column 140 px and a horizontal scrollbar under the section (or shift + wheel); fit always fits; a px width fixes it. The depth axis stays put and only the wells in view are drawn.'],
        ]} />
        <Callout tone="info" title="A well that cannot be plotted in TVD">
          A horizontal reach makes TVD stop increasing, so that well falls back to MD and its header says so. Picks in a
          TVD frame on an uphill part of a well are refused with a message.
        </Callout>
        <Para>
          A well column also says when its vertical depth rests on an assumption: <Code>no survey: vertical</Code> when
          the well has no deviation survey (TVD equals MD), <Code>no KB: TVDSS = TVD</Code> when no KB was entered (set
          it in Well Data Manager, otherwise the well sits too deep by its KB height), and{' '}
          <Code>stored bottom-up: read top-down</Code> for curves an early import stored in reverse order. TVDSS is below
          mean sea level: the registry has no seismic reference datum yet.
        </Para>
      </GuideSection>

      <GuideSection id="datum">
        <SectionHeading icon={ArrowDownToLine}>Flattening on a datum</SectionHeading>
        <Table headers={['Datum', 'What it draws']} rows={[
          ['Structural (true depth)', 'Every well at its own depth in the chosen reference.'],
          ['Flatten on top', 'Each well shifts so the chosen top sits on one horizontal line at the datum depth, the way a stratigraphic section reads. The datum starts where the first well carrying the top has it; type another depth to move the line. The axis reads flattened.'],
          ['Stretch between two tops', 'Each well is hung on two tops at once, so both lie on straight lines and the interval between them is stretched to one thickness. The axis reads stretched.'],
        ]} />
        <Para>
          Wells that do not carry the datum top stay at true depth and their column header says so. The shift is exact
          closed-form arithmetic on the reference frame.
        </Para>
      </GuideSection>

      <GuideSection id="tops">
        <SectionHeading icon={Crosshair}>Tops: pick, drag, rename, delete</SectionHeading>
        <SubHeading>Pick</SubHeading>
        <Para>Pick top arms the cursor; click a well column at the depth and name the top in the popover. Esc leaves pick mode. A pick lands in the registry as a <Code>geo_wells_tops</Code> row of that well.</Para>
        <SubHeading>Drag</SubHeading>
        <Para>Drag a top by its name tag at the right edge of the column. The depth updates on release and the registry row moves with it. Shared wells stay read-only.</Para>
        <SubHeading>Rename and delete</SubHeading>
        <Para>In the tops list the pencil renames a top on every well you own that carries it and the bin deletes it from those wells (click twice to confirm). Shared wells keep their copy and the status says so.</Para>
        <SubHeading>Reload and Map this top</SubHeading>
        <Para>Reload fetches tops edited in Petrophysics Studio or Well Data Manager. The map icon beside a top opens Mapping &amp; Surface Studio with that top gridded in TVDSS across the section wells that carry it.</Para>
        <Para>Each top has a show toggle and the all checkbox shows every top; the shown set is what zone fills use.</Para>
        <SubHeading>One top spelled two ways</SubHeading>
        <Para>Tops from different tools often differ only in case or spacing (TOP AGBADA and Top Agbada). They are separate tops, each with its own correlation line, and the list marks each with the other spelling. Rename one to the other to merge them; a well that already carries both keeps both and the status names it.</Para>
        <SubHeading>Correlation lines</SubHeading>
        <Para>A top is a dashed line across its well column; the correlation line joins it to the next well carrying the top through the gap between the columns. Across a well that does not carry the top the line is dashed.</Para>
      </GuideSection>

      <GuideSection id="zones">
        <SectionHeading icon={Layers}>Zone fills</SectionHeading>
        <Table headers={['Zones', 'Fill']} rows={[
          ['no fill', 'Tops only.'],
          ['between shown tops', 'A band between every pair of consecutive shown tops, coloured by the upper top.'],
          ['one pair', 'One band between the two tops you choose.'],
        ]} />
      </GuideSection>

      <GuideSection id="propagate">
        <SectionHeading icon={GitBranch}>Propagating a top</SectionHeading>
        <Para>
          Type a top name and a depth, then Add. Every well you own on the section that does not carry that top
          receives it as a seed. With at the displayed depth (the default) the depth is read on the section axis, flattened,
          stretched, TVDSS or TWT as drawn, and each well gets its own MD through its survey and the flattening, so the
          seeds sit on one line across the section. One MD in every well uses the same MD everywhere. Leave the depth
          blank to seed from an existing pick of the top. Wells that already have it, wells whose TD is shallower than the
          depth, depths reached twice along a well and shared wells are named in the status. Drag each seed to the right
          place afterwards; propagation is the manual starting point, there is no automatic correlation.
        </Para>
      </GuideSection>

      <GuideSection id="assist">
        <SectionHeading icon={Sparkles}>Suggested picks</SectionHeading>
        <Para>
          Suggest picks proposes, for the chosen top, a pick on each of your wells that lacks it: the GR pattern 20 m either
          side of the nearest well's pick is slid along the well, starting between the tops both wells share, and the best
          match is offered with its correlation (r) when r is at least 0.6. On a well that already carries the top it may
          propose a small move to the strongest GR change within 5 m. Each suggestion says why; Accept writes it (and Undo
          reverts it), Reject drops it. Nothing is written without an accept: correlation stays your decision.
        </Para>
      </GuideSection>

      <GuideSection id="topsfiles">
        <SectionHeading icon={FileUp}>Tops files in and out</SectionHeading>
        <Para>
          Import in the Tops panel reads a Petrel, Kingdom or Petra tops file (comma, tab or semicolon, any column order),
          or pasted rows. It shows the columns it read, the depth reference (MD, TVD, TVDSS or Z elevation) and unit from
          the header, which you can change, how many tops are new, moved or unchanged, and every line it will not apply
          with the reason. TVD, TVDSS and Z are converted to MD through each well's survey and KB; a well with no survey
          or no KB is named. Time columns are refused. Undo reverts an applied file.
        </Para>
        <Para>CSV exports the shown tops of the section wells with MD, TVD and TVDSS in the display unit, TWT from checkshots, surface type, interpreter and confidence.</Para>
        <SubHeading>Who picked it</SubHeading>
        <Para>New picks by and the confidence choice are stored on every top you pick, propagate, import or accept (blank uses the analyst of the Report header). info beside a top lists each well's pick with its interpreter, confidence and date; a low-confidence pick shows ? on its tag. A top repeated in one well says so in the header and correlates on the shallower pick.</Para>
      </GuideSection>

      <GuideSection id="seismic">
        <SectionHeading icon={Waves}>Time and seismic horizons</SectionHeading>
        <Para>
          Depth TWT draws the section in two-way time (ms) from each well's checkshots (Well Data Manager). A well without
          checkshots is not drawn in time and its header says no checkshots.
        </Para>
        <Para>
          Seismic horizons lists the time and depth structure surfaces in the surface registry (the horizons Seismolord
          converts to surfaces). A checked horizon is sampled where each wellbore crosses it and drawn as a dotted marker
          named H: that you can flatten or stretch on. Wells outside the grid, in another coordinate system, or without
          checkshots for a time horizon are named under it. Horizons are read only.
        </Para>
      </GuideSection>

      <GuideSection id="strips">
        <SectionHeading icon={BarChart3}>Pay, zones and units</SectionHeading>
        <Para>
          Petrophysics and stratigraphy adds narrow strips at the left of each well: the PAY flag Petrophysics Studio
          published, its zones with their published net, PHIE and Sw (or not published), and the units of the Stratigraphy
          Studio column for tops linked to a unit. A well without the data says so in its header. Zones below has Thickness
          map, which opens Mapping &amp; Surface Studio gridding the gross thickness between two tops (MD thickness,
          longer than the vertical isochore on a deviated well) from the section wells that carry both.
        </Para>
      </GuideSection>

      <GuideSection id="line">
        <SectionHeading icon={Route}>Section line and corridor</SectionHeading>
        <Para>
          Draw section line under the map: click points, give the corridor (half-width in metres), Use line. The wells whose
          wellhead or bottom hole lies in the corridor become the section, in order along the line, spaced along it.
          Wells in another coordinate system or with no location are named. The line is saved with the section.
        </Para>
      </GuideSection>

      <GuideSection id="sections">
        <SectionHeading icon={FolderOpen}>Named sections and undo</SectionHeading>
        <Para>
          The ribbon picker holds all your sections: open one, start a new one, save a copy under a new name, rename or
          delete (click twice). Sections are yours alone. With unsaved changes, switching asks Save first, Discard changes
          or Cancel.
        </Para>
        <Para>
          Undo (Ctrl+Z outside a text box) reverts the last tops edit made here: a drag, pick, propagate, rename, delete,
          tops file or accepted suggestion. A top someone changed since in another app is kept and the status says so.
        </Para>
      </GuideSection>

      <GuideSection id="export">
        <SectionHeading icon={ImageDown}>PNG and PDF export, saving</SectionHeading>
        <Para>PNG downloads the section as drawn with a header a reviewer can sign: field and analyst (Report header in the dock), the wells, the datum and flattening, depth reference and unit, vertical scale (1:N at 96 dpi), spacing, template, date and build, and the Petrolord watermark.</Para>
        <Para>PDF plots the depth window on screen to scale (Report header, PDF scale: 1:200 to 1:5,000, or 1 in = 20 to 200 ft), every well at the current column width, with the same header, a legend of the tops and fills and a scale bar. Print at 100 % and a ruler reads the scale. A window too long for one page is refused with the reason; a section in time has no scale and is refused too.</Para>
        <Para>Save section keeps the well order, datum, layout, unit, reference, spacing, zone mode, shown tops, ghost curve and report header in your account (the section state is yours alone; the tops stay registry rows). The status bar says unsaved changes until you save. A section saved by a newer Petrolord build is not opened and is not overwritten: reload the page to get the latest build.</Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Well Data Manager', 'Edit well data from a well row; Open in Well Correlation from its well menu.'],
          ['Petrophysics Studio', 'Open in Well Correlation from its ribbon; its tops and zones are the same rows.'],
          ['Mapping & Surface Studio', 'Map this top beside each top grids it across the section wells.'],
          ['Seismolord', 'A top picked here is offered as a marker in the well tie.'],
          ['Geoscience home', 'The home icon at the left of the ribbon.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>A curve does not draw</SubHeading>
        <Para>The template names a curve the well does not carry under any alias. Use Raw quicklook to see every mnemonic, or add a <Code>log:</Code> address for it in Track layout.</Para>
        <SubHeading>Columns are narrow</SubHeading>
        <Para>Spacing by distance narrows columns to fit the path. Switch to equal spacing for four-track templates on many wells.</Para>
        <SubHeading>Tops picked in another app are missing</SubHeading>
        <Para>Click Reload under Tops.</Para>
        <SubHeading>Rename changed more wells than expected</SubHeading>
        <Para>Rename and delete act by name across the section's own wells. Drag a single well's top to move only that one.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['MD', 'Measured depth along the hole.'],
          ['TVD', 'True vertical depth below the KB, through the deviation survey.'],
          ['TVDSS', 'True vertical depth below the datum (sea level): TVD minus KB.'],
          ['Datum', 'The top the section is flattened on, or the two tops it is stretched between.'],
          ['Template', 'A named set of tracks with scales, colours and fills, shared with Petrophysics Studio.'],
          ['Propagate', 'Seed a top on every own well that lacks it at one depth.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
    </div>
  );
}
