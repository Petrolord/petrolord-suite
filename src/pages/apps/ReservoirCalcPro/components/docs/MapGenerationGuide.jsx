import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const MapGenerationGuide = () => (
  <Article
    title="Property Maps"
    lead="The Maps tab turns your top surface and your reservoir inputs into gridded property maps you can paint, contour and view in 3D. This article states exactly which maps the engine builds, which of them the interface can actually ask for, and how each value is derived cell by cell."
  >
    <Note tone="warn" title="Correction to earlier documentation">
      An earlier version of this article claimed the app generates &ldquo;up to 13 distinct property
      maps&rdquo;. That was wrong. The engine implements eight map types. The Maps panel exposes four
      checkboxes, silently generates a fifth map on every run, and gives you no way to request the
      remaining three.
    </Note>

    <H2>What the engine implements and what you can reach</H2>
    <P>
      <Code>MapGenerationEngine.generateMaps()</Code> handles eight type keys. The Maps panel keeps an
      internal selection object with all eight keys in it, but renders checkboxes for only four of them.
      Five keys start out enabled in that object, so <Code>net_pay</Code> is generated on every run even
      though nothing in the interface mentions it. The last three start out disabled and there is no
      control that can switch them on.
    </P>
    <Table
      headers={['Type key', 'Map name', 'Field unit', 'Metric unit', 'Reachable from the Maps tab']}
      rows={[
        ['structure', 'Structure (Depth)', 'ft', 'm', 'Yes, checkbox, on by default'],
        ['thickness', 'Gross Thickness', 'ft', 'm', 'Yes, checkbox, on by default'],
        ['hcpv', 'HCPV Column', 'ft', 'm', 'Yes, checkbox, on by default'],
        ['stooip', 'STOOIP Intensity', 'bbl/acre', 'm³/km²', 'Yes, checkbox, on by default'],
        ['net_pay', 'Net Pay Thickness', 'ft', 'm', 'No checkbox. Always generated.'],
        ['giip', 'GIIP Intensity', 'scf/acre', 'm³/km²', 'No. Unreachable in the current build.'],
        ['porosity', 'Porosity', 'dec', 'dec', 'No. Unreachable in the current build.'],
        ['sw', 'Water Saturation', 'dec', 'dec', 'No. Unreachable in the current build.'],
      ]}
    />
    <P>
      So a normal run produces five maps: Structure, Gross Thickness, Net Pay Thickness, HCPV Column and
      STOOIP Intensity. Untick a checkbox and you get four, three or two. The gas equivalent of the STOOIP
      map cannot be produced from the interface at present, which matters if you are working a gas
      accumulation.
    </P>
    <Note tone="info" title="What the two hidden property maps would show">
      Porosity and water saturation are entered as single scalar values in the Geo and Fluid tabs, and the
      engine writes those same scalars into every cell. Even if the checkboxes existed, those two maps
      would paint one flat colour across the whole grid. They would become interesting only once RCP
      supports gridded property inputs.
    </Note>

    <H2>How the grid is built</H2>
    <P>
      The engine interpolates the selected top surface, takes the bounding box of its control points, and
      lays a regular grid over that box. The column count is fixed at 100. The row count is 100 divided by
      the width over height aspect ratio of the box, rounded, so cells stay roughly square.
    </P>
    <UL>
      <li>
        <strong>Interpolation method.</strong> Taken from Settings, so ordinary kriging or inverse distance,
        the same choice that drives the volumetrics engine.
      </li>
      <li>
        <strong>Resolution.</strong> Fixed at 100 columns. The Coarse, Standard and Fine grid resolution in
        Settings applies to the contact volumetrics engine and to the visualisation grid. It does not change
        property map resolution.
      </li>
      <li>
        <strong>Base of reservoir.</strong> If you selected a base surface in the Reservoir inputs it is
        interpolated too. Otherwise the base is the top minus the constant gross thickness you typed.
      </li>
      <li>
        <strong>Active AOI.</strong> If one is active, every cell whose centre falls outside the polygon is
        written as null and stays transparent in the viewer.
      </li>
    </UL>

    <H2>How each value is derived</H2>

    <H3>Structure</H3>
    <P>
      The interpolated top surface elevation at the cell centre, straight from the interpolator. This is the
      only map that carries the raw surface value.
    </P>

    <H3>Gross thickness</H3>
    <Formula>gross = max(0, topZ - baseZ)</Formula>
    <P>
      Z is treated as elevation, so a shallower top and a deeper base give a positive thickness. With no base
      surface the result is simply your constant thickness everywhere, which makes this map flat.
    </P>

    <H3>Fluid columns</H3>
    <P>
      Before net pay can be found, the engine works out how much of the reservoir column at that cell sits in
      each fluid zone. The rules depend on the fluid type selected in the Fluid tab.
    </P>
    <Table
      headers={['Fluid type', 'Gas column', 'Oil column']}
      rows={[
        ['Oil', 'None', 'topZ down to the shallower of base and OWC'],
        ['Gas', 'topZ down to the shallower of base and the contact, using GOC if given otherwise OWC', 'None'],
        ['Oil and gas', 'topZ down to the shallower of base and GOC', 'from the deeper of topZ and GOC, down to the shallower of base and OWC'],
      ]}
    />

    <H3>Net pay thickness</H3>
    <Formula>netPay = (oilColumn + gasColumn) x NTG</Formula>
    <P>
      This is hydrocarbon-bearing net pay. Cells whose reservoir column lies entirely below the contact come
      out as zero, so the map draws the accumulation outline rather than the whole reservoir footprint.
    </P>

    <H3>HCPV column</H3>
    <Formula>hcpvColumn = netPay x porosity x (1 - Sw)</Formula>
    <P>
      The result is a height in feet or metres. It expresses the hydrocarbon pore volume per unit area as an
      equivalent column of pure hydrocarbon. Multiply it by an area and you have a volume in acre-ft or m³.
    </P>

    <H3>STOOIP and GIIP intensity</H3>
    <P>
      The engine splits the hydrocarbon pore column into an oil part and a gas part first, so oil and gas
      never draw on the same pore space, then applies the formation volume factors.
    </P>
    <Formula>hcpvOil = oilColumn x NTG x porosity x (1 - Sw)</Formula>
    <Formula>hcpvGas = gasColumn x NTG x porosity x (1 - Sw)</Formula>
    <Formula>STOOIP intensity (field) = hcpvOil x 7758 / Bo   [bbl/acre]</Formula>
    <Formula>GIIP intensity (field) = hcpvGas x 43560 / Bg   [scf/acre]</Formula>
    <P>
      In metric the constants become 1,000,000, which converts a column in metres against an area in square
      kilometres, and the maps are labelled m³/km². Both intensity maps default to the Portland colour scale.
    </P>

    <H2>Workflow</H2>
    <OL>
      <li>Import a surface in the Surf tab and select it as the Top surface in the Reservoir inputs.</li>
      <li>
        Fill in the geometry and fluid inputs that the maps depend on: gross thickness or a base surface,
        NTG, porosity, Sw, Bo or Bg, fluid type, and the OWC and GOC depths.
      </li>
      <li>Optional. Draw an AOI in the AOI tab and make it active if you want the maps clipped.</li>
      <li>Open the Maps tab, tick the map types you want, and press Generate Maps.</li>
      <li>
        Open the layer selector at the top right of the Visualization panel and pick the map you want to
        paint. The Gallery button shows every generated map as a thumbnail.
      </li>
    </OL>
    <P>
      Generated maps are listed at the bottom of the Maps tab with their units, and each has a delete button.
      They are also counted in the Data Manager and echoed as badges under the deterministic results.
    </P>
    <Note tone="success" title="Maps travel with the project">
      Generated property maps are part of the project snapshot. Save the project and they come back with it.
      Saved views from the Visualization panel behave differently, as described in the Visualization article.
    </Note>

    <H2>Limits worth knowing before you trust a map</H2>
    <UL>
      <li>
        <strong>Maps are display artefacts.</strong> Nothing in the results panel is computed from them. The
        volumetrics numbers come from the contact volumetrics engine, which builds its own grid at the
        resolution set in Settings. A map and a reported volume can therefore differ slightly in the
        geometry they imply.
      </li>
      <li>
        <strong>No hull mask.</strong> The map covers the full rectangular bounding box of the surface
        control points. Areas far from any control point are extrapolated and painted anyway. The
        volumetrics engine, by contrast, drops cells further than roughly twice the mean sample spacing from
        the nearest control point.
      </li>
      <li>
        <strong>Elevation convention is assumed.</strong> The map engine treats Z as elevation, negative
        downward. A surface imported with the depth convention, positive downward, will give inverted
        thickness and nonsense contact logic in the maps, even though the volumetrics engine handles both
        conventions correctly. Check the convention badge on the surface before reading a thickness map.
      </li>
      <li>
        <strong>AOI clipping here is all or nothing.</strong> A cell is kept if its centre is inside the
        polygon and dropped otherwise. The volumetrics engine uses fractional cell coverage instead, so a map
        and a clipped volume treat the boundary differently by design.
      </li>
      <li>
        <strong>Scalar inputs.</strong> NTG, porosity and Sw are constants across the whole grid. Lateral
        variation in the maps comes only from the structure, the base and the contacts.
      </li>
    </UL>
  </Article>
);

export default MapGenerationGuide;
