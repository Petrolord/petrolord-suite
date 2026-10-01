// Earth Modeling in-app help guide (EM5, 2026-09-06). Full-page route
// on the shared HelpGuideLayout shell. Every control named here exists
// in the workstation today.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Layers3, Ruler, Crosshair, GitBranch, Pentagon, Rows, Grid3x3, ClipboardCheck,
  UploadCloud, Link2, AlertTriangle, BookMarked, Dice5,
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
  { id: 'step2', icon: Dice5, title: 'Traps, uncertainty, reports and handoffs' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

// Design system rollout W4B: the guide shares the Studio's theme scope, so
// the user's light or dark choice holds between the app and its guide.
export default function EarthModelingHelpGuide() {
  return (
    <div className="min-h-screen" data-testid="em-help-theme-scope">
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
        <Para>
          Only depth structures stack. A time surface, an attribute map (MD, TVD, porosity) or an isochore is refused
          with the reason; depth-convert a time surface in Mapping &amp; Surface Studio first, and use an isochore
          through a derived horizon. Surfaces on a feet or US-feet frame work: the model computes on a metre frame,
          so the cell size, the adjustment radius and the variogram range are always metres, and the volumes are the
          same as on a metre frame. A rotated top surface gives the unrotated extent at its smaller cell. Wells and
          polygons in another coordinate system than the model are left out (wells) or refused (polygons), and the QC
          view lists every such note under Build notes.
        </Para>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Depth and volume units</SectionHeading>
        <Para>
          The model computes in metres, positive down below the datum. The ribbon's depth unit (feet or metres) and the
          volume set start from your Suite units (Units in the dashboard sidebar); changing them here changes this view
          for the session and never changes stored data. The depth unit drives the map labels, the section axis and
          the tie table. Volume units are a separate choice:
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
          shm: 'Sw from a SCAL Studio saturation-height function: per node, the mean Sw over the hydrocarbon leg from its height above the free-water level.',
          map: 'Per zone, NTG from a Petrophysics net pay map (net pay / thickness) and Sw from its HCPV map (1 - HCPV / (thickness x NTG x porosity)).',
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
          NTG, pore by porosity, hydrocarbon pore volume by one minus Sw.
        </Para>
        <Para>
          Fluid contacts and FVF (per zone, in the dock) cut each zone at the gas-oil and oil-water contacts, typed as
          depths below datum; each value keeps the unit it was typed in, and a negative value is read as an
          elevation. Bo is in rb/stb; Bg is typed in the unit chosen above the zone rows (rm3/sm3, rcf/scf or RB/Mscf,
          starting from your Suite units), and a line under each zone says how the values were read. The table then
          splits the hydrocarbon pore volume into gas cap and oil leg and, with Bo and Bg, gives STOIIP and GIIP (free
          gas, solution gas not included) at surface conditions (MMstb and Bscf in field units). Bg with no Bo and no
          GOC makes a gas zone, gas from the top down to the contact. With no OWC the whole zone counts as
          hydrocarbon and the table says so in amber; when the hydrocarbon leg reaches the edge of the model, the
          accumulation is not closed inside the frame and an amber line says the volume depends on where the frame
          stops (check the spill point in Mapping &amp; Surface Studio). Porosity, Sw and NTG populated by a trend or
          kriging beyond the wells are held between 0 and 1, and the Build notes count the nodes held. When a property is kriged, a line under the
          table gives the P90, P50 and P10 hydrocarbon volume from the kriging variance, every node moving together.
          Recovery and full uncertainty stay in ReservoirCalc Pro.
        </Para>
        <Para>
          The build status says what needs attention: well ties that miss by more than 10 m while adjustment is off,
          any property that fell back to a simpler method (amber in the provenance lines), and clamped nodes, which
          are marked with orange crosses on the zone top and base maps. The depth button in the ribbon shows depths as
          positive TVDSS or as elevation and is shared with Mapping.
        </Para>
      </GuideSection>

      <GuideSection id="publish">
        <SectionHeading icon={UploadCloud}>Publishing and exports</SectionHeading>
        <Para>
          Publish layer writes the layer shown on the map to the registry: zone top and base as structure (elevation,
          metres), thickness as an isochore, properties and variances as attributes, with the model name, zone and
          methods in the provenance, the model's CRS and XY unit. Volumes CSV downloads every zone's table in the
          chosen units; its header carries the field and analyst typed in the dock, the date and build, the depth
          reference, the frame, each zone's contacts and FVFs and any open-edge or held-property note, and the
          provenance. Save model definition keeps the recipe in your account; after a load, Save overwrites that model
          and Save as a new model makes a copy. Grids are recomputed on load, and models saved by earlier releases
          open with today's defaults. Earth models travel in a project package (.pld) with the surfaces and polygons
          they name.
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

      <GuideSection id="step2">
        <SectionHeading icon={Dice5}>Traps, uncertainty, reports and handoffs</SectionHeading>
        <SubHeading>Building a large model</SubHeading>
        <Para>
          Build model runs in the background: the ribbon shows the step and a percentage, the page stays usable, and
          Cancel stops the build and keeps the previous model.
        </Para>
        <SubHeading>Contacts per fault block</SubHeading>
        <Para>
          When the model has fault polygons, open Contacts per fault block under a zone and type a GOC or OWC for a block
          whose fault seals. Blank keeps the zone contact. Block 0 is the area outside every fault polygon.
        </Para>
        <SubHeading>Bound the leg by the closure and spill</SubHeading>
        <Para>
          Tick bound the leg by the closure and spill under a zone. Mapping &amp; Surface Studio&apos;s closure engine runs on
          the zone top: a contact below the spill point fills the trap only to the spill, and nodes above the contact
          outside the trap hold no hydrocarbon. QC says where each trap spills, or that it spills at the model edge.
        </Para>
        <SubHeading>Sw from saturation-height</SubHeading>
        <Para>
          Pick saturation-height for Sw, then a saved SCAL Studio project. The free-water level is the project&apos;s unless you
          type one. With no OWC typed, the free-water level bounds the hydrocarbon leg and the transition zone above it is in
          Sw. Rock: the project&apos;s porosity and permeability, or the modelled porosity through the Leverett scaling.
        </Para>
        <SubHeading>Faults from Seismolord</SubHeading>
        <Para>
          Interpreted faults are listed under Faults from Seismolord once Seismolord publishes them to the other apps. Add
          one after a build: its fault surface is cut with every zone top, so each zone gets its own hanging-wall block and a
          sloping fault moves the block boundary from zone to zone. A fault with no depth (its volume has no velocity model)
          cannot be added.
        </Para>
        <SubHeading>Volume distribution</SubHeading>
        <Para>
          QC and volumes, Volume distribution: type the spread of the contacts (plus or minus metres), of Bo and Bg (plus or
          minus percent), tick kriged properties, then Run. Each trial re-runs the volumes with the Suite&apos;s canonical Monte
          Carlo sampler. P90 is the low case (the 10th percentile of outcomes), P10 the high case. The same seed gives the
          same answer.
        </Para>
        <SubHeading>Report PDF, GRDECL and ReservoirCalc Pro</SubHeading>
        <Para>
          Report PDF is the model report a reviewer signs: field, analyst, date and build, the volumes, the contacts and
          FVFs as used, every flag, provenance, ties and the map. GRDECL downloads the model as an Eclipse corner-point grid
          (one layer per zone) and a SWAT include for Reservoir Simulation Studio; add permeability in the deck. Prospect to
          RCP opens ReservoirCalc Pro with the zone on the map filled in: area, average column, NTG, porosity, the Sw that
          keeps the model&apos;s HCPV, contacts and FVFs.
        </Para>
        <SubHeading>3D properties, fence and isopach</SubHeading>
        <Para>
          In 3D, colour cycles depth, surface and property (porosity, Sw or NTG of the zone below each surface); fence draws
          a section along the Section view&apos;s line. The map&apos;s Isopach layer is the true stratigraphic thickness (vertical
          thickness times the cosine of the dip); volumes still use the vertical thickness.
        </Para>
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
    </div>
  );
}
