import React from 'react';
import { Article, H2, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const ContactVolumetricsGuide = () => (
  <Article
    title="Contact Volumetrics (Structural Grid Engine)"
    lead="The engine behind the Hybrid and Surfaces input methods. Gross rock volume is integrated cell by cell over the top structure map against the fluid contact depths, so moving a contact moves the volume."
  >
    <Note tone="info" title="When this engine runs">
      <Code>VolumeCalculationEngine.calculateDeterministic</Code> delegates to
      <Code>ContactVolumetricsEngine.calculate</Code> whenever the input method is
      <Code>hybrid</Code> or <Code>surfaces</Code>. Hybrid needs a top surface plus a positive gross
      thickness. Surfaces needs a top surface and a base surface. Either way a top surface with at
      least 3 points is mandatory, and the run returns an error rather than a number if that is
      missing.
    </Note>

    <H2>1. The core identity</H2>
    <P>
      Every volume this engine reports comes from one sum. For a fluid zone defined by a depth window,
      the gross rock volume is the sum over grid cells of the vertical overlap between the reservoir
      column at that cell and the zone window, multiplied by the cell footprint area.
    </P>
    <Formula>
      GRV_zone = SUM over cells of  overlap([topZ, baseZ], [zoneTop, zoneBase]) x cellArea
    </Formula>
    <Formula>
      overlap(rTop, rBase, zTop, zBase) = max(0, min(rBase, zBase) - max(rTop, zTop))
    </Formula>
    <P>
      The reservoir column at a cell is the interval from the top surface depth to the base depth.
      The base depth is the base surface where one is supplied, and otherwise the top depth plus the
      constant gross thickness. A cell whose column has zero or negative height is discarded before
      it enters the sum.
    </P>
    <P>
      This is why the engine reacts to structure. A dome and a flat surface with the same mean depth
      and the same mapped area produce different overlaps against the same contact, so they produce
      different GRV. The analytic path cannot see that difference.
    </P>

    <H2>2. Building the grid</H2>
    <P>
      The interpolator is built over the top surface control points and reports the bounding box of
      those points. The engine grids that box. Interpolation is ordinary kriging or inverse distance
      weighting, chosen in Settings. The engine falls back to inverse distance weighting when the
      caller passes no preference, which keeps the engine unit tests deterministic.
    </P>
    <Formula>
      width  = max(maxX - minX, 1e-9)
      height = max(maxY - minY, 1e-9)
    </Formula>
    <Formula>
      nx = clamp(round(resolution), 20, 600)      default resolution = 150
      ny = clamp(round(nx x height / width), 20, 600)
    </Formula>
    <Formula>
      dx = width / nx      dy = height / ny      cellAreaXY = dx x dy
    </Formula>
    <P>
      The count along Y is scaled by the aspect ratio so cells stay close to square on an elongated
      prospect. Both counts are clamped to the range 20 to 600. Settings offers Coarse 80, Standard
      150 and Fine 250, and 150 is the default. Cell centres are sampled at
      <Code>minX + (i + 0.5) x dx</Code> and <Code>minY + (j + 0.5) x dy</Code>.
    </P>
    <Note tone="warn" title="Resolution is a convergence question">
      Rerun a case at Coarse, Standard and Fine. If the GRV moves by more than a percent or so
      between Standard and Fine, the structure has detail your grid is not resolving and you should
      report the Fine number. If the numbers agree, the Standard grid has converged and you can run
      the rest of the study there.
    </Note>

    <H2>3. Depth convention normalisation</H2>
    <P>
      Surfaces arrive in one of two conventions. Elevation increases upward, so a deeper point is a
      more negative number. Depth increases downward, so a deeper point is a larger number. The
      engine reads the convention from <Code>options.zConvention</Code>, then the surface&apos;s own
      <Code>zConvention</Code>, and defaults to <Code>elevation</Code> when neither is present.
    </P>
    <Formula>
      toDepth(z) = -z when zConvention is 'elevation', otherwise z
    </Formula>
    <P>
      Everything downstream of that call works in depth increasing downward, which makes the interval
      arithmetic convention independent. The same transform is applied to the OWC and GOC values you
      type, so contacts and surfaces are always compared in the same frame. Shallow becomes
      <Code>td</Code> and deep becomes <Code>bd</Code>, assigned with an explicit min and max so an
      inverted pair still yields a positive column.
    </P>

    <H2>4. Unit handling, and the bug it fixes</H2>
    <P>
      Cell area is computed in the surface&apos;s true XY units and converted afterwards. Depth is
      converted separately, because a surface can perfectly well carry XY in metres and Z in feet.
    </P>
    <Formula>
      FT_PER_M = 3.280839895      SQFT_PER_ACRE = 43560      M2_PER_KM2 = 1,000,000
    </Formula>
    <Table
      headers={['Conversion', 'xyUnit or depthUnit is m', 'xyUnit or depthUnit is ft']}
      rows={[
        ['xyToTargetLen, field target', '3.280839895', '1'],
        ['xyToTargetLen, metric target', '1', '1 / 3.280839895'],
        ['depthToTargetLen, field target', '3.280839895', '1'],
        ['depthToTargetLen, metric target', '1', '1 / 3.280839895'],
      ]}
    />
    <Formula>
      cellAreaTargetRaw = cellAreaXY x xyToTargetLen^2          gives ft2 or m2
    </Formula>
    <Formula>
      cellArea = cellAreaTargetRaw / 43560 for field targets, otherwise cellAreaTargetRaw
    </Formula>
    <P>
      So a field unit run carries cell area in acres and depth in feet, and the sum in section 1
      lands in acre-ft ready for the 7758 and 43560 constants. A metric run carries area in m2 and
      depth in m, so the sum lands in m3.
    </P>
    <Note tone="danger" title="The historic bug this replaces">
      The retired path took a bounding box in whatever XY units the surface used, typically UTM
      metres, and fed the resulting metres squared straight into the acre-ft constant. A survey in
      UTM produced a volume inflated by the square of the wrong length conversion. Carrying area in
      true XY units and converting explicitly is what removed that class of error. If you are
      comparing against a legacy saved result and the ratio looks like a power of 3.28, this is why.
    </Note>

    <H2>5. Hull masking</H2>
    <P>
      A regular grid over a bounding box covers ground your control points never sampled, especially
      at the corners of an irregular survey. The interpolator will happily extrapolate into that
      empty ground, and the volume it invents there is fiction. Hull masking drops those cells.
    </P>
    <Formula>
      sampleSpacing = sqrt(width x height / pointCount)
    </Formula>
    <Formula>
      hullRadius = hullFactor x sampleSpacing         default hullFactor = 2.0
    </Formula>
    <P>
      A cell is dropped when the distance from its centre to the nearest control point exceeds
      hullRadius. Each dropped cell increments <Code>maskedCount</Code>. Masking is on by default and
      is switched off only by passing <Code>hullMask: false</Code>.
    </P>
    <P>
      The factor of 2.0 means the grid is allowed to reach roughly two average sample spacings beyond
      the nearest data point. Widen it and you extrapolate further into unsampled ground. Narrow it
      and you start clipping real flank volume near the edge of the survey.
    </P>

    <H2>6. Area of interest clipping</H2>
    <P>
      When an AOI polygon is active with at least 3 vertices, every cell is tested for coverage before
      anything else happens, and the cell area entering the sum is multiplied by that coverage
      fraction. Partially covered cells contribute a fraction rather than all or nothing, which keeps
      the licence boundary from becoming a staircase.
    </P>
    <OL>
      <li>
        Fast path. Probe the four cell corners and the cell centre, five points in all. Five inside
        returns coverage 1. Zero inside returns coverage 0 and the cell is skipped with
        <Code>clippedCount</Code> incremented.
      </li>
      <li>
        Boundary path. Anything between 1 and 4 inside means the polygon edge crosses this cell.
        Sub-sample it on a 4 by 4 lattice of 16 points and return hits divided by 16, so coverage
        resolves to the nearest 1/16.
      </li>
    </OL>
    <P>
      Point in polygon testing uses <Code>PolygonClippingEngine.isPointInPolygon</Code>. The five
      probe fast path matters for performance, because a 150 by 150 grid is 22,500 cells and only the
      handful along the polygon edge ever pay for the 16 point refinement.
    </P>
    <Note tone="info" title="Clipping order">
      AOI clipping runs before hull masking. A cell outside the AOI is counted as clipped and never
      considered for masking, so <Code>clippedCount</Code> and <Code>maskedCount</Code> do not double
      count the same cell.
    </Note>

    <H2>7. Fluid zone depth windows</H2>
    <P>
      Contacts are converted into the target depth down frame with the same transform as the surface,
      then turned into a pair of windows. A missing OWC becomes positive infinity, meaning the zone
      extends to the base of the column with no water leg. Windows are open upward, expressed as
      negative infinity, because nothing above the crest can hold rock.
    </P>
    <Table
      headers={['fluidType', 'Gas window', 'Oil window', 'Notes']}
      rows={[
        ['gas', 'everything above the GWC', 'none', 'GWC is the GOC if a GOC is present, otherwise the OWC.'],
        ['oil', 'none', 'everything above the OWC', 'The single contact case.'],
        ['oil_gas with a GOC', 'everything above the GOC', 'from the GOC down to the OWC', 'The rigorous two contact split.'],
        ['oil_gas with no GOC', 'none', 'everything above the OWC', 'Degrades to undersaturated oil and warns.'],
      ]}
    />
    <P>
      The gas water contact rule is worth reading twice. On a pure gas case the engine takes the GOC
      field as the gas water contact when it is filled, and falls back to the OWC field when it is
      not. That lets a gas case be driven from either field without renaming anything.
    </P>
    <Note tone="warn" title="The two contact warnings">
      <div>
        Oil plus gas with no GOC returns: &quot;Oil+gas selected but no GOC provided, modelled as
        undersaturated oil (no gas cap).&quot; GIIP will be zero because the gas window is empty.
      </div>
      <div className="mt-2">
        An OWC shallower than the GOC returns: &quot;OWC is shallower than GOC, check contact depths
        (expected GOC above OWC).&quot; The oil window collapses to zero height in that case and the
        oil volume goes to zero, so the warning is telling you the answer is already wrong.
      </div>
    </Note>

    <H2>8. From GRV to in-place volumes</H2>
    <P>
      Once the two zone volumes are summed, the rest of the arithmetic matches the analytic path,
      applied per zone so oil and gas never share pore volume.
    </P>
    <Formula>
      hcpvOil = grvOil x NTG x porosity x (1 - Sw)
      hcpvGas = grvGas x NTG x porosity x (1 - Sw)
    </Formula>
    <Formula>
      grv = grvOil + grvGas      netVolume = grv x NTG      poreVolume = netVolume x porosity
    </Formula>
    <Formula>
      Field:  STOOIP = hcpvOil x 7758 / Bo        GIIP = hcpvGas x 43560 / Bg
      Metric: STOOIP = hcpvOil / Bo               GIIP = hcpvGas / Bg
    </Formula>
    <P>
      Fractional inputs are clamped rather than rejected. NTG, porosity and Sw are pushed into the
      range 0 to 1, falling back to 1.0, 0.2 and 0.3 respectively when they do not parse. Bo defaults
      to 1.2 and Bg to 0.005 when the entered value is not strictly positive. Recovery factors are
      percentages divided by 100, and the headline <Code>recoverable</Code> is the gas number for a
      pure gas case and the oil number otherwise.
    </P>

    <H2>9. The structural diagnostics</H2>
    <P>
      The structural path returns everything the analytic path returns plus a block of fields that
      exist to let you judge whether you should believe the number. Read them every time.
    </P>
    <Table
      headers={['Field', 'What it is', 'What it tells you']}
      rows={[
        ['area, areaOil, areaGas', 'Summed footprint of cells with non-zero overlap, in acres or km2. hcArea mirrors area.', 'The productive area the engine actually found. Compare it against your mapped closure. A large gap means the contacts or the hull mask are cutting somewhere you did not intend.'],
        ['avgNetPayOil', 'grvOil x NTG divided by areaOil, in ft or m.', 'Average net pay over the oil footprint. Sanity check it against well net pay. A structural run that reports 3 ft of average net pay over 5,000 acres is telling you the OWC is clipping the crest.'],
        ['avgNetPayGas', 'grvGas x NTG divided by areaGas.', 'The same reading for the gas cap.'],
        ['resolution', 'nx, ny, dx, dy.', 'The grid actually used. dx and dy are in the surface XY units, so compare them against your control point spacing. Cells much finer than the data spacing buy you smoothness rather than accuracy.'],
        ['cellCount', 'Cells that survived clipping, masking and the positive column test.', 'The sample size of the integration. A few hundred cells over a large prospect means most of the grid was thrown away and the answer is coarse.'],
        ['maskedCount', 'Cells dropped by the hull mask.', 'How much of the bounding box lies outside the surveyed ground. A high count on an irregular survey is healthy. A high count on a dense regular grid means hullFactor is too tight.'],
        ['clippedCount', 'Cells dropped entirely by the AOI polygon.', 'Confirms the AOI is active and roughly how much of the map it removes. Zero here with an AOI selected means the polygon covers the whole grid.'],
        ['xyUnit, depthUnit', 'The units the engine believed the surface was in.', 'The single most common source of a wrong structural volume. If these do not match your source data, fix the surface metadata and rerun.'],
        ['zConvention', 'elevation or depth.', 'Tells you which way the engine flipped your Z values. A volume that goes to zero the moment a contact is applied usually means this is backwards.'],
      ]}
    />
    <Note tone="danger" title="Two failure warnings from the calculation itself">
      &quot;No hydrocarbon-bearing cells found, check contacts, surface, and AOI&quot; means the cell
      list came back empty. &quot;Zero in-place volume, the reservoir column may lie entirely below
      the OWC&quot; means cells exist but no overlap survived. Both point at the same short list:
      wrong zConvention, contact on the wrong side of the structure, or an AOI that misses the map.
    </Note>

    <H2>10. Hypsometry, the Monte Carlo shortcut</H2>
    <P>
      Rebuilding the grid for every Monte Carlo realisation would be unaffordable.
      <Code>buildHypsometry</Code> builds the cells once and precomputes a cumulative area against
      depth table, so each realisation evaluates a zone volume with a table lookup.
    </P>
    <Formula>
      V(z) = SUM over cells of  max(0, min(baseZ, z) - topZ) x cellArea
    </Formula>
    <P>
      V is piecewise linear in z with a breakpoint at every cell top and base. The engine tabulates it
      at N = 1024 evenly spaced levels between the shallowest top and the deepest base, then
      interpolates linearly between table entries. At 1024 levels the error against the exact
      piecewise linear function is well under a percent for any realistic structure.
    </P>
    <P>
      <Code>rockToContact(z)</Code> returns the rock volume between the top surface and depth z,
      capped at the base. A blank or unparseable contact returns the total volume, which is the
      correct behaviour for a fill to base case. <Code>zoneVolumes(fluidType, owc, goc)</Code> then
      applies the same fluid rules as section 7, with the oil leg computed as
      <Code>max(0, V(owc) - V(goc))</Code> so an inverted contact pair yields zero rather than a
      negative volume.
    </P>
    <P>
      The hypsometric table is built with exactly the same cells, the same masking and the same AOI
      clipping as the deterministic run, so the structural Monte Carlo and the deterministic base case
      are integrating the same rock.
    </P>

    <H2>11. Practical checklist</H2>
    <UL>
      <li>Confirm xyUnit, depthUnit and zConvention in the diagnostics before reading any volume.</li>
      <li>Compare the reported productive area against your mapped closure area.</li>
      <li>Sanity check average net pay against well control.</li>
      <li>Rerun at a finer resolution and confirm the GRV is stable.</li>
      <li>Check maskedCount and clippedCount are the sizes you expect from your survey and licence outline.</li>
      <li>For an oil plus gas case, set a real GOC. Leaving it blank silently turns the case into undersaturated oil.</li>
    </UL>
  </Article>
);

export default ContactVolumetricsGuide;
