import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const UIGuide = () => (
  <Article
    title="Interface Guide"
    lead="ReservoirCalc Pro is a three pane workspace under a single header bar: inputs on the left, visualization in the centre, results on the right, with two slide-over sheets for projects and workspace tools."
  >
    <H2>Shell layout</H2>
    <Table
      headers={['Region', 'Width', 'Contents', 'Collapsible']}
      rows={[
        ['Header', 'Full width, 48px tall', 'Navigation, project identity, reservoir switcher, Projects, Tools, Save, Help, panel toggles', 'No'],
        ['Left panel', '320px (w-80)', 'Project Settings card plus the Geo / Fluid / Surf / AOI / Maps tabs', 'Yes'],
        ['Centre panel', 'Fills remaining width', 'Visualization: 2D map, 3D surface, or both side by side', 'No'],
        ['Right panel', '384px (w-96)', 'KPI cards, error banner, Recalculate, full results modal', 'Yes'],
      ]}
    />
    <P>
      Both side panels persist their open state to browser localStorage under <Code>rc_showLeft</Code> and{' '}
      <Code>rc_showRight</Code>, so the layout you leave is the layout you return to. Each pane is wrapped in
      its own error boundary, so a failure inside one panel does not take down the other two.
    </P>
    <Note tone="info" title="The only keyboard shortcut">
      <Code>Ctrl+B</Code> toggles the left inputs panel. Nothing else is bound. The right panel has a toggle
      button at the far right of the header.
    </Note>

    <H2>Header bar, left to right</H2>
    <UL>
      <li><strong>Back arrow.</strong> Returns to <Code>/dashboard/geoscience</Code>. Its tooltip reads Back to Geoscience Analytics Hub.</li>
      <li><strong>Breadcrumb.</strong> Geoscience Hub then ReservoirCalc Pro. The Geoscience Hub segment is clickable and goes to the same place.</li>
      <li><strong>Left panel toggle.</strong> The sidebar icon that collapses or expands the inputs panel, the same action as Ctrl+B.</li>
      <li>
        <strong>Project name and Modified badge.</strong> The saved project name, or <em>Unsaved Workspace</em>{' '}
        when nothing has been saved yet. The amber <strong>Modified</strong> badge appears whenever the workspace
        holds changes that have not been written to the project record.
      </li>
      <li><strong>ReservoirSwitcher.</strong> Layers icon, a reservoir dropdown, then add, rename and delete buttons. See the Multiple Reservoirs article.</li>
      <li><strong>Projects.</strong> Opens the Project Manager as a 400px sheet from the left.</li>
      <li><strong>Tools.</strong> Opens the Workspace Tools hub as a sheet from the right, up to 720px wide.</li>
      <li><strong>Save.</strong> Green button. Opens the Save Project dialog.</li>
      <li><strong>Help.</strong> The question mark icon that opens this documentation.</li>
      <li><strong>Right panel toggle.</strong> Collapses or expands the results panel.</li>
    </UL>

    <H3>Save Project dialog</H3>
    <P>
      Two fields, Project Name and Description, prefilled from the current project metadata or from the active
      reservoir name. The name is required. Failures are shown inline in a red box inside the dialog as well as
      in a toast, and the dialog stays open so the message is not lost behind the overlay. Saving while signed
      out is refused with a message asking you to sign in.
    </P>

    <H2>Left panel: inputs</H2>

    <H3>Project Settings card</H3>
    <P>
      A collapsible card pinned above the tabs, open by default. It holds the four choices that frame the whole case.
    </P>
    <Table
      headers={['Control', 'Options', 'Effect']}
      rows={[
        ['System', 'Field, Metric', 'Switches unit system and converts the stored case so the physical reservoir is preserved. Display units reset to that system defaults.'],
        ['Mode', 'Deterministic, Probabilistic', 'Deterministic auto-runs on a debounce. Probabilistic replaces this whole panel with the simulation workflow.'],
        ['Fluid type', 'Oil, Gas, Oil + Gas', 'Controls which contacts, fluid properties and result KPIs appear.'],
        ['Input Method', 'simple, hybrid, surfaces', 'Chooses the analytic path or the contact grid integration path.'],
      ]}
    />

    <H3>The five tabs</H3>
    <P>
      The tab strip is a five column grid. The AOI tab is labelled with a scan icon rather than a word, the other
      four are text.
    </P>
    <Table
      headers={['Tab', 'Label', 'What is in it']}
      rows={[
        ['Geo', 'Geo', 'Depth convention banner, Area (simple only) or top surface status, Gross Thickness (hidden in the surfaces method), Fluid Contacts, Petrophysics, Reservoir Conditions.'],
        ['Fluid', 'Fluid', 'Quick Presets, oil properties, gas properties, gas cap fraction, and the Bo calculator.'],
        ['Surf', 'Surf', 'Surfaces Library: import, point counts, Z range, Set Top, Set Base, delete.'],
        ['AOI', 'Scan icon', 'Polygon drawing tools and the list of defined areas.'],
        ['Maps', 'Maps', 'Property map generator and the maps already generated.'],
      ]}
    />

    <H3>Geo tab detail</H3>
    <UL>
      <li><strong>Convention banner.</strong> States that the Z axis is negative downwards, so -8,000 ft is deeper than -7,000 ft.</li>
      <li><strong>Area.</strong> Shown only for the simple method, with a unit picker offering acres, km2, ha, m2, ft2 and mi2.</li>
      <li><strong>Top surface status.</strong> Replaces Area for hybrid and surfaces, showing a green Top Surface Selected line or a red No Top Surface line.</li>
      <li><strong>Gross Thickness.</strong> Shown for simple and hybrid, hidden for surfaces where the base surface defines the interval.</li>
      <li><strong>Fluid Contacts.</strong> OWC for oil cases, GOC for oil and gas, GWC for pure gas. Enter commits and blurs the field, and blur alone also commits.</li>
      <li><strong>Petrophysics.</strong> Net-to-Gross, Porosity, Water Saturation, Permeability in mD.</li>
      <li><strong>Reservoir Conditions.</strong> Initial Pressure (psi, bar, kPa, MPa) and Temperature (F, C, K).</li>
    </UL>

    <H3>Fluid tab detail</H3>
    <UL>
      <li><strong>Quick Presets.</strong> Preset buttons for the active fluid type that write Bo or Bg into the inputs.</li>
      <li><strong>Oil Properties.</strong> Oil Gravity in API, Recovery Factor in percent, and Bo in rb/stb or rm3/sm3. The calculator icon opens a Bo estimator taking API, gas gravity, solution GOR and temperature.</li>
      <li><strong>Gas Properties.</strong> Gas Gravity, gas Recovery Factor, and Bg with a unit picker offering rcf/scf, rb/scf and rb/Mscf.</li>
      <li><strong>Gas Cap Fraction of GRV.</strong> Appears only for Oil + Gas on the simple method. Structural methods take the split from the GOC instead.</li>
    </UL>

    <H3>Probabilistic mode replaces this panel</H3>
    <P>
      Setting Mode to Probabilistic swaps the whole left panel for a compact <strong>Simulation Setup</strong> card
      (System, Mode and fluid type only) above the <strong>Probabilistic Analysis</strong> panel. That panel is a
      three step wizard with a progress bar and Back and Next controls at the bottom.
    </P>
    <OL>
      <li><strong>Distributions.</strong> One editor per variable. Each editor offers Triangular (P90, P50, P10), Normal or Lognormal (mean, standard deviation) and Uniform (min, max), shows the deterministic base value, and has a revert button that snaps the central value back to that base. Which variables appear depends on the input method: structural methods expose the contacts plus a GRV Factor, the simple method exposes Area and Gross Thickness.</li>
      <li><strong>Settings.</strong> Base-Case Consistency Mode toggle (on by default) and iteration count buttons for 1k, 5k, 10k and 50k, defaulting to 10k.</li>
      <li><strong>Simulation.</strong> The <strong>Run Monte Carlo</strong> button. This is the only place a probabilistic run starts.</li>
    </OL>
    <Note tone="info" title="Consistency mode is advisory">
      With consistency mode on, distribution central values are recentred on the deterministic base case and a
      drift of more than 5 percent is flagged in red. It never blocks a run. A deliberately shifted distribution
      is legitimate, so the app warns with a toast and proceeds.
    </Note>

    <H2>Centre panel: Visualization</H2>
    <P>
      The centre header carries the panel title, a chip with the active surface name, the view mode group, a
      fullscreen button, then on the right the layer selector, Gallery and Save View.
    </P>
    <Table
      headers={['Control', 'Behaviour']}
      rows={[
        ['2D', 'Contour map only. AOI polygons are drawn here.'],
        ['Split', 'The default. 2D contour map on the left, 3D surface on the right. The 2D half carries a draw AOIs here label when the structure layer is active.'],
        ['3D', 'Interactive surface with the fluid contacts drawn in, for the structure layer only.'],
        ['Fullscreen', 'Expands the visualization container to the whole screen.'],
        ['Layer selector', 'Appears once there is more than one layer. Lists the structure surface first, then every generated property map.'],
        ['Gallery', 'Grid of the property maps held in this project, each with a heatmap thumbnail and a delete button.'],
        ['Save View', 'Saves the current grid as a named view. Disabled while there is no grid.'],
      ]}
    />
    <P>
      With no surface imported and no maps generated the panel shows a No Surface Selected placeholder. Once a
      surface exists but its grid is still being built, it shows a Processing Data message instead.
    </P>
    <Note tone="warn" title="Saved views are browser local">
      Save View writes to an IndexedDB database in your browser called <Code>ReservoirCalcProDB</Code>. Those
      views are not part of the project record, they do not travel with a JSON export, and they do not sync to
      another machine or another browser. The Gallery button lists the generated property maps held in the
      project, which is a separate store.
    </Note>
    <P>
      AOI drawing is enabled only while the structure surface layer is active, because AOIs are stored in surface
      world coordinates. Property map layers render as a plain height field with no contacts.
    </P>

    <H2>Right panel: results</H2>
    <P>
      While a calculation is in flight the whole panel is replaced by a Processing Data spinner. Any engine error
      is shown as a red banner at the top of the panel.
    </P>
    <H3>Deterministic view</H3>
    <UL>
      <li>Heading <strong>DETERMINISTIC</strong> with the active reservoir name beneath it, or Single Scenario when unnamed.</li>
      <li>A headline KPI card showing STOOIP in MM STB, or GIIP in B scf for a gas case.</li>
      <li>Quick stats: Bulk Vol, Net Vol and HC Area in acre-ft and acres, or m3 and km2 in metric.</li>
      <li><strong>View Full Results</strong>, which opens the results modal with the full breakdown, the summary table and the input echo.</li>
      <li><strong>Recalculate</strong>, the blue button at the bottom. Deterministic runs already fire automatically about 500 ms after the last input change, so this button is a manual re-run rather than a required step.</li>
    </UL>
    <H3>Probabilistic view</H3>
    <UL>
      <li>Heading <strong>SIMULATION RESULTS</strong> with a Monte Carlo Analysis subtitle.</li>
      <li>A P50 card, then P90 (Proven) and P10 (Possible) cards side by side, then Mean and Range.</li>
      <li><strong>View Full Analysis</strong>, which opens the histogram, cumulative curve and tornado chart.</li>
      <li>Before a run it shows a prompt to configure distributions and run the simulation.</li>
    </UL>

    <H2>Projects sheet</H2>
    <P>
      Opened from the header Projects button. The Project Manager lists your saved projects with a search box and
      a sort control (Newest First, Oldest First, Name A to Z), each row carrying a version badge. Selecting a
      project shows its detail page with description, fluid type, surface and polygon counts, and the actions
      Delete, Export JSON and Load Project. The header of the sheet also carries Import and New. New warns before
      discarding unsaved changes.
    </P>

    <H2>Workspace Tools sheet</H2>
    <P>
      Opened from the header Tools button. Five tabs across the top of the sheet.
    </P>
    <Table
      headers={['Tab', 'What it does']}
      rows={[
        ['Settings', 'Default unit system, default map colour scale, grid resolution, surface interpolation method, and auto-save after each run. Every control writes immediately, there is no save button.'],
        ['Prospect Risking', 'Chance of success factors and risked volumes, fed by the latest Monte Carlo result as the unrisked distribution, backed by the prospects registry.'],
        ['Audit Trail', 'Chronological log of real actions in this workspace, newest first, capped at 200 entries and saved with the project.'],
        ['Data Manager', 'Inventory of surfaces, AOIs and property maps with delete and XYZ export, plus the fluid property library with Apply buttons.'],
        ['Collaboration', 'Handoff and sharing view built on the project record and audit trail.'],
      ]}
    />
    <H3>Settings values worth knowing</H3>
    <Table
      headers={['Setting', 'Options', 'Default']}
      rows={[
        ['Default Unit System', 'Field (Oilfield), Metric (SI)', 'Field'],
        ['Default Map Colour Scale', 'Earth, Viridis, Jet, Hot, Blues', 'Earth'],
        ['Grid Resolution', 'Coarse 80, Standard 150, Fine 250 cells per axis', 'Standard 150'],
        ['Surface Interpolation', 'Ordinary Kriging, Inverse Distance', 'Ordinary Kriging'],
        ['Auto-save after each run', 'On, Off', 'Off'],
      ]}
    />
    <P>
      These preferences live in browser localStorage under <Code>rc_settings_v1</Code> and are broadcast to every
      open component, so a change takes effect without a reload. Grid resolution and interpolation feed the
      contact volumetrics engine, the hypsometry build used by Monte Carlo, the property map generator and the
      on-the-fly gridding behind the viewers.
    </P>

    <H2>How values commit</H2>
    <Table
      headers={['Field', 'Commit behaviour']}
      rows={[
        ['OWC, GOC, GWC', 'Enter commits the value and blurs the field. Blurring without Enter also commits.'],
        ['Reservoir name in Add or Rename', 'Enter confirms the dialog. The Add or Rename button does the same.'],
        ['Surface name', 'Typed in the Surface Import dialog, committed when you press Import.'],
        ['AOI name', 'Typed in the Save Polygon dialog, committed with Save Area.'],
        ['All other numeric inputs', 'Committed on each keystroke. An empty or partial entry commits an empty value, so a cleared box does not snap back to zero while you type.'],
      ]}
    />
  </Article>
);

export default UIGuide;
