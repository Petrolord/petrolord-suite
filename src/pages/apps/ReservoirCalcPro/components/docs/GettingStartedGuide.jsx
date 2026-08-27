import React from 'react';
import { Article, H2, P, UL, OL, Code, Note, Table } from './DocParts';

const GettingStartedGuide = () => (
  <Article
    title="Getting Started"
    lead="ReservoirCalc Pro is the Suite's volumetrics workspace. It runs deterministic in-place volumes, Monte Carlo probabilistic studies, and contact-based structural volumetrics integrated cell by cell on an imported top surface."
  >
    <H2>What the app actually does</H2>
    <P>
      Three calculation paths share one workspace, one set of inputs and one project record.
    </P>
    <UL>
      <li>
        <strong>Deterministic volumetrics.</strong> A single case producing STOOIP, GIIP, recoverable
        volumes, gross rock volume, net volume, pore volume, hydrocarbon pore volume and productive area.
      </li>
      <li>
        <strong>Probabilistic volumetrics.</strong> A Monte Carlo study over distributions you define,
        returning P90, P50, P10, mean and a tornado of variance contributions. It runs 1,000 to 50,000
        iterations, 10,000 by default, with correlated sampling.
      </li>
      <li>
        <strong>Contact-based structural volumetrics.</strong> When you work from an imported top surface,
        gross rock volume is integrated over a regular grid draped on that surface against the OWC, GOC or
        GWC. Moving a contact moves the volume, and a domed top gives a different answer from a flat top at
        the same mean depth.
      </li>
    </UL>

    <H2>Where the app lives</H2>
    <P>
      ReservoirCalc Pro sits in the Geoscience hub. Look for it there rather than under Reservoir. The header breadcrumb reads
      Geoscience Hub then ReservoirCalc Pro, and both the back arrow and the breadcrumb return you to{' '}
      <Code>/dashboard/geoscience</Code>.
    </P>
    <Table
      headers={['Path', 'What it is']}
      rows={[
        ['/dashboard/apps/geoscience/reservoircalc-pro', 'The current route. Use this one.'],
        ['/dashboard/apps/geoscience/quickvol', 'Legacy QuickVol slug, kept as an alias that renders the same app.'],
        ['/dashboard/apps/reservoir/uncertainty-analysis', 'Redirects to the current route.'],
      ]}
    />

    <H2>The workspace in one look</H2>
    <UL>
      <li><strong>Left panel (320px, collapsible).</strong> Project Settings plus five tabs: Geo, Fluid, Surf, AOI, Maps.</li>
      <li><strong>Centre panel.</strong> Visualization. 2D contour map, 3D surface, or Split view, which is the default.</li>
      <li><strong>Right panel (384px, collapsible).</strong> Headline KPI cards and the button that opens the full results modal.</li>
    </UL>
    <P>
      Both side panels remember whether they were open. Their state is stored in browser localStorage under{' '}
      <Code>rc_showLeft</Code> and <Code>rc_showRight</Code>.
    </P>

    <H2>Deterministic runs calculate themselves</H2>
    <Note tone="warn" title="There is no Calculate step">
      In deterministic mode the app recalculates automatically about 500 ms after you stop changing inputs.
      The debounce also fires when you change unit system, calculation mode or input method. The blue button
      at the bottom of the right panel is labelled <strong>Recalculate</strong> and only forces the same run
      again, which is useful after changing a setting such as grid resolution that the debounce does not watch.
    </Note>
    <P>
      Probabilistic mode is different. Nothing runs until you press <strong>Run Monte Carlo</strong> on step 3
      of the Probabilistic Analysis panel.
    </P>

    <H2>Your first run in five steps</H2>
    <OL>
      <li>
        <strong>Open the app.</strong> Go to Geoscience Hub and open ReservoirCalc Pro. The workspace opens on
        a complete default oil case, so the right panel already shows a number before you touch anything.
      </li>
      <li>
        <strong>Set the frame of the case.</strong> In the left panel open the <strong>Project Settings</strong>{' '}
        card and set System (Field or Metric), Mode (Deterministic), fluid type (Oil, Gas or Oil + Gas) and
        Input Method (simple, hybrid or surfaces). Leave Input Method on <Code>simple</Code> for a first pass,
        because it needs no surface data.
      </li>
      <li>
        <strong>Enter geometry and petrophysics on the Geo tab.</strong> For <Code>simple</Code> that is Area and
        Gross Thickness, then Net-to-Gross, Porosity, Water Saturation and Permeability under Petrophysics, then
        Initial Pressure and Temperature under Reservoir Conditions. Thickness is the gross interval. Net rock is
        derived as gross times NTG, so entering net pay with an NTG below 1 applies the net cut twice.
      </li>
      <li>
        <strong>Enter fluid properties on the Fluid tab.</strong> For oil set Oil Gravity (API), Recovery Factor
        and Bo. For gas set Gas Gravity, Recovery Factor and Bg, picking the Bg unit that matches your PVT report.
        Quick Presets write Bo or Bg straight into the inputs.
      </li>
      <li>
        <strong>Read and save.</strong> The right panel already holds the answer. Press{' '}
        <strong>View Full Results</strong> for the complete breakdown, then press the green{' '}
        <strong>Save</strong> button in the header, give the project a name and a description, and save. You must
        be signed in.
      </li>
    </OL>

    <H2>The default case you start from</H2>
    <P>
      A fresh workspace is preloaded with a runnable oil case in field units. Replace these values with your own.
    </P>
    <Table
      headers={['Input', 'Default', 'Input', 'Default']}
      rows={[
        ['Area', '5,000 acres', 'Oil gravity', '35 API'],
        ['Gross thickness', '50 ft', 'Gas gravity', '0.7 (air = 1)'],
        ['Net-to-gross', '1.0', 'Bo', '1.2 rb/stb'],
        ['Porosity', '0.20', 'Bg', '0.005 rcf/scf'],
        ['Water saturation', '0.30', 'Oil recovery factor', '25 %'],
        ['Permeability', '100 mD', 'Gas recovery factor', '70 %'],
        ['Initial pressure', '3,500 psi', 'OWC', '-8,000'],
        ['Temperature', '180 F', 'GOC', '-7,000'],
      ]}
    />
    <Note tone="info" title="Depth convention">
      The Geo tab states the convention it assumes: the Z axis is negative downwards, so -8,000 ft is deeper
      than -7,000 ft. Imported surfaces carry their own convention flag, and the contact engine normalises
      everything internally to depth increasing downward before it does any interval arithmetic.
    </Note>

    <H2>Moving on to a structural case</H2>
    <OL>
      <li>Open the <strong>Surf</strong> tab and import a top surface from CSV or XYZ.</li>
      <li>Press <strong>Set Top</strong> on that surface. The first surface you import is assigned as Top automatically.</li>
      <li>
        Switch Input Method to <Code>hybrid</Code> (top surface plus a constant gross thickness) or{' '}
        <Code>surfaces</Code> (top plus base surface, so thickness is no longer typed in).
      </li>
      <li>Enter the OWC and, for an oil and gas case, the GOC in the Fluid Contacts card on the Geo tab.</li>
      <li>Optionally draw an AOI on the 2D map from the AOI tab and set it Active, which clips the integration.</li>
    </OL>
    <P>
      Contacts only bite in <Code>hybrid</Code> and <Code>surfaces</Code>. The <Code>simple</Code> method has no
      depth reference and ignores them. See the Input Methods article for the full comparison.
    </P>

    <H2>Running a probabilistic study</H2>
    <OL>
      <li>Get a deterministic case running first. The study centres its distributions on that base case.</li>
      <li>Set Mode to Probabilistic. The left panel is replaced by a Simulation Setup card and the three step Probabilistic Analysis panel.</li>
      <li>Step 1 Distributions: pick Triangular, Normal, Lognormal or Uniform per variable and set its parameters.</li>
      <li>Step 2 Settings: Base-Case Consistency Mode (on by default, advisory only) and iteration count (1k, 5k, 10k, 50k).</li>
      <li>Step 3 Simulation: press <strong>Run Monte Carlo</strong>. Results land in the right panel, and <strong>View Full Analysis</strong> opens the histogram, the CDF and the tornado.</li>
    </OL>

    <H2>Keyboard and input behaviour</H2>
    <P>
      The app binds exactly one keyboard shortcut: <Code>Ctrl+B</Code> toggles the left inputs panel, the same
      way an IDE toggles its sidebar. There is no shortcut for the right panel, which has its own toggle button
      at the far right of the header.
    </P>
    <Table
      headers={['Field', 'When the value commits']}
      rows={[
        ['OWC, GOC and GWC depths', 'On Enter, which also blurs the field, or on blur.'],
        ['Reservoir name (Add or Rename dialog)', 'On Enter, or with the Add or Rename button.'],
        ['Surface name', 'Typed in the Surface Import dialog and committed with the Import button.'],
        ['All other numeric fields', 'As you type. Clearing a field commits an empty value rather than snapping to zero.'],
      ]}
    />

    <H2>Where to go next</H2>
    <UL>
      <li><strong>Input Methods</strong> for what simple, hybrid and surfaces each require and compute.</li>
      <li><strong>Interface Guide</strong> for every control in the three panes and the two sheets.</li>
      <li><strong>Projects</strong> for saving, versioning, JSON export and import.</li>
      <li><strong>Multiple Reservoirs</strong> for holding several tanks or several interpretations in one project.</li>
    </UL>
  </Article>
);

export default GettingStartedGuide;
