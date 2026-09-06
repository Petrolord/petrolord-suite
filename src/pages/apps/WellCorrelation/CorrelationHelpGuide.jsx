// Well Correlation in-app help guide (Mapping MS5 follow-up, 2026-09-06).
// Full-page route on the shared HelpGuideLayout shell. Every control
// named here exists in the workstation today.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Columns, Ruler, ArrowDownToLine, Crosshair, Layers, GitBranch,
  ImageDown, Link2, AlertTriangle, BookMarked,
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
  { id: 'export', icon: ImageDown, title: 'PNG export and saving' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function CorrelationHelpGuide() {
  return (
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
        <Step n={2} title="Choose a template">In the dock under View pick a track template. Standard triple combo draws GR, resistivity and density-neutron; Raw quicklook draws every mnemonic; Lithology quicklook adds the GR ramp and cut-off.</Step>
        <Step n={3} title="Pick a top">Under Tops click Pick top, then click on a well column at the depth. Name it in the popover. Repeat on the other wells with the same name.</Step>
        <Step n={4} title="Flatten">Under Datum choose the top as the flattening datum. Every well shifts so that top sits on one line.</Step>
        <Step n={5} title="Fill and export">Set Zones to between shown tops, then PNG in the ribbon to download the section, or Save section to keep the layout and order.</Step>
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
          Wells the link names that are not in your registry are skipped and named in the status.
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
          Track details opens the shared layout editor, where a built-in template forks into an editable copy. The
          layout, unit, reference, spacing, zone mode and shown tops persist with a saved section.
        </Para>
      </GuideSection>

      <GuideSection id="depth">
        <SectionHeading icon={Ruler}>Depth reference, unit and spacing</SectionHeading>
        <Table headers={['Control', 'What it does']} rows={[
          ['unit', 'm or ft for every depth you see and type: the scale, tops, the datum depth and the propagate depth.'],
          ['depth', Object.values(DEPTH_REF_LABEL).join(', ') + ': the plotting reference. TVD and TVDSS go through each well\'s deviation survey and KB, the same frame the checkshot and export doors use.'],
          ['spacing', 'equal columns, or by distance along the section path with the distance printed in each gap.'],
        ]} />
        <Callout tone="info" title="A well that cannot be plotted in TVD">
          A horizontal reach makes TVD stop increasing, so that well falls back to MD and its header says so. Picks in a
          TVD frame on an uphill part of a well are refused with a message.
        </Callout>
      </GuideSection>

      <GuideSection id="datum">
        <SectionHeading icon={ArrowDownToLine}>Flattening on a datum</SectionHeading>
        <Para>
          Datum mode none plots true depth. A top datum shifts each well so the chosen top sits on one horizontal line,
          the way a stratigraphic section reads. A depth datum shifts every well so that depth sits at the top of the
          window. Wells that do not carry the datum top stay unshifted and are named in the status. The shift is exact
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
          Type a top name and a depth, then Propagate. Every well you own on the section that does not carry that top
          receives it at that depth as a seed. Drag each seed to the right place afterwards; propagation is the manual
          starting point, there is no automatic correlation.
        </Para>
      </GuideSection>

      <GuideSection id="export">
        <SectionHeading icon={ImageDown}>PNG export and saving</SectionHeading>
        <Para>PNG downloads the section as drawn, with a title band and the Petrolord watermark. Save section keeps the well order, datum, layout, unit, reference, spacing, zone mode and shown tops in your account (the section state is yours alone; the tops stay registry rows).</Para>
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
        <Para>The template names a curve the well does not carry under any alias. Use Raw quicklook to see every mnemonic, or add a <Code>log:</Code> address for it in Track details.</Para>
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
          ['Datum', 'The top or depth the section is flattened on.'],
          ['Template', 'A named set of tracks with scales, colours and fills, shared with Petrophysics Studio.'],
          ['Propagate', 'Seed a top on every own well that lacks it at one depth.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
