import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const SurfacePaintingGuide = () => (
  <Article
    title="Visualization"
    lead="The centre panel paints the active surface or any generated property map as a filled contour map, as a shaded 3D mesh, or as both side by side. This article covers the three view modes, the layer selector, the colour scales, what the 3D viewer really is, and where a saved view actually goes."
  >
    <H2>Three view modes, and Split is the default</H2>
    <P>
      The three buttons in the panel header switch between the modes. The panel opens in Split, so a fresh
      session shows the 2D map and the 3D mesh together.
    </P>
    <Table
      headers={['Mode', 'Icon', 'What you get']}
      rows={[
        ['2D', 'Map pin', 'The contour viewer alone, filling the panel. The best mode for drawing an AOI or reading values off the grid.'],
        ['Split', 'Layout', 'Contour viewer on the left, 3D mesh on the right. Stacks vertically on a narrow screen. This is the default.'],
        ['3D', 'Box', 'The 3D viewer alone, filling the panel. The best mode for judging structure and contact geometry.'],
      ]}
    />
    <P>
      The maximise button beside them puts the whole panel into browser fullscreen through the Fullscreen
      API, which is worth using before a screen capture.
    </P>

    <H2>The layer selector</H2>
    <P>
      The dropdown at the top right lists the structure surface first, marked with a frame glyph, then every
      generated property map, each marked with a grid glyph. Whatever you pick drives both halves of the
      panel at once. The dropdown appears only once at least one property map exists, since before that
      there is a single layer to show.
    </P>
    <UL>
      <li>
        <strong>Structure surface layer.</strong> The active surface, gridded on demand at 80 columns with
        your chosen interpolation method if the surface has no stored grid. This layer carries the depth
        convention, so the 3D viewer shows fluid contacts here.
      </li>
      <li>
        <strong>Property map layers.</strong> The grids produced by the Maps tab, each with its own unit and
        its own default colour scale. These render as plain height fields with no contact planes, because a
        thickness or an intensity has no depth reference to hang a contact on.
      </li>
    </UL>
    <Note tone="info" title="AOI drawing follows the surface layer">
      Polygon drawing is enabled only while the structure surface layer is selected. AOIs live in surface
      world coordinates, and the Split view labels the 2D half with &ldquo;draw AOIs here&rdquo; when drawing
      is available. Switch to a property map layer and the click-to-add-vertex behaviour switches off.
    </Note>

    <H2>Colour scales</H2>
    <P>
      Three separate places set colour, and they interact.
    </P>
    <OL>
      <li>
        <strong>Settings.</strong> The default colour scale preference offers Earth, Viridis, Jet, Hot and
        Blues. It applies to the structure surface layer.
      </li>
      <li>
        <strong>The map type.</strong> Each generated map arrives with a colour scale chosen by the
        generation engine, listed in the table below.
      </li>
      <li>
        <strong>The viewer toolbars.</strong> Both the 2D and the 3D viewer carry their own colour scale
        dropdown offering Earth, Viridis, Turbo, RdYlBu, YlGnBu, Blues and Hot. Changing it affects that
        viewer only and resets when you switch layers.
      </li>
    </OL>
    <Table
      headers={['Layer', 'Colour scale it arrives with']}
      rows={[
        ['Structure surface', 'Your Settings default, Earth unless you changed it'],
        ['Structure (Depth) map', 'Earth'],
        ['Gross Thickness', 'Jet'],
        ['Net Pay Thickness', 'Jet'],
        ['HCPV Column', 'Hot'],
        ['STOOIP Intensity', 'Portland'],
        ['GIIP Intensity', 'Portland'],
        ['Porosity', 'YlGnBu'],
        ['Water Saturation', 'Blues'],
      ]}
    />
    <P>
      Jet and Portland both render through the Turbo interpolator. Neither name appears in the viewer
      dropdowns, so on a thickness or an intensity layer the dropdown can open with nothing highlighted even
      though the map is painted correctly. Pick any listed scale and the dropdown settles.
    </P>

    <H2>The 2D contour viewer</H2>
    <P>
      A canvas heatmap of the grid with contours drawn over it. Null cells stay transparent, which is how
      AOI-clipped maps show their hole.
    </P>
    <UL>
      <li><strong>Fill.</strong> Toggles the colour grading, leaving a line-only contour map.</li>
      <li>
        <strong>Contours and Labels.</strong> Every fifth level is drawn heavier as an index contour and only
        index contours get a value label, following the usual mapping convention.
      </li>
      <li>
        <strong>Density.</strong> Coarse gives about 8 levels across the value range, Medium about 16, Fine
        about 30. The contour interval in use is printed in the legend as <Code>CI</Code>.
      </li>
      <li>
        <strong>Value probe.</strong> Hovering shows X, Y and the nearest grid node value with its unit in a
        readout at the top right.
      </li>
      <li>
        <strong>AOI overlay.</strong> Every visible AOI is drawn as a filled translucent polygon in its own
        colour. The active AOI also shows its vertices as handles.
      </li>
      <li>
        <strong>Drawing.</strong> With drawing armed from the AOI tab, each click on the map adds a vertex.
        The in-progress polygon is dashed and green, and a counter shows how many points you have placed.
      </li>
    </UL>

    <H2>What the 3D viewer actually is</H2>
    <P>
      It is a dependency-free renderer written directly against a 2D canvas. There is no WebGL and no
      three.js in it. Geometry is projected through a real perspective camera in JavaScript, quads are sorted
      back to front and painted in that order, and shading comes from a single fixed light direction dotted
      against each quad normal. That approach keeps the bundle small and works anywhere a canvas works. It
      also sets the expectations you should have: quad-level sorting rather than per-pixel depth, and frame
      rates that drop on very large grids.
    </P>
    <H3>What it draws</H3>
    <UL>
      <li>
        <strong>A lit hypsometric mesh.</strong> Colour follows the value at each quad, shading follows the
        surface normal, and the whole model is normalised into a unit box so any coordinate system renders
        sensibly.
      </li>
      <li>
        <strong>Draped contour lines.</strong> On by default. Fourteen levels are computed in world
        coordinates and drawn at the correct model height, with every fifth line heavier. Toggle them with
        the wave button.
      </li>
      <li>
        <strong>Fluid contact planes.</strong> Translucent labelled planes cutting the structure. Amber for
        the GOC and blue for the OWC in an oil and gas case, blue for the OWC in an oil case, and a blue GWC
        plane for a gas case drawn at the GOC value if you gave one and at the OWC value otherwise. Labels
        carry the depth value, apart from the GWC label. Planes appear only on the structure surface layer,
        and a plane that lands far outside the model box is dropped rather than drawn.
      </li>
      <li>
        <strong>A floor grid</strong> under the mesh for depth perception, and a colour legend at the top
        right showing the value range with its unit.
      </li>
    </UL>
    <H3>Controls</H3>
    <UL>
      <li><strong>Drag</strong> to rotate. Horizontal drag swings the azimuth, vertical drag changes the elevation, which is clamped so you cannot flip under the model.</li>
      <li><strong>Scroll</strong> to zoom, clamped between roughly 1.9 and 7 camera distances.</li>
      <li><strong>Double-click</strong> to reset the camera. The reset button at the bottom left also restores the vertical exaggeration.</li>
      <li><strong>Solid and wireframe</strong> buttons switch the mesh between shaded quads and mesh edges. Contact planes stay solid in wireframe mode.</li>
      <li>
        <strong>Vertical exaggeration.</strong> A slider from 0.2 to 40. The starting value is computed from
        the relief of the surface so that subtle structure is visible, which means the number differs from
        one surface to the next.
      </li>
    </UL>
    <Note tone="warn" title="Read the exaggeration before judging relief">
      Because the default exaggeration adapts to the data, two surfaces side by side can look equally domed
      while one has ten times the relief of the other. The current factor is printed beside the slider.
    </Note>

    <H2>Save View and the Gallery</H2>
    <P>
      The two buttons at the top right do different jobs, and the naming invites confusion.
    </P>
    <UL>
      <li>
        <strong>Gallery</strong> opens a grid of thumbnails of the property maps generated in this project.
        It reads the project state, so what you see there is the same list the Maps tab shows.
      </li>
      <li>
        <strong>Save View</strong> writes the grid of the active layer, plus the current unit system and a
        copy of the inputs, into the browser IndexedDB database <Code>ReservoirCalcProDB</Code>. The record
        is named after the layer and the current mode, for example <Code>Structure Surface - SPLIT</Code>.
      </li>
    </UL>
    <Note tone="danger" title="Saved views are local to one browser, and nothing reads them back yet">
      A saved view goes into IndexedDB on the machine and browser you saved it from. It is not part of the
      project, it does not sync, it does not travel to a colleague, and clearing site data destroys it. In
      the current build no screen in the app lists saved views, so once saved a view has no route back into
      the interface. Treat Save View as a snapshot for later rather than as a way to organise work. To keep
      a picture, use fullscreen and a screen capture, or export the map data from the Data Manager.
    </Note>
    <P>
      Generated property maps behave the opposite way. They are held in project state and are written into
      the project snapshot when you save, so they come back with the project on any machine.
    </P>

    <H2>When the panel shows a message instead of a map</H2>
    <Table
      headers={['What you see', 'What it means']}
      rows={[
        ['No Surface Selected', 'No active surface and no generated maps. Import a surface in the Surf tab.'],
        ['Processing Data', 'A surface exists but gridding has not produced a usable grid yet. Large surfaces take a moment. If it persists, the surface may have too few valid points.'],
        ['No surface data to render in 3D', 'The 3D viewer received a grid with fewer than two rows or columns, or with no finite values.'],
        ['No valid grid values to display', 'Every cell in the 2D grid is null. A common cause is an active AOI that misses the surface.'],
        ['Visualization Error with a Retry button', 'A render threw. The error boundary caught it so the rest of the app keeps working. Retry re-mounts the viewer.'],
      ]}
    />
  </Article>
);

export default SurfacePaintingGuide;
