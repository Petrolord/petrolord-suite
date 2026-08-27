import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const SurfaceImportGuide = () => (
  <Article
    title="Surface Import"
    lead="How ReservoirCalc Pro reads a structural surface, what it does with no-data values, and what the three declarations on the import dialog (coordinate unit, depth convention, CRS) actually control."
  >
    <H2>Accepted formats</H2>
    <P>
      The parser sniffs the file content first and falls back to the file extension. The format buttons on
      the dialog (XYZ, CPS-3, ZMap) are a label recorded on the surface record; they do not change how the
      file is read.
    </P>
    <Table
      headers={['Format', 'Typical extension', 'How it is read']}
      rows={[
        ['XYZ points', '.xyz, .txt', 'Delimited reader. First line with three or more numbers sets the delimiter and the data start.'],
        ['CSV', '.csv', 'Delimited reader through PapaParse, with dynamic typing and # treated as a comment.'],
        ['DAT', '.dat', 'Delimited reader. Lines starting with #, ! or / are skipped.'],
        ['ESRI ASCII grid', '.asc, .grd', 'Header keys NCOLS, NROWS, XLLCORNER or XLLCENTER, YLLCORNER or YLLCENTER, CELLSIZE, NODATA_VALUE. Detected when NCOLS and NROWS appear in the first 200 characters. Cell values are expanded to XY points, first data row treated as the northernmost row.'],
        ['ZMap+', '.dat, .zmap', 'Detected when the file starts with ! or contains the phrase "nodes per line". Read with the delimited reader.'],
        ['CPS-3', '.dat, .txt', 'Body read with the delimited reader.'],
        ['GeoJSON / JSON', '.geojson, .json', 'A FeatureCollection is read as coordinates [x, y, z] per feature. A plain array of objects with x/y/z or X/Y/Z keys also works. A missing third coordinate becomes 0.'],
      ]}
    />
    <P>
      The file chooser accepts <Code>.txt .csv .dat .xyz .asc .grd .json .geojson .zmap</Code>. Both the
      Seismolord and Mapping Studio handoffs go through the same XYZ path.
    </P>

    <Note tone="warn" title="Limit on ZMap+ and CPS-3">
      Those two formats are handled by the delimited reader, which expects every data row to carry X, Y and
      Z. A node-only grid body that lists Z values without coordinate columns will import as nonsense or
      fail the pre-flight check. Re-export such a file as XYZ points or as an ESRI ASCII grid.
    </Note>

    <H2>Pre-flight rejections</H2>
    <P>
      Before parsing, the file is checked so a wrong upload gives a reason instead of a silent bad surface.
      Each rejection carries a title, an explanation and a short list of next steps, shown in the dialog.
    </P>
    <UL>
      <li>Empty file.</li>
      <li>Binary content: a NUL byte in the first 4000 characters, or control characters above 5 percent of that sample. This catches images, PDFs, spreadsheets, SEG-Y, DLIS and native project files.</li>
      <li>LAS well logs: the extension <Code>.las</Code>, or any of <Code>~VERSION ~WELL ~CURVE ~ASCII</Code> in the head of the file.</li>
      <li>Documents: content starting with <Code>%PDF</Code>, or HTML markup in the head.</li>
      <li>Fewer than two lines (within the first 400) that carry three or more numbers.</li>
    </UL>

    <H2>No-data, sentinels and the magnitude cap</H2>
    <P>
      Every parsed row must have numeric X, Y and Z. A Z value is treated as no-data and the whole point is
      dropped when any of the following holds.
    </P>
    <Table
      headers={['Test', 'Rule', 'Why']}
      rows={[
        ['Not finite', 'NaN or Infinity', 'Unparseable or overflowed field.'],
        ['Huge nulls', 'abs(z) at or above 1e29', 'Catches the 1.0E+30 null written by several grid packages.'],
        ['Sentinel list', 'z exactly equal to -9999, -9999.25, -9999.99, -999.25, 999.25 or 9999.25', 'The literal null markers used by ZMap+, CPS-3 and common XYZ exports.'],
        ['Magnitude cap', 'abs(z) greater than 100000', 'Beyond any plausible depth or elevation in ft or m.'],
      ]}
    />
    <P>
      The sentinel test is an exact comparison. Those markers are written as those literals, so parsing
      reproduces them exactly, and a genuine computed depth of -9999.31 survives. There is no tolerance
      window around the sentinels, because a window would also swallow real depths that happen to land
      nearby.
    </P>
    <P>
      ESRI ASCII grids are additionally filtered on their own header value: cells equal to
      <Code>NODATA_VALUE</Code> are skipped during expansion, defaulting to -9999 when the header omits it.
    </P>
    <Note tone="success" title="Deep-water surfaces import correctly">
      An earlier build kept only points inside a window of roughly -9000 to 90000, which silently deleted
      every horizon deeper than 9000 ft. That window is gone. A surface sitting at -18000 ft TVDSS now
      imports in full.
    </Note>
    <P>
      When every row is a null marker the import stops with a clear message. When some rows survive, the
      good points are kept and the file imports.
    </P>

    <H2>The three declarations on the dialog</H2>
    <P>
      A depth surface is a set of numbers with no unit and no sign convention attached. The dialog asks you
      to declare both, plus an optional CRS, and stores your answers on the surface record. The contact
      volumetrics engine reads them back to turn cell areas and depth intervals into physical volumes.
    </P>

    <H3>1. Coordinate Units (xyUnit)</H3>
    <P>
      Meters or Feet. This single choice is applied to X, Y and Z together. The surface record receives
      <Code>xyUnit</Code> and <Code>depthUnit</Code> set to the same value. See the one-unit model below.
    </P>

    <H3>2. Depth Convention (zConvention)</H3>
    <Table
      headers={['Setting', 'Stored value', 'Meaning']}
      rows={[
        ['Elevation (minus)', 'elevation', 'Z is negative downward. A reservoir top at 8000 ft below sea level is -8000.'],
        ['Depth (plus)', 'depth', 'Z is positive downward, TVDSS. The same top is +8000.'],
      ]}
    />
    <P>
      Internally the engine normalises to depth-increasing-downward before doing any interval arithmetic, so
      either convention gives the same volume as long as the contacts you type use the same convention as
      the surface.
    </P>
    <Note tone="warn" title="Two captions in the app disagree">
      The Geometry tab shows a banner saying the Z axis is negative downward, while the caption under the
      Fluid Contacts card says Z values are assumed to be positive downward. Ignore both captions and follow
      the surface. The engine converts contacts using the <Code>zConvention</Code> recorded on the surface at
      import, so type OWC and GOC in whatever convention you declared there.
    </Note>

    <H3>3. Coordinate Reference System (CRS)</H3>
    <P>
      A free-text field, prefilled by auto-detection. A blank value is stored as null and means an
      unspecified or local grid.
    </P>
    <UL>
      <li>
        GeoJSON and JSON: the legacy <Code>crs.properties.name</Code> member is read, for example
        <Code>urn:ogc:def:crs:EPSG::32631</Code>. An EPSG code of 4 to 6 digits is extracted and displayed as
        <Code>EPSG:32631</Code>. When the name carries no EPSG code the raw string is kept as typed.
      </li>
      <li>
        All other formats: the first 4000 characters are scanned for the pattern <Code>EPSG</Code> followed
        by a colon or whitespace and 4 to 6 digits. This picks up EPSG tags in ESRI ASCII and ZMap+ header
        comments.
      </li>
      <li>Detection only prefills the field. You can overwrite it, and your value wins.</li>
    </UL>
    <Note tone="danger" title="ReservoirCalc Pro does not reproject">
      The CRS is provenance metadata. Nothing in the app transforms coordinates. If you import one surface in
      UTM zone 31N and another in zone 32N, both are gridded in the raw numbers they carry and the two will
      not overlay. Reproject to a common CRS in your mapping package before import.
    </Note>

    <H2>The one-unit model, and what it costs</H2>
    <P>
      A surface in ReservoirCalc Pro carries one length unit for XY and Z. There is no separate vertical
      unit. Most exports are self-consistent, so this is invisible. It matters for a Seismolord depth
      surface, which is published with XY in metres and Z in feet.
    </P>
    <P>
      The import path reconciles that by rescaling XY from metres to feet and leaving Z untouched, giving a
      self-consistent all-feet surface with the interpreter depth values preserved.
    </P>
    <Formula>FT_PER_M = 3.280839895013123 ; x_ft = x_m * FT_PER_M ; y_ft = y_m * FT_PER_M ; z unchanged</Formula>
    <P>
      Rescaled XY are written back with two decimal places. The CRS field is then blanked, because
      metre-based eastings and northings multiplied by 3.2808 are no longer coordinates in any coordinate
      reference system. Recording an EPSG code against them would be a false claim of provenance.
    </P>
    <Note tone="info" title="The alternative was worse">
      Labelling feet depths as metres, or vice versa, put a factor of about 3.28 straight into GRV. Rescaling
      XY keeps the volume right and gives up only the CRS tag.
    </Note>

    <H2>Importing from other Suite apps</H2>
    <P>
      The dialog lists surfaces published by two other apps when any exist. Both land on the same parse path
      as a manual upload.
    </P>

    <H3>From Seismolord (seismic_exported_surfaces)</H3>
    <P>
      Each row shows its domain and export time. What happens on Use depends on the domain.
    </P>
    <Table
      headers={['Domain', 'XY handling', 'Declarations set']}
      rows={[
        ['depth_ft', 'XY rescaled from metres to feet', 'xyUnit ft, zConvention elevation, CRS blanked'],
        ['twt_ms', 'Left untouched', 'xyUnit m, zConvention elevation, CRS blanked'],
      ]}
    />
    <Note tone="danger" title="Two-way time surfaces give meaningless volumes">
      Loading a TWT surface in milliseconds raises a warning toast. The values are times, so gross rock
      volume computed from them has no physical meaning and volumetric results will be wrong. Depth-convert
      the horizon in Seismolord and export it as depth in feet before using it here.
    </Note>
    <P>
      The CRS is deliberately cleared for both domains, so a CRS typed for an earlier manual import is never
      carried onto a Seismolord surface.
    </P>

    <H3>From Mapping and Surface Studio (geo_surfaces)</H3>
    <P>
      Each row shows its kind and grid size. The float32 grid is downloaded and converted to XYZ text in
      memory, then parsed as usual. The registry row drives the declarations.
    </P>
    <UL>
      <li>
        <Code>z_unit</Code> is honoured. A value of <Code>ft</Code> triggers the same XY rescale to feet and
        the same CRS blanking. Anything else is treated as metres.
      </li>
      <li>
        <Code>zConvention</Code> follows the producing app. Rows whose provenance names Seismolord are
        negative-down (elevation); Mapping Studio structure grids are positive-down (depth).
      </li>
      <li>
        The row <Code>crs</Code> is carried into the CRS field when XY were not rescaled.
      </li>
      <li>
        When a row records no z unit and is not an attribute grid, metres are assumed and the toast says so.
        Verify that before running volumetrics.
      </li>
    </UL>

    <H2>Geometry sanity checks</H2>
    <P>
      A surface can parse cleanly and still be the wrong file. These checks run on the clean points and
      produce warnings rather than errors. The dialog holds the import back, lists what it found, and offers
      an Import Anyway button.
    </P>
    <Table
      headers={['Check', 'Trigger', 'Usual cause']}
      rows={[
        ['Too few points', 'Fewer than 10 usable points', 'A picks file or a sparse well-tops list.'],
        ['Zero width or height', 'All points on one line', 'A well path, a fault polyline or a cross-section.'],
        ['Near collinear', 'Long axis over 500 times the short axis', 'A trajectory or a single 2D line rather than a mapped grid.'],
        ['Flat surface', 'Every Z identical', 'The wrong column was exported as depth.'],
      ]}
    />

    <H2>What gets stored on the surface</H2>
    <OL>
      <li>All clean points feed the statistics: minZ, maxZ, avgZ, the XY bounding box and the full point count.</li>
      <li><Code>estimatedArea</Code> is the bounding-box extent, width times height, in the file XY units. It is a first-order estimate used by the simpler volume paths.</li>
      <li>The point set kept for display and gridding is downsampled to about 5000 points by an even stride, so the full extent is preserved. Large survey grids therefore render and grid quickly while the statistics still reflect every node.</li>
      <li>The declarations are attached: <Code>xyUnit</Code>, <Code>depthUnit</Code>, <Code>zConvention</Code>, <Code>crs</Code>.</li>
    </OL>

    <H2>Known limits</H2>
    <UL>
      <li>No reprojection, as above.</li>
      <li>ESRI ASCII grids: <Code>XLLCENTER</Code> is treated as if it were <Code>XLLCORNER</Code>, so a centre-registered grid is offset by half a cell. Also, a <Code>NODATA_VALUE</Code> of exactly 0 falls back to -9999, so zero-valued cells are kept.</li>
      <li>Only a single Z column is read. Multi-attribute grids lose the extra columns.</li>
      <li>Faults, polygons and grid boundaries in a file are ignored. Only point triples are extracted.</li>
      <li>No check that two surfaces share a CRS or a unit. Selecting a metric top with a feet base gives a wrong thickness silently.</li>
    </UL>
  </Article>
);

export default SurfaceImportGuide;
