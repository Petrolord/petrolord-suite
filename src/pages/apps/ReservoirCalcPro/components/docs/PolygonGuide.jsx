import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const PolygonGuide = () => (
  <Article
    title="Areas of Interest"
    lead="An AOI is a polygon drawn on the 2D structure map that restricts structural volumetrics to the ground you care about. This article covers how to draw one, how to make it active, and exactly how the clipping arithmetic treats a cell that straddles the boundary."
  >
    <Note tone="warn" title="Two corrections to earlier documentation">
      <UL>
        <li>
          The tab is called <strong>AOI</strong> and is marked with a scan-line icon between Surf and Maps.
          There is no tab called Polygons.
        </li>
        <li>
          There is no circle by centre and radius tool. Earlier documentation described entering a centre X,
          a centre Y and a radius. No such input exists anywhere in the app. A circle generator does sit
          unused inside the polygon engine, reachable only from the test suite. Freehand vertex drawing is
          the only way to create an AOI in the interface.
        </li>
      </UL>
    </Note>

    <H2>Drawing an AOI</H2>
    <OL>
      <li>
        Import a surface and select it as the Top surface. The Draw New Polygon button stays disabled until
        both are true, and the panel tells you so.
      </li>
      <li>
        Make sure the Visualization panel is on the structure surface layer. Clicks add vertices only on that
        layer, so a property map layer will swallow them silently.
      </li>
      <li>
        Open the AOI tab and press <strong>Draw New Polygon</strong>. The status badge switches from Idle to
        Drawing Mode and the 2D map cursor becomes a crosshair.
      </li>
      <li>
        Click on the 2D map to place vertices. Each click appends one point in surface world coordinates. The
        in-progress polygon is drawn dashed and green with its vertices as handles, and both the panel and a
        pill above the map count the points as you go.
      </li>
      <li>
        Press <strong>Finish</strong> once you have at least three points. The button stays disabled below
        three. Name the polygon in the dialog and save it. Cancel discards the whole in-progress polygon.
      </li>
    </OL>
    <P>
      There is no double-click to close, no vertex dragging, no undo of the last point, and no way to edit a
      saved polygon geometry. A shape you want to change has to be deleted and drawn again. The polygon is
      closed automatically from the last vertex back to the first, so you do not repeat the first point.
    </P>
    <Note tone="info" title="Newly saved AOIs become active immediately">
      Finishing a polygon adds it to the list and sets it as the active AOI in one step. If you were only
      sketching an outline for reference, click Active on the row to switch it off before you run a
      calculation.
    </Note>

    <H2>The AOI list</H2>
    <P>
      Each saved AOI appears in Defined Areas with a colour dot, its name and its vertex count, and the
      active one is highlighted with a blue border. Each row carries four actions.
    </P>
    <Table
      headers={['Action', 'Effect']}
      rows={[
        ['Eye', 'Shows or hides the polygon on the 2D map. Visibility is display only and has no effect on clipping.'],
        ['Trash', 'Deletes the AOI. If it was the active one, clipping switches off.'],
        ['Export', 'Downloads the polygon as a GeoJSON Feature carrying its name, colour and shoelace area in surface coordinate units.'],
        ['Select and Active', 'Toggles this AOI as the active one. Clicking Active on the current AOI clears it, so no AOI is active.'],
      ]}
    />
    <P>
      Exactly one AOI can be active at a time. The Data Manager also counts AOIs and can delete them. AOIs
      are part of the project snapshot, so they are saved and restored with the project.
    </P>

    <H2>What the active AOI actually changes</H2>
    <P>
      The active AOI is read at run time by the calculation paths that have geometry to clip. It reaches
      three places, and each treats it differently.
    </P>
    <Table
      headers={['Consumer', 'How the AOI is applied']}
      rows={[
        ['Deterministic run, Hybrid or Surfaces input method', 'Passed to the contact volumetrics engine as the clipping polygon. Fractional cell coverage.'],
        ['Probabilistic run, Hybrid or Surfaces input method', 'Passed into the hypsometry build, so every Monte Carlo realisation integrates over the clipped area. Fractional cell coverage.'],
        ['Map generation', 'Cells whose centre falls outside the polygon are written as null and left transparent. All or nothing.'],
        ['Deterministic or probabilistic run, Simple input method', 'Ignored. The analytic path multiplies the area you typed by a thickness and has no geometry to clip.'],
      ]}
    />
    <Note tone="danger" title="The Simple method never sees your AOI">
      If you are on the Simple input method, drawing an AOI changes nothing in the results. Type the clipped
      area into the area field yourself, or move to the Hybrid or Surfaces method so the structural engine
      does the clipping for you.
    </Note>

    <H2>Fractional cell coverage, and why it matters</H2>
    <P>
      The contact volumetrics engine builds a regular grid of cells over the surface bounding box at the
      resolution set in Settings. Rather than keeping or dropping each cell whole, it estimates what fraction
      of the cell lies inside the AOI and scales that cell area by the fraction before integrating.
    </P>
    <Formula>cell.area = fullCellArea x coverage,   coverage in [0, 1]</Formula>
    <P>The coverage estimate runs in two stages, for speed.</P>
    <OL>
      <li>
        <strong>Five-probe fast path.</strong> The four cell corners and the cell centre are tested against
        the polygon with a ray-casting point-in-polygon test. Five hits means the cell is fully inside and
        coverage is 1. Zero hits means the cell is treated as fully outside and it is discarded.
      </li>
      <li>
        <strong>Four by four sub-sampling.</strong> Anything between one and four hits is a boundary cell.
        The engine then samples 16 evenly spaced points inside the cell and returns the hit count divided by
        16, giving coverage in sixteenths.
      </li>
    </OL>
    <P>
      The practical consequence is that a licence boundary cutting diagonally across the grid contributes
      roughly half of each straddled cell instead of an arbitrary all or nothing. On a coarse grid that is
      the difference between a stable answer and one that jumps every time you nudge the boundary. Cells kept
      by the AOI test still have to pass the hull mask afterwards, so ground inside your polygon but far from
      any surface control point is still dropped.
    </P>
    <Note tone="warn" title="Two edge cases in the coverage estimate">
      A sliver of polygon that crosses a cell without covering any of the five probes is treated as fully
      outside and contributes nothing. And coverage lands on a multiple of one sixteenth, so a very coarse
      grid with a long ragged boundary carries a small quantisation error. Raising the grid resolution in
      Settings shrinks both effects, since the boundary cells become a smaller share of the total.
    </Note>

    <H2>Practical uses</H2>
    <H3>Excluding ground below the lowest known oil</H3>
    <P>
      Where the trap is only proven down to a logged contact and the seismic map runs on past it, draw the
      AOI around the proven area and report that volume separately from the full closure. Combined with the
      OWC input you get a defensible proven case and an upside case from the same surface.
    </P>
    <H3>Restricting to a licence block</H3>
    <P>
      Trace the block boundary as the polygon and every structural volume you run is your share of the
      accumulation. The fractional coverage matters most here, because a licence line rarely follows the grid
      and a straight edge across a coarse grid is exactly where all-or-nothing clipping goes wrong.
    </P>
    <H3>Isolating a fault compartment</H3>
    <P>
      Draw the polygon along the bounding faults to get compartment volumes from a single surface. Run each
      compartment as its own AOI, note the number, then switch AOI and run again. The Audit Trail records
      each run, so the sequence stays traceable.
    </P>
    <Note tone="success" title="Sanity check before you report a clipped volume">
      After a clipped run, look at the productive area in the results. It should be close to the polygon area
      you see on the exported GeoJSON, allowing for the parts of the polygon that fall outside the
      accumulation or outside the surface control. A productive area far below what you expect usually means
      the hull mask, rather than the polygon, is what is trimming your grid.
    </Note>
  </Article>
);

export default PolygonGuide;
