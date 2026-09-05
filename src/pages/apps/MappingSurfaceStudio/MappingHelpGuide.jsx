// Mapping & Surface Studio in-app help guide (written at the MS series
// close, 2026-09-05). Full-page route on the shared HelpGuideLayout
// shell. Every control named here exists in the workstation today; a
// capability that lives only in engine code is not mentioned.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Ruler, Grid3x3, Map as MapIcon, Pentagon, FileUp, FileDown,
  Sigma, Clock, Share2, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { EXPORT_FORMATS } from './services/surfaceExport';
import { ARITH_OPS } from './services/arithmetic';
import { CONTROL_POINT_SKIP_REASONS } from './engine/surface';

const APP_PATH = '/dashboard/apps/geoscience/mapping-surface-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What the Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'wells', icon: Database, title: 'Wells, tops and zones' },
  { id: 'depth', icon: Ruler, title: 'Depth convention and units' },
  { id: 'gridding', icon: Grid3x3, title: 'Gridding a surface' },
  { id: 'mapwindow', icon: MapIcon, title: 'The map window' },
  { id: 'polygons', icon: Pentagon, title: 'Fault blocks, boundaries, guide points' },
  { id: 'import', icon: FileUp, title: 'Importing a grid' },
  { id: 'export', icon: FileDown, title: 'Exporting' },
  { id: 'arithmetic', icon: Sigma, title: 'Surface arithmetic and quick GRV' },
  { id: 'timedepth', icon: Clock, title: 'Time to depth' },
  { id: 'sharing', icon: Share2, title: 'Sharing, rename, re-grid' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function MappingHelpGuide() {
  return (
    <HelpGuideShell
      title="Mapping & Surface Studio Help Guide"
      subtitle="Structure maps, attribute maps, surface arithmetic and grid exchange on the shared Geoscience registry"
      metaDescription="How to grid tops into TVDSS structure maps, draw fault blocks and boundaries, import and export industry grid formats, compute isochores and convert time to depth in Petrolord Mapping & Surface Studio."
      backTo={APP_PATH}
      backLabel="Back to Mapping & Surface Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What the Studio is</SectionHeading>
        <Para>
          Mapping & Surface Studio is the map room of the Geoscience module. It takes the control points the
          other apps leave in the shared registry (well tops picked in Well Correlation or Petrophysics Studio,
          zone averages published by Petrophysics Studio, surfaces exported by Seismolord) and grids them into
          surfaces you can contour, edit, combine, export and hand to ReservoirCalc Pro or Earth Modeling. Nothing
          leaves the registry through the filesystem unless you export it on purpose.
        </Para>
        <Para>
          Three panels: the explorer on the left (grid a new surface, the surfaces list, the wells), the map window
          in the centre, and the dock on the right (display, polygons, guide points, arithmetic, quick GRV,
          time to depth, culture layers). The status bar at the bottom reports every action in words.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Pick a top">In the explorer choose Top: (a top name that exists on your wells), keep the depth reference at TVDSS, set a cell size in metres, then Grid.</Step>
        <Step n={2} title="Read the status">It names the reference and unit, how many wells contributed, any wells it could not place and why, and tops placed past the last survey station.</Step>
        <Step n={3} title="Look at the map">Wheel to zoom, drag to pan, double-click to fit. The readout at the bottom right samples the value under the cursor. Contours are labelled on the major levels.</Step>
        <Step n={4} title="Publish">Publish surface writes the grid to the registry. It appears in ReservoirCalc Pro's surface import and in Earth Modeling's registry list at once.</Step>
        <Step n={5} title="Make an isochore">In Surface arithmetic pick Isochore, a top surface and a base surface, Compute, then Publish.</Step>
      </GuideSection>

      <GuideSection id="wells">
        <SectionHeading icon={Database}>Wells, tops and zones</SectionHeading>
        <Para>
          The Studio reads every well in your registry (your own and the ones shared with your organization),
          with their surface location, KB, deviation survey, tops and zones. Wells are managed in Well Data
          Manager; tops are picked in Well Correlation and Petrophysics Studio; zone averages come from
          Petrophysics Studio. The wells list at the bottom of the explorer opens any well in those apps from
          its right-click menu.
        </Para>
        <SubHeading>Where a top is posted</SubHeading>
        <Para>
          A structure map posts each top at the borehole position at the top's measured depth, computed through
          the well's deviation survey with minimum curvature, the same frame the checkshot and export doors use.
          On a vertical well that is the wellhead; on a deviated well the control point sits down the hole, and
          the map draws a dashed line from the wellhead to it.
        </Para>
        <SubHeading>When a well is left out</SubHeading>
        <Table headers={['Reason in the status', 'Meaning']}
          rows={Object.entries(CONTROL_POINT_SKIP_REASONS).map(([k, v]) => [v, {
            no_top: 'The well carries no top of that name (the normal case for wells outside the interval).',
            no_location: 'The well has no surface X/Y. Set it in Well Data Manager, Header tab.',
            bad_md: 'The top depth is not a number.',
            bad_survey: 'The deviation survey cannot be used (fewer than two stations, or a station out of order).',
            above_survey: 'The top depth is negative, above the wellhead.',
          }[k]])} />
      </GuideSection>

      <GuideSection id="depth">
        <SectionHeading icon={Ruler}>Depth convention and units</SectionHeading>
        <Callout tone="info" title="Every depth surface in the registry is elevation">
          Values are negative below the datum (TVDSS), in metres or feet as the row records. Seismolord writes feet,
          this Studio writes metres, and every reader converts through the row's unit. A structure map therefore
          shows negative numbers; a deeper surface has a more negative value.
        </Callout>
        <Para>
          The depth display unit in the ribbon (depth: ft or depth: m) sets what you see and type: the z-range
          line, the colour bar, contour labels and interval, posted values, guide values, the GRV contact, and the
          unit of exported files. It defaults to feet and is remembered in this browser. Storage never changes.
        </Para>
        <Para>
          The depth reference select offers TVDSS (default, elevation below datum), TVD (below KB, also stored as
          elevation) and MD (the raw measured depth, positive, for legacy comparisons only). An isochore is the top
          elevation minus the base elevation, so it is positive where the base is deeper. Attribute maps (zone
          properties such as phi_avg or ntg) carry raw values with no unit.
        </Para>
      </GuideSection>

      <GuideSection id="gridding">
        <SectionHeading icon={Grid3x3}>Gridding a surface</SectionHeading>
        <Para>
          Gridding is a thin-plate spline through the control points, the same validated engine Seismolord uses
          for horizon export. The grid frame is the bounding box of the control points padded by two cells; the
          surface fills the convex hull of the control points and is null outside it. Choose the cell size in
          metres; 4,000,000 nodes is the ceiling.
        </Para>
        <Para>
          Sources: a top across wells (structure) or a zone property across wells (attribute, with the zone chosen
          in the second select; zones are usually named after their top). At least three control points are
          needed. Guide points you have placed grid with the wells.
        </Para>
        <SubHeading>Publish, then what</SubHeading>
        <Para>
          A published structure surface records its source, depth reference, cell size, the control points with
          their posted values, the skipped wells, any fault blocks, boundary and guide points, and the display
          settings, so a re-grid can reproduce it and a tooltip on its row can describe it.
        </Para>
      </GuideSection>

      <GuideSection id="mapwindow">
        <SectionHeading icon={MapIcon}>The map window</SectionHeading>
        <Table headers={['Action', 'How']} rows={[
          ['Zoom', 'Mouse wheel over the map, the + and - buttons, or the + and - keys'],
          ['Pan', 'Drag the map'],
          ['Fit', 'Double-click the map, the fit button, or the 0 key'],
          ['Read a value', 'Hover: the readout at the bottom right shows X, Y and the value under the cursor in the display unit'],
          ['Contour interval', 'Display, Contour interval: a number in the display unit; blank picks a nice interval for about ten levels'],
          ['Colour map', 'Display, Colour map: the structure ramp (shallow warm) or any shared colour map, with a reverse toggle'],
          ['Posting', 'Display: well names, posted values (the control value at each well), legend, scale bar, north arrow, axes'],
          ['PNG', 'PNG in the ribbon: a titled, captioned, logo-stamped image of the map at twice the screen resolution'],
        ]} />
        <Para>
          Display settings are saved with a surface when you publish it and restored when you select it.
        </Para>
      </GuideSection>

      <GuideSection id="polygons">
        <SectionHeading icon={Pentagon}>Fault blocks, boundaries, guide points</SectionHeading>
        <SubHeading>Fault-block polygons</SubHeading>
        <Para>
          Polygons, Fault block: click vertices on the map (three or more), name it, Save. Tick grid on the polygon
          and the next Grid fits the surface independently inside and outside each polygon, so a fault throw
          shows as a step at the polygon edge. A block with fewer than three control points is left empty and
          the status says so. Fault-block polygons are saved to the shared culture registry, so Earth Modeling
          and Seismolord can read them later.
        </Para>
        <SubHeading>Boundaries</SubHeading>
        <Para>
          Polygons, Boundary: draw a lease, licence or area of interest and mark it clip. Gridding nulls every
          node outside it; Surface arithmetic, Clip A to a boundary does the same to a saved surface.
        </Para>
        <SubHeading>Guide points</SubHeading>
        <Para>
          Guide points, Add a guide point: click the map, type the value in the display unit (an elevation,
          negative below datum), Add. Guide points are hand-placed control values that grid with the wells,
          labelled G1, G2 and so on; they travel in the control points CSV and are restored by a re-grid. Use
          them to hold a surface where you know it from seismic or from an offset well the registry does not
          have yet.
        </Para>
      </GuideSection>

      <GuideSection id="import">
        <SectionHeading icon={FileUp}>Importing a grid</SectionHeading>
        <Para>
          Import in the explorer header reads XYZ points on a regular grid, CPS-3, ZMAP+ and Irap classic grids
          (the format is detected). Say what the values are (depth, two-way time, or an attribute), the depth
          unit of the file, and its sign convention. The sign is detected from the data (mostly negative values
          means elevation) and can be overridden. Depth files are stored as elevation whichever sign the file
          used; time stays positive milliseconds; attributes are raw.
        </Para>
        <Para>
          Declare the file CRS. When the project has a CRS and the file declares a different known one, the grid is
          converted on import; a file on a local grid cannot be placed on a georeferenced project and is refused.
          With no Project CRS, the surface keeps the declared CRS or an unknown placement (the amber no CRS badge).
        </Para>
      </GuideSection>

      <GuideSection id="export">
        <SectionHeading icon={FileDown}>Exporting</SectionHeading>
        <Para>Right-click a surface: Export as offers</Para>
        <Table headers={['Format', 'Notes']} rows={EXPORT_FORMATS.map((f) => [f.label, {
          xyz: 'One row per node, nulls as 1.0E+30',
          cps3: 'The Petrel and CPS-3 grid dialect, column-major north to south',
          zmap: 'ZMAP+ with the CRS tag in the header when the surface has one',
          irap: 'Irap classic ASCII',
        }[f.key]])} />
        <Para>
          Lengths are written in the display unit and the file name carries it (for example dome-ft.zmap.dat);
          depth values are elevation, negative below datum. Control points CSV writes the wells and guide points a
          surface was gridded from, with x, y, the value in the display unit, the measured depth, and whether
          the point was extrapolated past the survey.
        </Para>
      </GuideSection>

      <GuideSection id="arithmetic">
        <SectionHeading icon={Sigma}>Surface arithmetic and quick GRV</SectionHeading>
        <Table headers={['Operation', 'Result']} rows={ARITH_OPS.map((o) => [o.label, {
          thickness: 'An isochore: top elevation minus base elevation, positive where the base is deeper',
          add: 'Sum on A\'s frame; stays a depth surface when A is one',
          subtract: 'Difference on A\'s frame',
          multiply: 'Product, an attribute (for example isochore times NTG gives net thickness)',
          min: 'The shallower elevation at each node',
          max: 'The deeper elevation at each node',
          scalarAdd: 'A shifted by a constant',
          scalarMultiply: 'A scaled by a constant, an attribute',
          clip: 'A with every node outside the boundary marked clip set to null',
        }[o.key]])} />
        <Para>
          B is resampled onto A's frame bilinearly before any two-surface operation, so the result has A's grid.
          Preview, then Publish.
        </Para>
        <SubHeading>Quick GRV</SubHeading>
        <Para>
          Type a contact as an elevation in the display unit and press GRV: the gross rock volume of the displayed
          structure above that contact in acre-feet and cubic metres, with the area above it. It is a read-out on
          the same routine ReservoirCalc Pro's surface handoff is tested against. ReservoirCalc Pro remains the
          place for fluids, contacts by zone and uncertainty.
        </Para>
        <Formula>GRV = sum over live nodes of max(0, z − contact) × dx × dy</Formula>
      </GuideSection>

      <GuideSection id="timedepth">
        <SectionHeading icon={Clock}>Time to depth</SectionHeading>
        <Para>
          Select a time surface (two-way time in milliseconds, for example a Seismolord horizon published in time
          or an imported time grid). The Time to depth section lists the velocity models of your Seismolord
          volumes. A single-function model converts each node with
        </Para>
        <Formula>V(z) = v0 + k·z, so z(t) = (v0 / k)(e^(k·t) − 1) with t the one-way time in seconds</Formula>
        <Para>
          The result is elevation (negative below datum) in feet by default or metres, published as a structure
          surface with the model recorded in its provenance. A layer-cake model is refused here because its layer
          boundaries are horizon picks on the seismic lattice: convert that horizon to depth in Seismolord and
          publish it from there.
        </Para>
      </GuideSection>

      <GuideSection id="sharing">
        <SectionHeading icon={Share2}>Sharing, rename, re-grid</SectionHeading>
        <Para>
          Surfaces are private until you click the lock on your row: shared surfaces are read-only for the members
          of your organization. Right-click a surface for Rename (type, Enter) and Re-grid in place: the form is
          set from the surface's recorded source, the row is marked re-gridding, and Publish becomes Replace
          surface. The replaced surface keeps its id, so Earth Modeling stacks and ReservoirCalc Pro imports keep
          pointing at it; the previous frame is kept in its history.
        </Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['From', 'To the map']} rows={[
          ['Well Correlation', 'The map icon on a top row grids that top across the section wells on arrival'],
          ['Petrophysics Studio', 'The map icon on a top row grids that top across every well carrying it'],
          ['Well Data Manager', 'Map this top on the Tops tab, and Open in, Mapping & Surface Studio on any well'],
          ['Any link', 'The address accepts ?surface=<id>, ?top=<name>&wells=<ids>, and ?wells=<ids> to post only those wells'],
        ]} />
        <Table headers={['From the map', 'Where']} rows={[
          ['Right-click a surface', 'Open in ReservoirCalc Pro (it lists the surface in its Surface import), Open in Earth Modeling (stacks it on arrival), Show in Seismolord'],
          ['Right-click a well', 'Open in Petrophysics Studio, Well Correlation, Rock Physics Studio, Pore Pressure Studio, Earth Modeling, Seismolord, ReservoirCalc Pro'],
          ['Geoscience in the ribbon', 'Back to the module dashboard'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The map is blank where I expect a surface</SubHeading>
        <Para>
          The surface fills the convex hull of the control points only. Add a guide point outside, or place a
          boundary and accept the null area. With a fault block ticked, a block with fewer than three points is
          empty; the status says so.
        </Para>
        <SubHeading>My imported grid looks upside down</SubHeading>
        <Para>
          The sign convention in the import dialog was wrong for that file. Re-import with the other choice; the
          preview line shows the value range so you can tell.
        </Para>
        <SubHeading>Feet or metres</SubHeading>
        <Para>
          Storage is in the row's unit; the display unit only changes what you see and export. If a surface reads
          three times too deep, the file it came from was imported with the wrong unit.
        </Para>
        <SubHeading>Where are the fault polygons stored</SubHeading>
        <Para>
          In the shared culture registry, as fault_polygon and boundary layers, in the CRS of the map they were
          drawn on. They appear in the Polygons section of this Studio.
        </Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['TVDSS', 'True vertical depth below the datum; stored as elevation, negative down'],
          ['Elevation', 'The registry sign convention: negative below datum'],
          ['Control point', 'A well top at its borehole position, a zone value at the wellhead, or a guide point'],
          ['Isochore', 'Vertical thickness between two surfaces'],
          ['Fault block', 'A polygon inside which the surface is gridded on its own'],
          ['Boundary', 'A polygon outside which nodes are null'],
          ['Contour interval', 'The value step between contour lines, in the display unit'],
          ['GRV', 'Gross rock volume above a contact'],
          ['CRS', 'The coordinate reference system of the grid frame; unverified placement shows an amber badge'],
        ]} />
        <Para><Code>Mapping & Surface Studio</Code> keeps every number in the registry; this guide describes what the app does today.</Para>
      </GuideSection>
    </HelpGuideShell>
  );
}
