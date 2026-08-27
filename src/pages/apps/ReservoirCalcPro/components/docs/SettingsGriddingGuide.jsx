import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const SettingsGriddingGuide = () => (
  <Article
    title="Settings and Gridding"
    lead="The Settings tab in Workspace Tools holds five preferences, and two of them change your numbers: grid resolution and interpolation method. This article says what each one does, how ordinary kriging is set up here, and what a finer grid buys."
  >
    <H2>Where the settings live</H2>
    <P>
      Open Workspace Tools and pick the Settings tab. Every control writes immediately, which is why there is
      no Save button. The header says Saved automatically.
    </P>
    <UL>
      <li>Values are held in browser local storage under the key <Code>rc_settings_v1</Code>.</li>
      <li>A change broadcasts an event, so every open panel and the calculation path picks it up without a reload. Changes also propagate to other browser tabs.</li>
      <li>These are per browser and per machine preferences. They travel with your browser rather than with a saved project, so a colleague who opens the same project may be running a different grid resolution.</li>
      <li>If local storage is unavailable the app falls back to the defaults and carries on.</li>
    </UL>

    <H2>The five settings</H2>
    <Table
      headers={['Setting', 'Default', 'Options', 'What consumes it']}
      rows={[
        ['Default Unit System', 'Field', 'Field (Oilfield), Metric (SI)', 'Applied to the current workspace at once and used for new projects.'],
        ['Default Map Colour Scale', 'Earth', 'Earth, Viridis, Jet, Hot, Blues', 'The structure surface layer in the 2D and 3D viewers.'],
        ['Grid Resolution', 'Standard (150)', 'Coarse 80, Standard 150, Fine 250', 'Contact-based volumetrics and the hypsometry model used by Monte Carlo.'],
        ['Surface Interpolation', 'Ordinary Kriging', 'Ordinary Kriging (recommended), Inverse Distance (fast)', 'Every scattered-point gridding: maps, the 2D and 3D display, and contact volumetrics.'],
        ['Auto-save after each run', 'Off', 'On, Off', 'Re-saves an already-saved project when a calculation completes.'],
      ]}
    />

    <H3>Default Unit System</H3>
    <P>
      Changing this writes the preference and immediately switches the live workspace, which converts area,
      thickness and the contacts in place. See the Units and Conversions article for the factors.
    </P>

    <H3>Default Map Colour Scale</H3>
    <P>
      Applies to the structure surface layer only. Generated property maps carry the colour scale they were
      created with, defaulting to Viridis, so changing this preference will not repaint an existing HCPV or
      thickness map.
    </P>

    <H3>Auto-save</H3>
    <P>
      When on, a completed deterministic or probabilistic run re-persists the current project. It never
      creates a new project, so a workspace you have never saved stays unsaved. Each results object triggers
      at most one auto-save, and a failure is swallowed silently, so treat the manual Save as authoritative
      before you close the tab.
    </P>

    <H2>Interpolation method</H2>
    <P>
      Both methods take the same input, a cloud of scattered XYZ control points, and produce the same output,
      a regular grid of Z values. They differ in how each grid node is estimated.
    </P>

    <H3>Ordinary Kriging (recommended, and the default)</H3>
    <P>
      For each target node the estimator takes the k nearest control points and solves a small ordinary
      kriging system with a Lagrange multiplier that constrains the weights to sum to one.
    </P>
    <Formula>
      [ G  1 ] [w]   [g0]{'\n'}
      [ 1T 0 ] [u] = [ 1 ]      estimate z = sum( w_i * z_i )
    </Formula>
    <P>Here G holds the variogram values between the chosen control points and g0 those between the target and each point. The setup used here is:</P>
    <Table
      headers={['Parameter', 'Value', 'Consequence']}
      rows={[
        ['Neighbourhood k', '16 nearest points, at least 4, capped at the number of points available', 'A moving neighbourhood, so cost grows with the grid rather than with the survey size.'],
        ['Variogram model', 'Spherical', 'The standard structural model. Exponential and Gaussian exist in the code and no control exposes them.'],
        ['Sill', 'The variance of the Z values, auto-fitted from the data', 'No variogram fitting step for you to run.'],
        ['Range', '0.33 times the diagonal of the point bounding box', 'A third of the survey, which suits most mapped horizons.'],
        ['Nugget', '0', 'The estimator is exact at data locations, so the grid honours every control point.'],
      ]}
    />
    <P>
      Points are indexed into square buckets, roughly six points per bucket, and neighbours are gathered by
      expanding bucket rings until enough are found plus one extra ring to catch a closer diagonal point. If
      the kriging matrix comes out singular, the node falls back to inverse-distance-squared over the same
      neighbours, so a value is always produced.
    </P>
    <Note tone="info" title="Why kriging is the default">
      Inverse distance weights every neighbour purely by distance, which produces bull's-eyes around isolated
      control points and flattens genuine structure between them. Ordinary kriging weights by the spatial
      correlation implied by the variogram, so clustered points share influence and the surface between
      control points behaves like a mapped horizon. On a structural top used for GRV this shows up directly
      in the volume.
    </Note>

    <H3>Inverse Distance (fast)</H3>
    <P>
      A classic IDW estimator with power 2. It gathers neighbours from a 3 by 3 block of buckets around the
      target, using every point when the surface has fewer than about 50 points or when the block yields
      fewer than 5 neighbours. A target within 0.0001 units of a control point returns that point value.
    </P>
    <P>
      Use it while you are iterating on contacts or exploring a case, and switch back to kriging for the
      numbers you intend to report.
    </P>
    <Note tone="warn" title="One engine default differs">
      The contact volumetrics engine falls back to inverse distance when no method is passed, which keeps its
      unit tests deterministic. The app always passes your setting, so what you pick here is what your runs
      use.
    </Note>

    <H2>Grid resolution</H2>
    <P>
      Contact-based volumetrics does not multiply a mean thickness by a bounding box. It drapes a regular
      grid over the top surface and integrates cell by cell.
    </P>
    <Formula>GRV_zone = sum over cells of  overlap(reservoir column, fluid zone window) * cell area</Formula>
    <P>
      The reservoir column at a cell runs from the top surface down to the base surface, or to the top plus a
      constant gross thickness. Each fluid zone is a depth window bounded by the GOC, OWC or GWC. That is why
      moving a contact moves the volume, and why a domed top and a flat top of the same mean depth give
      different answers.
    </P>

    <H3>What the setting controls</H3>
    <Formula>
      nx = clamp(round(resolution), 20, 600){'\n'}
      ny = clamp(round(nx * height / width), 20, 600)      [height, width from the surface bounding box]
    </Formula>
    <Table
      headers={['Option', 'Cells per axis', 'Cells on a square survey', 'Cells on a 3:1 elongate survey']}
      rows={[
        ['Coarse (fast)', '80', 'about 6400', 'about 2100'],
        ['Standard', '150', 'about 22500', 'about 7500'],
        ['Fine (slow)', '250', 'about 62500', 'about 20800'],
      ]}
    />
    <P>
      The count of cells scales with the square of the setting, and each cell costs one interpolator call per
      surface. Under kriging each call solves a system of up to 17 unknowns. Going from Standard to Fine is
      therefore roughly a factor of three more work, and it is done twice when you use a top and a base
      surface.
    </P>

    <H3>What a finer grid buys</H3>
    <UL>
      <li>Sharper resolution of the contact intersection. The subtle errors from a coarse grid live at the edge of the accumulation, where cells are only partly within a fluid window.</li>
      <li>A better-resolved AOI edge. Cell coverage against the polygon is estimated by a corner and centre test, then a 4 by 4 sub-sample for partly covered cells, so a finer grid reduces the boundary term further.</li>
      <li>Smoother hull masking at the edge of the data.</li>
    </UL>
    <P>
      A pragmatic workflow is Coarse while you sensitivity-test contacts, Standard for routine cases, and Fine
      for the final number and for anything going into a report.
    </P>
    <Note tone="info" title="Where this setting does not apply">
      The 2D and 3D display grid is fixed at 80 cells across, and property map generation uses 100 cells
      across, with the other axis derived from the aspect ratio. Both of those follow your interpolation
      method and ignore the resolution setting. It is the volumetric numbers that this setting moves.
    </Note>

    <H2>Hull masking</H2>
    <P>
      A grid is built over the rectangular bounding box of the control points, and real surveys are rarely
      rectangular. Cells that sit far from any control point would be extrapolation, so they are dropped.
    </P>
    <Formula>
      sampleSpacing = sqrt(width * height / pointCount){'\n'}
      a cell is dropped when the distance to its nearest control point exceeds 2.0 * sampleSpacing
    </Formula>
    <P>
      This is why a computed grid does not reach the corners of the bounding box, and why the productive area
      reported by a contact run can be smaller than the estimated area shown on the imported surface. The
      results carry the count of masked cells alongside the count of cells clipped away by an active AOI.
    </P>
    <Note tone="warn" title="A sparse point set masks more">
      Sample spacing is derived from the point count, so a surface downsampled to a few hundred points has a
      wider spacing and a more generous hull radius, while a dense grid masks tightly. If a contact run
      reports far less area than you expect, check the point count of the surface first.
    </Note>

    <H2>Grid caching</H2>
    <P>
      Gridding a surface with kriging is worth doing once. Generated grids are memoised in memory, keyed by
      surface id, method, grid size and point count, so switching display layers or re-rendering a panel does
      not re-grid.
    </P>
    <UL>
      <li>The cache holds 24 grids and is cleared wholesale when it fills.</li>
      <li>It lives in memory only. The point set is the source of truth, so grids are never written into a saved project and the cache is empty again after a reload.</li>
      <li>Changing the interpolation method produces a different key, so the previous grid stays cached and a switch back is instant.</li>
    </UL>

    <H2>Quick reference</H2>
    <OL>
      <li>Reporting a volume: Ordinary Kriging, Fine, and check the masked and clipped cell counts in the results.</li>
      <li>Sensitivity work on contacts: Ordinary Kriging, Coarse, then re-run the chosen case at Fine.</li>
      <li>A first look at a new surface: Inverse Distance, Coarse.</li>
      <li>Handing a project to a colleague: tell them your resolution and method, since those preferences stay in your browser.</li>
    </OL>
  </Article>
);

export default SettingsGriddingGuide;
