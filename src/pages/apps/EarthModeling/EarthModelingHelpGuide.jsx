// Earth Modeling in-app help guide (EM5, 2026-09-06). Full-page route
// on the shared HelpGuideLayout shell. Every control named here exists
// in the workstation today.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Layers3, Ruler, Crosshair, GitBranch, Pentagon, Rows, Grid3x3, ClipboardCheck,
  UploadCloud, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { POPULATION_METHODS } from './services/modelBuild';
import { DERIVED_KINDS } from './services/derivedSurfaces';
import { VOLUME_UNIT_SETS } from './services/units';
import { VE_OPTIONS } from './services/sectionPath';

const APP_PATH = '/dashboard/apps/geoscience/earth-modeling';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Earth Modeling is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'stack', icon: Layers3, title: 'The stack, zones and the frame' },
  { id: 'units', icon: Ruler, title: 'Depth and volume units' },
  { id: 'ties', icon: Crosshair, title: 'Well ties and adjustment' },
  { id: 'derived', icon: GitBranch, title: 'Derived horizons' },
  { id: 'faults', icon: Pentagon, title: 'Fault blocks and the boundary' },
  { id: 'section', icon: Rows, title: 'The section window' },
  { id: 'properties', icon: Grid3x3, title: 'Property population' },
  { id: 'qc', icon: ClipboardCheck, title: 'QC and volumes' },
  { id: 'publish', icon: UploadCloud, title: 'Publishing and exports' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function EarthModelingHelpGuide() {
  return (
    <HelpGuideShell
      title="Earth Modeling Help Guide"
      subtitle="Layer-cake structural frameworks, well adjustment, property population and rock volumes on the shared Geoscience registry"
      metaDescription="How to stack registry surfaces into a framework, adjust them to well tops, derive horizons, cut sections, populate properties by kriging and report volumes in Petrolord Earth Modeling."
      backTo={APP_PATH}
      backLabel="Back to Earth Modeling"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Earth Modeling is</SectionHeading>
        <Para>
          Earth Modeling assembles what the other Geoscience apps leave in the shared registry into one consistent
          layer-cake model: structural surfaces from Mapping &amp; Surface Studio (or Seismolord), tops from Well
          Correlation and Petrophysics Studio, zone averages from Petrophysics Studio, fault and boundary polygons drawn
          in Mapping. It stacks the surfaces on one frame, ties and adjusts them to the wells, splits the model into
          fault blocks, populates porosity, water saturation and net to gross per zone, reports rock, net, pore and
          hydrocarbon pore volume per zone and block, and publishes layers back to the registry for ReservoirCalc Pro.
        </Para>
        <Para>
          Three panels: the explorer on the left (model stack, registry surfaces, fault polygons, wells), the map,
          section and QC views in the centre, and the builder dock on the right (frame, tie tops, derived horizons,
          well adjustment, zones, population, variogram, fault drawing, saved models). Grids are recomputed on every
          Build; only the small definition is saved.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Stack surfaces">In the explorer add two or more registry surfaces, shallow to deep, and order them with the arrows.</Step>
        <Step n={2} title="Tie the tops">In the dock choose the well top that each surface represents, and the registry zone for each interval between surfaces.</Step>
        <Step n={3} title="Build">Build model computes the frame, clamps crossing surfaces, ties the wells, populates the zones and sums the volumes. The status bar names what it did.</Step>
        <Step n={4} title="Look">Map shows any layer of any zone; Section cuts along a line you draw; QC &amp; volumes holds the numbers.</Step>
        <Step n={5} title="Deliver">Publish layer sends the shown layer to the registry; Volumes CSV downloads the tables; Open in ReservoirCalc Pro takes the published surface to volumetrics.</Step>
      </GuideSection>

      <GuideSection id="stack">
        <SectionHeading icon={Layers3}>The stack, zones and the frame</SectionHeading>
        <Para>
          Surfaces are stacked shallow to deep. Every surface is resampled onto the model frame and clamped so that no
          surface rises above the one over it (the stacking rule); the count of clamped nodes per surface sits in QC.
          A zone is the interval between two consecutive surfaces and maps to a registry zone name, which is where the
          per-well averages come from.
        </Para>
        <SubHeading>Model frame</SubHeading>
        <Para>
          The frame is the top surface's, at its cell size or the cell size typed in the dock (the origin and extent
          stay). A boundary polygon drawn in Mapping &amp; Surface Studio clips the model: nodes outside it are empty on
          every surface, so the map, the section and the volumes stop at the lease line.
        </Para>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Depth and volume units</SectionHeading>
        <Para>
          The model computes in metres, positive down below the datum. The ribbon's depth unit (feet or metres) is
          your Geoscience setting, shared with Mapping &amp; Surface Studio, and drives the map labels, the section axis
          and the tie table. Volume units are a separate choice:
        </Para>
        <Table headers={['Choice', 'Rock and net volume', 'Pore and hydrocarbon pore volume']}
          rows={Object.values(VOLUME_UNIT_SETS).map((u) => [u.label, u.rock, u.pore])} />
      </GuideSection>

      <GuideSection id="ties">
        <SectionHeading icon={Crosshair}>Well ties and adjustment</SectionHeading>
        <Para>
          A tie compares the top's true vertical depth below datum (through the well's deviation survey and KB) with
          the surface at that position. The residual is the pick minus the surface: positive means the pick is deeper.
          Residuals over ten metres show amber in QC.
        </Para>
        <SubHeading>Adjust surfaces to the well tops</SubHeading>
        <Para>
          With the adjustment on, each tied surface is warped through its residuals before clamping: exact at the
          tie, half the correction at half the radius, nothing beyond the radius. The radius defaults to three times
          the median spacing between ties and can be typed. QC shows the maximum residual before and after per
          surface and a Before column in the tie table.
        </Para>
      </GuideSection>

      <GuideSection id="derived">
        <SectionHeading icon={GitBranch}>Derived horizons</SectionHeading>
        <Table headers={['Kind', 'Recipe']} rows={DERIVED_KINDS.map((k) => [k.label, k.key === 'parallel'
          ? 'The source surface plus a thickness typed in the display unit (negative places it above), or plus a registry isochore surface.'
          : 'A fraction of the way from the source surface to a base surface (0.5 is midway).'])} />
        <Para>
          A derived horizon joins the stack like a registry surface: order it, tie it, publish layers built on it.
          Removing it from the dock drops it from the stack.
        </Para>
      </GuideSection>

      <GuideSection id="faults">
        <SectionHeading icon={Pentagon}>Fault blocks and the boundary</SectionHeading>
        <Para>
          Fault polygons split the model into blocks; every property is populated per block and the volumes are
          reported per block. Draw one on the map from the dock, or add a fault polygon drawn in Mapping &amp; Surface
          Studio from the explorer's "Fault polygons from Mapping" list. The boundary polygon is chosen in the frame
          section of the dock.
        </Para>
      </GuideSection>

      <GuideSection id="section">
        <SectionHeading icon={Rows}>The section window</SectionHeading>
        <Para>
          The section cuts the framework along the straight line between two wells, or along a line you draw: Draw
          line on map, click the vertices, Finish section line. Wells within two cells of the line are drawn at their
          projection with a GR column (sand below 75 API filled), their top ticks with the tie residual, and the
          offset from the line. VE sets the vertical exaggeration ({VE_OPTIONS.join(', ')}x); the footer prints the
          exaggeration achieved. PNG downloads the section.
        </Para>
      </GuideSection>

      <GuideSection id="properties">
        <SectionHeading icon={Grid3x3}>Property population</SectionHeading>
        <Table headers={['Method', 'What it does']} rows={POPULATION_METHODS.map((m) => [m.label, {
          constant: 'The interval-weighted mean of the zone averages of the wells in the block.',
          trend: 'A least-squares plane through the wells of the block.',
          okrige: 'Ordinary kriging with a variogram fitted from the wells (or typed), trend removed first; also gives a variance map.',
          krige: 'The original simple kriging with a typed variogram and mean; kept for saved models.',
        }[m.key]])} />
        <Callout tone="info" title="The fallback ladder">
          A block with too few wells falls back to a plane, then to the mean, and a block with no wells uses every well's
          mean. Every fallback is recorded in QC with the reason. Ordinary kriging needs four wells in the block.
        </Callout>
        <Para>
          A kriged property carries a variance map (Porosity, Sw or NTG kriging variance in the map layer list): low
          near the wells, high where the property is guessed. It can be published as an attribute.
        </Para>
      </GuideSection>

      <GuideSection id="qc">
        <SectionHeading icon={ClipboardCheck}>QC and volumes</SectionHeading>
        <Para>
          QC &amp; volumes holds the clamp report, the fault-block census, the well adjustment card, the tie table and,
          per zone, the volume table (bulk, net, pore and hydrocarbon pore volume per block and in total, in the chosen
          units) with the population provenance under it. Bulk volume is thickness times cell area; net multiplies by
          NTG, pore by porosity, hydrocarbon pore volume by one minus Sw. Fluids, contacts and recovery stay in
          ReservoirCalc Pro.
        </Para>
      </GuideSection>

      <GuideSection id="publish">
        <SectionHeading icon={UploadCloud}>Publishing and exports</SectionHeading>
        <Para>
          Publish layer writes the layer shown on the map to the registry: zone top and base as structure (elevation,
          metres), thickness as an isochore, properties and variances as attributes, with the model name, zone and
          methods in the provenance. Volumes CSV downloads every zone's table in the chosen units with the frame and
          the provenance in the header. Save model definition keeps the recipe in your account; grids are recomputed
          on load.
        </Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Mapping & Surface Studio', 'Open in Earth Modeling on a surface stacks it here on arrival; the map icon on a registry surface opens it there; fault and boundary polygons drawn there are listed here.'],
          ['ReservoirCalc Pro', 'Open in ReservoirCalc Pro after a publish opens its Surface import on that surface.'],
          ['Well Correlation and Petrophysics Studio', 'Tops and zone averages picked there are the ties and the control points here.'],
          ['Geoscience home', 'The home icon at the left of the ribbon.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The surfaces are in different coordinate systems</SubHeading>
        <Para>Build refuses to stack surfaces tagged with different known CRSs. Convert them to one CRS in Mapping first.</Para>
        <SubHeading>A zone shows zero thickness</SubHeading>
        <Para>The surfaces crossed and the clamp lifted the deeper one; the clamp report counts the nodes. Check the stack order and the adjustment.</Para>
        <SubHeading>Kriging fell back</SubHeading>
        <Para>Fewer than four wells with that zone average in the block. Add wells, merge blocks, or use trend or constant.</Para>
        <SubHeading>The section is empty</SubHeading>
        <Para>The line runs outside the live frame, or the model is not built yet.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Frame', 'The regular grid the model is computed on: origin, cell size, node counts.'],
          ['Clamp', 'The stacking rule that keeps every surface at or below the one above it.'],
          ['Tie', 'A well top compared with the surface it represents; the residual is pick minus surface.'],
          ['Block', 'A region of the frame inside (or outside) the fault polygons; properties and volumes are per block.'],
          ['Variogram', 'How a property decorrelates with distance: model, range, sill, nugget.'],
          ['HCPV', 'Hydrocarbon pore volume: bulk times NTG times porosity times (1 minus Sw).'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
