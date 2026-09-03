// Petrophysics Studio in-app help guide (written after the PS1-PS10 upgrade
// program, 2026-09-02). Full-page route on the shared HelpGuideLayout shell,
// the D-series standard for workstation apps.
//
// Every label, option and default quoted here was read from the component
// that renders it (ParameterPanel FIELDS, layoutSchema built-ins, the
// dialogs, the engines' DEFAULT_PARAMS and METHOD_CITATIONS). The guide
// describes what the app does today; a feature that exists only in engine
// code with no control in the app is deliberately not mentioned.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.

import React from 'react';
import { CURVE_ALIASES } from './services/curveMap';
import {
  BookOpen, Zap, Database, Layers, LayoutTemplate, Sliders, Rows, Save,
  ScatterChart, BarChart3, Wand2, Droplets, Columns, UploadCloud, FileDown,
  Ruler, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const APP_PATH = '/dashboard/apps/geoscience/petrophysics-studio';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What the Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (15 min)' },
  { id: 'wells', icon: Database, title: 'Wells and curves' },
  { id: 'tracks', icon: Layers, title: 'The track view' },
  { id: 'layouts', icon: LayoutTemplate, title: 'Track layouts' },
  { id: 'parameters', icon: Sliders, title: 'Parameters and methods' },
  { id: 'zones', icon: Rows, title: 'Zones and net pay' },
  { id: 'interpretations', icon: Save, title: 'Interpretations' },
  { id: 'crossplots', icon: ScatterChart, title: 'Crossplots and Split view' },
  { id: 'histograms', icon: BarChart3, title: 'Histograms and cutoffs' },
  { id: 'conditioning', icon: Wand2, title: 'Conditioning curves' },
  { id: 'rwtools', icon: Droplets, title: 'Rw quicklook tools' },
  { id: 'field', icon: Columns, title: 'Field view' },
  { id: 'publish', icon: UploadCloud, title: 'Publish, batch, digitize' },
  { id: 'export', icon: FileDown, title: 'Export deliverables' },
  { id: 'units', icon: Ruler, title: 'Units, outputs, provenance' },
  { id: 'validation', icon: BadgeCheck, title: 'Validation basis' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

const ALIAS_USE = {
  DEPT: 'Depth reference (metres MD). Required.',
  GR: 'Vsh, the clay shading, facies, normalization',
  RHOB: 'Density porosity, density-neutron combination and crossplot',
  NPHI: 'Neutron-density combination and crossplot',
  DT: 'Sonic porosity',
  RT: 'Water saturation, Pickett and Hingle plots',
  CAL: 'Bad-hole flagging in Condition (never in the pipeline math)',
  DRHO: 'Bad-hole flagging in Condition',
  PEF: 'Recognised for charting; not consumed by the pipeline',
};

const PetrophysicsHelpGuide = () => (
  <HelpGuideShell
    title="Petrophysics Studio Help Guide"
    subtitle="Deterministic log analysis on the shared well registry"
    metaDescription="How to use Petrophysics Studio: wells and curve mapping, the track view and layouts, every Vsh, porosity, Sw and permeability method with its defaults, zones and per-zone overrides, interpretations, crossplots, histograms, conditioning, field view, publishing and exports."
    backTo={APP_PATH}
    backLabel="Back to Petrophysics Studio"
    sections={sections}
  >
    {/* ------------------------------------------------------------------ */}
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What the Studio is</SectionHeading>
      <Para>
        Petrophysics Studio is the Suite&apos;s log-analysis workstation. It reads wells and curves
        from the shared well registry, computes shale volume, porosity, water saturation,
        permeability and net pay from a parameter set you control, and writes the results back to
        the same registry so Well Correlation, Mapping and volumetrics can use them. Nothing is
        computed on a server: the engine runs in your browser, closed form per sample, and a change
        to any parameter recomputes the whole well immediately.
      </Para>
      <Para>
        The engine is deterministic and validated. Every method is a published equation with a
        citation, and every one of them is checked against an independent oracle to one part in a
        trillion before it ships. You will see those citations again in the PDF report and in the
        Validation section of this guide.
      </Para>

      <SubHeading>The workspace</SubHeading>
      <Table
        headers={['Area', 'What lives there']}
        rows={[
          ['Ribbon (top)', 'The view switch (Tracks, Crossplots, Histograms, Split, Field), the interpretation picker, and the action buttons: Publish, Digitize, Condition, Rw tools, Export, Batch, Save. On the right, Help opens this guide and the Parameters & zones button shows or hides the dock.'],
          ['Explorer (left)', 'Registry wells with a private or organization badge. The selected well expands to show its curve inventory: which registry mnemonic feeds each pipeline input, and a picker where more than one curve could.'],
          ['Center', 'Whichever view is selected in the ribbon. Tracks is the default and the only view that can export a PNG. Crossplots, Histograms and Split need a loaded well; Field does not.'],
          ['Dock (right)', 'Three stacked panels: the parameter panel, the Track layout builder and the zone manager.'],
          ['Status bar (bottom)', 'One line of feedback for the last action (curves loaded, parameters applied, fit results, publish counts, errors), an amber missing-inputs note, the zone overlap warning, the well name with its sample count, and the two axis toggles: axis: MD or TVD (only on surveyed wells) and depth: m or ft.'],
        ]}
      />
      <Para>
        The three panels are separated by drag handles. Widths you set are remembered between
        sessions.
      </Para>
      <Callout tone="info" title="Where this app sits in the Geoscience module">
        Curves enter the registry only through Well Data Manager (LAS 1.2, 2.0 and 3.0), and every well name in your
        registry is unique (a second well with the same name is refused, whatever its case or
        spacing), so the Explorer list is never ambiguous. Tops are read here but edited in
        Well Correlation. Zones are this app&apos;s own artifact. Computed curves and zone summaries
        published from here are ordinary registry logs with provenance, visible to every other app.
      </Callout>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start (15 min)</SectionHeading>
      <Step n={1} title="Pick a well">
        Click a well in the explorer. The status bar reports how many curves loaded, and the
        inventory under the well shows a green tick beside every pipeline input it could map
        (DEPT, GR, RHOB, NPHI, DT, RT) and a dash for anything missing. If the well has no depth
        curve you get an empty state that points you to Well Data Manager.
      </Step>
      <Step n={2} title="Read the default tracks">
        The Standard triple combo template opens: GR with clay shading, RT on a log scale, the
        density-neutron overlay with gas and shale crossover fills, porosity with the cutoff
        shading, Vsh, Sw, Pay and a Facies strip. Wheel zooms, drag pans, double-click returns to
        the full well.
      </Step>
      <Step n={3} title="Set the clean and clay lines">
        Switch to Histograms, choose GR, and drag the clean and clay lines to the sand and shale
        modes. Releasing a line writes GR clean and GR clay into the parameter set. You can also
        type them in the dock.
      </Step>
      <Step n={4} title="Choose porosity and matrix">
        In the Porosity section pick the source (density, sonic or nd) and set the matrix and
        fluid values for the rock you expect. The Density-Neutron crossplot shows sandstone,
        limestone and dolomite lines to help you decide.
      </Step>
      <Step n={5} title="Get Rw from the water leg">
        Open Crossplots, select Pickett, enter the top and base of a water-bearing interval in
        metres MD, and click Fit water line. Apply writes m and Rw back. Hingle does the same for
        Rw alone. Rw tools converts a value you already know to formation temperature.
      </Step>
      <Step n={6} title="Apply and check">
        Every edit in the dock is a draft until you press Apply parameters. The tracks, zone
        summaries and crossplots all recompute at once.
      </Step>
      <Step n={7} title="Add zones">
        In Zones, enter a name, top and base in metres MD and press Add. Each card reports net,
        gross, NTG and the net-weighted averages at the current cutoffs. Drag a zone edge on the
        tracks to adjust it.
      </Step>
      <Step n={8} title="Refine per zone if needed">
        Change the Scope selector at the top of the parameter panel from Global to a zone, edit
        only the fields that differ, and press Apply overrides. Dots mark overridden fields.
      </Step>
      <Step n={9} title="Save the interpretation">
        Press Save, or use the interpretation picker to Save as under a new name. Parameters,
        zone overrides, layouts, facies and crossplot settings all travel with it.
      </Step>
      <Step n={10} title="Publish and export">
        Publish writes VSH, PHIE, SW, PAY (and KPERM when permeability is on) to the registry
        with full provenance. Export gives you curves CSV, zone CSV, LAS 2.0, the track PNG and a
        PDF summary report.
      </Step>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="wells">
      <SectionHeading icon={Database}>Wells and curves</SectionHeading>
      <Para>
        The explorer header reads <Code>Registry wells</Code> with a count. Each row carries a badge:
        a lock for a private well, a building for one shared with your organization. Hover the badge
        for the exact meaning. Wells shared with you by someone else are read-only here: you can
        interpret them and export, but Publish, Digitize, Condition and zone edits are disabled.
      </Para>
      <SubHeading>How curves are mapped to pipeline inputs</SubHeading>
      <Para>
        The pipeline consumes six standard inputs. The Studio maps registry mnemonics to them by
        base name (a <Code>:2</Code> duplicate suffix is ignored) using this alias table, first
        match wins. The table is read from the live alias list, so it is always current:
      </Para>
      <Table
        headers={['Input', 'Accepted mnemonics', 'Used for']}
        rows={Object.entries(CURVE_ALIASES).map(([key, aliases]) => [key, aliases.join(', '), ALIAS_USE[key] || ''])}
      />
      <Para>
        Service companies name the same measurement many ways, and no list is complete. Two doors
        cover the rest. First, a curve whose LAS description names the measurement (say
        &quot;deep laterolog resistivity&quot; under an unfamiliar mnemonic) is offered in the
        explorer picker as a candidate; you bind it to the input explicitly and it is never
        substituted silently. Second, any curve at all can be drawn: in Track layout the curve
        address list includes every mnemonic in the selected well as <Code>log:MNEMONIC</Code>, so
        five resistivity depths can sit together on one track, or a tension or SP curve can have
        its own. Such curves draw on wells that carry that mnemonic and are skipped elsewhere,
        like any other missing curve. The explorer lists the curves no input took under
        &quot;Also in this well&quot;.
      </Para>
      <Para>
        Outputs only appear when their inputs exist. A well without RT still gets VSH and PHIE but
        no SW or PAY, and the zone cards say <Code>no computed curves yet</Code> until porosity,
        Vsh and Sw all exist.
      </Para>
      <SubHeading>The explicit input picker</SubHeading>
      <Para>
        When more than one curve could serve an input, the inventory row becomes a dropdown. This is
        how conditioned curves are used: saving <Code>GR_CND</Code> from the Condition dialog does
        not change what the pipeline reads until you pick it here. A conditioned curve is never
        substituted silently.
      </Para>
      <Callout tone="warn" title="No depth curve">
        A well whose logs carry no DEPT, DEPTH or MD curve cannot be interpreted. The center shows
        an empty state instead of tracks. Import an LAS file with a depth curve in Well Data
        Manager and the well opens here ready to go.
      </Callout>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="tracks">
      <SectionHeading icon={Layers}>The track view</SectionHeading>
      <Para>
        Tracks is a single canvas with a depth axis on the left and one column per track. The
        footer reminds you of the three gestures: <Code>wheel: zoom · drag: pan · double-click:
        full well</Code>. Moving the mouse shows a crosshair with the depth and every curve value
        at that depth in each track header.
      </Para>
      <SubHeading>What the default template draws</SubHeading>
      <Table
        headers={['Track', 'Curves and scale', 'Fill']}
        rows={[
          ['GR (API)', 'GR, 0 to 150 linear', 'Threshold fill above GR clean (clay shading)'],
          ['RT (ohm·m)', 'RT, 0.2 to 2000 log', 'none'],
          ['Density-Neutron', 'RHOB 1.95 to 2.95 with NPHI overlaid reversed and dashed', 'Crossover fill: yellow where neutron reads left of density (gas), grey the other way (shale)'],
          ['Porosity (v/v)', 'PHIE, 0 to 0.5', 'Threshold fill above the φ cutoff'],
          ['Vsh (v/v)', 'VSH, 0 to 1, filled to the right', 'none'],
          ['Sw (v/v)', 'SW, 0 to 1', 'none'],
          ['k (mD)', 'KPERM, 0.01 to 10000 log. Present only while a permeability model is selected.', 'none'],
          ['Pay', 'PAY flag, filled to the left', 'none'],
          ['Facies', 'Colour strip from the crossplot facies polygons', 'strip'],
        ]}
      />
      <Para>
        Every track header shows two rows of scale labels, one per curve, in the curve&apos;s colour.
        Clicking a track header opens that track in the Track layout panel of the dock.
      </Para>
      <SubHeading>Zones, tops and dragging</SubHeading>
      <Para>
        Zones draw as translucent bands with their names. Tops from the registry draw as labelled
        lines and are read-only here. On a well you own, hover a zone edge until the cursor changes,
        then drag: a preview reads <Code>ZONE top → 2040.0 m</Code> while you move, and releasing
        commits the edge. A base dragged above its top is rejected with <Code>Zone base must stay
        below its top</Code>.
      </Para>
      <SubHeading>Axis toggles</SubHeading>
      <Table
        headers={['Toggle', 'Effect']}
        rows={[
          ['axis: MD / axis: TVD (status bar)', 'Shown only when the well carries a deviation survey with at least two stations. It changes the LABELS on the depth axis to true vertical depth through the minimum-curvature survey math; the spacing stays measured depth, and the axis title says so: TVD (m) on MD spacing. Depths outside the survey label as a dash.'],
          ['depth: m / depth: ft (status bar)', 'Display unit for the depth axis and the crosshair readout. The label adds SI internal as a reminder that storage stays metres; grid lines are chosen in the display unit so a feet grid looks like a feet grid.'],
        ]}
      />
      <Para>
        When a selection polygon is active on a crossplot, the selected samples appear as cyan ticks
        in the axis gutter of the track view, which is what the Split view is for.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="layouts">
      <SectionHeading icon={LayoutTemplate}>Track layouts</SectionHeading>
      <Para>
        The <Code>Track layout</Code> panel in the dock is a template editor. Two templates are
        built in: <Code>Standard triple combo</Code> (the table above) and <Code>Raw quicklook</Code>
        (GR, RT, Density-Neutron, DT with no computed curves). Built-in templates are marked in the
        dropdown, and the panel reminds you that any edit forks a built-in into your own copy, so
        the originals are always there to come back to.
      </Para>
      <SubHeading>Editing a template</SubHeading>
      <Table
        headers={['Control', 'What it does']}
        rows={[
          ['Template dropdown', 'Switch between built-ins and your saved templates.'],
          ['Save as… / Rename / Delete', 'Save the current state under a new name, rename it, or delete it. Rename and Delete are disabled on built-ins; editing a built-in forks it into a copy named with (edited).'],
          ['Add track', 'Appends a track titled New track (linear, 0 to 1) and opens its editor. Inside a track, Curve and Fill add a curve row or a fill row.'],
          ['Move up / Move down / Remove track', 'Reorder or drop a track. The arrow buttons sit on each track header in the panel.'],
          ['Title, Width, Scale, Range', 'Per track. Width is a proportion (1.2 draws 20 percent wider than a width-1 track). Scale is linear or log. Range is the track min and max.'],
          ['Curves: source', 'input:GR, input:RHOB, input:NPHI, input:DT, input:RT, output:PHIE, output:VSH, output:SW, output:PAY, output:TEMP, output:KPERM, output:BVW. Addresses are portable: the same template works on any well.'],
          ['Curves: colour, min, max, style', 'Colour picker; an optional min and max that override the track range for that one curve (this is how NPHI sits reversed over RHOB); line style solid, dash or dot.'],
          ['Fills: threshold', 'Shade one curve above or below a threshold. The threshold can be bound to a parameter (cutPhi, cutVsh, cutSw, grClean, grClay) so it follows the parameter set, or a fixed value.'],
          ['Fills: crossover', 'Shade between two curves of the same track, one colour for each sign of the crossing.'],
        ]}
      />
      <Para>
        Layouts are saved with the interpretation, so a template you build for one study reopens
        with it. The Standard triple combo drops the k track automatically while the permeability
        model is none and brings it back when you select one.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="parameters">
      <SectionHeading icon={Sliders}>Parameters and methods</SectionHeading>
      <Para>
        The parameter panel is draft-and-apply. Type freely; nothing recomputes until you press
        <Code>Apply parameters</Code>, and the button stays disabled while any visible field is
        not a finite number. Fields that a selected model does not use are hidden, and hidden fields
        keep their last committed value, so stale text can never poison a run. The Scope selector at
        the top is covered under Zones.
      </Para>

      <SubHeading>Vsh (GR)</SubHeading>
      <Formula>IGR = (GR - GR clean) / (GR clay - GR clean), clamped to 0..1</Formula>
      <Table
        headers={['Model option', 'Equation', 'Default']}
        rows={[
          ['linear', 'Vsh = IGR', ''],
          ['larionov-tertiary', 'Vsh = 0.083 (2^(3.7 IGR) - 1)', 'default model'],
          ['larionov-older', 'Vsh = 0.33 (2^(2 IGR) - 1)', ''],
          ['clavier', 'Vsh = 1.7 - sqrt(3.38 - (IGR + 0.7)^2)', ''],
          ['steiber', 'Vsh = IGR / (3 - 2 IGR)', ''],
          ['GR clean (API)', 'clean-sand gamma ray', '20'],
          ['GR clay (API)', 'shale gamma ray', '120'],
        ]}
      />

      <SubHeading>Porosity</SubHeading>
      <Table
        headers={['Field', 'Options or meaning', 'Default']}
        rows={[
          ['φe source', 'density, sonic, nd. This choice is what PHIE means for the whole run.', 'density'],
          ['ρ matrix (g/cc)', 'Matrix density for density porosity', '2.65'],
          ['ρ fluid (g/cc)', 'Fluid density for density porosity', '1.0'],
          ['Δt matrix (µs/m)', 'Matrix slowness for sonic porosity, in µs per metre', '182'],
          ['Δt fluid (µs/m)', 'Fluid slowness in µs per metre', '656'],
          ['Sonic model', 'wyllie (time average) or rhg (Raymer-Hunt-Gardner)', 'wyllie'],
          ['N-D combine', 'avg (arithmetic mean of density and neutron porosity) or rms (the gas form, root-mean-square)', 'avg'],
        ]}
      />
      <Formula>Density: φ = (ρma - ρb) / (ρma - ρfl)</Formula>
      <Callout tone="warn" title="Slowness is in microseconds per metre">
        The registry stores SI. A chart-book Δt matrix of 55.5 µs/ft is 182 µs/m, and a fluid
        value of 200 µs/ft is 656 µs/m, which is why those are the defaults. Entering feet-based
        slowness here gives porosities near zero or negative.
      </Callout>

      <SubHeading>Temperature</SubHeading>
      <Table
        headers={['Field', 'Meaning', 'Default']}
        rows={[
          ['Model', 'none: Rw is used as entered at every depth. linear: a linear profile from surface temperature to BHT builds a TEMP curve and converts Rw per sample with the Arps relation.', 'none'],
          ['Surface T (°C)', 'Surface temperature of the profile', '25'],
          ['BHT (°C)', 'Bottom-hole temperature', '90'],
          ['BHT depth (m)', 'Depth at which BHT applies', '2100'],
          ['Rw ref T (°C)', 'The temperature at which the Rw you typed was measured', '25'],
        ]}
      />
      <Para>
        With the linear model the Rw label changes to <Code>Rw @ ref T (ohm·m)</Code> to make
        clear you are entering a laboratory value, and the pipeline adds a TEMP output curve you
        can chart as <Code>output:TEMP</Code>. Arps is computed in degrees Fahrenheit inside the
        engine; you always type Celsius.
      </Para>

      <SubHeading>Sw</SubHeading>
      <Table
        headers={['Model option', 'Source and behaviour', 'Extra fields it reveals']}
        rows={[
          ['archie', 'Archie (1942): Sw = ((a Rw) / (φ^m Rt))^(1/n). Default model.', 'a, m, n, Rw'],
          ['simandoux', 'Simandoux (1963), classic quadratic form with n = 2; reduces to Archie at Vsh = 0.', 'Rsh'],
          ['indonesia', 'Poupon and Leveaux (1971); reduces to Archie at Vsh = 0.', 'Rsh'],
          ['waxman-smits', 'Waxman and Smits (1968). B(T) from Juhasz (1981) unless set manually. The m and n fields relabel as m* and n* (shaly-rock exponents), which are not the same numbers as clean-sand m and n.', 'Rw ref T, Qv (meq/cm³), B source (juhasz or manual), B (manual)'],
          ['dual-water', 'Clavier, Coates and Dumanoir (1984). Returns total water saturation Swt.', 'Rwb (bound-water resistivity), Swb (bound-water saturation)'],
          ['mod-simandoux', 'Bardon and Pied (1969) modified Simandoux; reduces to Archie at Vsh = 0.', 'Rsh'],
        ]}
      />
      <Table
        headers={['Field', 'Default']}
        rows={[
          ['a', '1'], ['m', '2'], ['n', '2'], ['Rw @ FT (ohm·m)', '0.05'], ['Rsh (ohm·m)', '2.0'],
          ['Qv (meq/cm³)', '0.1'], ['B source', 'juhasz'], ['B (manual)', '3'],
          ['Rwb (ohm·m)', '0.02'], ['Swb (v/v)', '0.25'],
        ]}
      />
      <Para>
        Sw is clamped to 1 before cutoffs and averages so a wet sample never contributes more than
        100 percent water. Samples with a missing input give NaN outputs and are drawn as gaps.
      </Para>

      <SubHeading>Permeability</SubHeading>
      <Para>
        The default model is <Code>none</Code>, which computes no permeability and leaves every
        existing recipe unchanged. Selecting a model shows its formula in the panel, adds the k
        track and a BVW output, and adds a thickness-weighted geometric-mean permeability over the
        pay flags to every zone card.
      </Para>
      <Table
        headers={['Model option', 'Formula (φ and Swirr as fractions, k in mD)']}
        rows={[
          ['timur', 'Timur 1968: k = 8581·φ^4.4/Swirr²'],
          ['tixier', 'Tixier 1949: k = (250·φ³/Swirr)²'],
          ['coates', 'Coates and Denoo 1981: k = (100·φ²(1−Swirr)/Swirr)²'],
          ['wyllie-rose', 'k = (c·φ^q/Swirr)² with Morris and Biggs presets: oil c = 250, gas c = 79, q = 3'],
        ]}
      />
      <Table
        headers={['Field', 'Meaning', 'Default']}
        rows={[
          ['Swirr source', 'buckles: Swirr = Buckles const / φ per sample, clamped to 1. manual: one value for the well.', 'buckles'],
          ['Buckles const', 'The φ·Swirr product for the rock type', '0.04'],
          ['Swirr (v/v)', 'Manual irreducible water saturation', '0.15'],
          ['c (Wyllie-Rose)', 'Wyllie-Rose coefficient', '79 (gas preset)'],
          ['q (Wyllie-Rose)', 'Wyllie-Rose porosity exponent', '3'],
        ]}
      />

      <SubHeading>Cutoffs</SubHeading>
      <Table
        headers={['Field', 'Rule', 'Default']}
        rows={[
          ['φ ≥', 'A sample is pay only if PHIE is at or above this', '0.08'],
          ['Vsh ≤', 'and VSH is at or below this', '0.5'],
          ['Sw ≤', 'and SW is at or below this', '0.6'],
        ]}
      />
      <Para>
        The same three values drive the threshold fills in the tracks and the draggable lines in
        the histogram, so there is one place they live.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="zones">
      <SectionHeading icon={Rows}>Zones and net pay</SectionHeading>
      <Para>
        Zones are depth intervals you define in the <Code>Zones</Code> panel: a name, a top and a
        base in metres MD, then <Code>Add</Code>. The panel refuses an empty name and a base that is
        not below the top. Each zone card shows the live summary at the current parameters:
      </Para>
      <Table
        headers={['Readout', 'Definition']}
        rows={[
          ['net', 'Metres of pay: samples passing all three cutoffs, thickness by sample midpoints'],
          ['gross', 'Metres of rock in the zone, including samples with a missing input'],
          ['NTG', 'net divided by gross'],
          ['φ avg, Sw avg, Vsh avg', 'Net-thickness-weighted averages over the pay samples; blank when net is zero'],
          ['k gm', 'Thickness-weighted geometric mean of KPERM over the pay samples, in mD. Shown only when a permeability model is on.'],
        ]}
      />
      <Para>
        A sample with any missing input is never pay but still counts as gross. <Code>no computed
        curves yet</Code> means porosity, Vsh or Sw is missing for this well. <Code>published summary
        on record</Code> means a snapshot of this zone has been written to the registry; the upload
        button on the card does that, and it is disabled until curves exist.
      </Para>

      <SubHeading>Per-zone parameter overrides</SubHeading>
      <Para>
        Change the <Code>Scope</Code> selector at the top of the parameter panel from Global to a
        zone. The panel now shows that zone&apos;s effective values; edit any of them and press
        <Code>Apply ZONE overrides</Code>. Only the fields that differ from global are stored, as a
        patch, and a cyan dot marks each one. Setting a field back to the global value removes its
        override, and <Code>Clear ZONE overrides</Code> removes them all. Zone cards show an
        override badge listing the overridden keys.
      </Para>
      <Para>
        Overrides are resolved per sample: zones are sorted by top, and for each depth the first
        zone containing it supplies the parameters. When two zones overlap, the status bar warns
        <Code>zones A and B overlap</Code> and tells you the shallower zone&apos;s overrides win in the
        overlap. Samples outside every zone use the global set.
      </Para>
      <Callout tone="info" title="Tops versus zones">
        Registry tops are drawn on the tracks but never edited here; Well Correlation owns them.
        Zones are the Studio&apos;s own intervals: draggable on the tracks for wells you own,
        summarised on the cards, exported in the zone CSV and the PDF, and compared across wells in
        the Field view by name.
      </Callout>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="interpretations">
      <SectionHeading icon={Save}>Interpretations</SectionHeading>
      <Para>
        An interpretation is a named, saved state of the Studio for one well. The picker in the
        ribbon shows the open interpretation&apos;s name (or <Code>Unsaved</Code>), lists every
        interpretation on the current well with the open one marked, and offers
        <Code>Save as…</Code>, <Code>Rename</Code> and <Code>Delete</Code>. The ribbon
        <Code>Save</Code> button writes the open interpretation in place; on a well with no
        interpretation yet it creates one.
      </Para>
      <Table
        headers={['Saved with the interpretation', 'Not saved with it']}
        rows={[
          ['Global parameters', 'Curves in the registry (raw, conditioned or published)'],
          ['Per-zone override patches', 'Zones themselves (they belong to the well, shared by all its interpretations)'],
          ['Track layout templates', 'Registry tops'],
          ['Facies polygons and the FACIES strip', ''],
          ['Crossplot choice and colour-by setting', ''],
        ]}
      />
      <Para>
        Deleting an interpretation asks for confirmation and states that published curves stay in
        the registry. Interpretations are a study artifact; the registry is the record.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="crossplots">
      <SectionHeading icon={ScatterChart}>Crossplots and Split view</SectionHeading>
      <Para>
        Crossplots are white analytic charts in the Suite chart style. Four plots share one toolbar:
        the plot buttons, a <Code>Color by</Code> selector (Facies, None, Depth, or any loaded curve
        with a viridis colourbar), and <Code>Reset zoom</Code>. On every plot the wheel zooms and
        dragging pans, both in data space and log-aware, and hovering identifies the nearest sample
        with its depth and values.
      </Para>
      <Table
        headers={['Plot', 'Axes and overlays', 'Needs']}
        rows={[
          ['Density-Neutron', 'NPHI against RHOB with sandstone, limestone and dolomite lines. The home of facies polygons.', 'NPHI and RHOB'],
          ['Pickett', 'log φe against log Rt with iso-Sw lines at 1, 0.8, 0.6, 0.4 and 0.2 from the current a, m, n, Rw; water-line fit.', 'RT and a computed φe'],
          ['Buckles', 'φe against Sw with iso-BVW hyperbolas at 0.02, 0.04, 0.06, 0.09 and 0.12. Points lying along one hyperbola are at irreducible water.', 'computed φe and Sw'],
          ['Hingle', 'φe against the Hingle resistivity transform (Rt to the power of minus 1/m); the water line passes through the origin.', 'RT and a computed φe'],
        ]}
      />
      <SubHeading>Fitting the water line</SubHeading>
      <Para>
        On Pickett or Hingle, type the <Code>Water zone (m MD)</Code> top and base of an interval
        you believe is fully water bearing and press <Code>Fit water line</Code>. Points inside the
        window recolour so you can see what the fit used. Pickett fits both the slope and the
        intercept, and <Code>Apply to parameters</Code> writes m and Rw into the parameter set
        (Rw is the fitted a·Rw divided by your a). Hingle fits a through-origin line at your current
        m and <Code>Apply Rw</Code> writes only Rw. Either way the status bar quotes the values and
        the sample count. Both fits require finite φe and Rt in the window; an empty window is
        reported rather than fitted.
      </Para>
      <SubHeading>Facies polygons</SubHeading>
      <Para>
        On the Density-Neutron plot, <Code>Draw facies…</Code> lets you click vertices, name the
        facies and <Code>Close polygon</Code>. Samples inside take that facies, appear in the
        FACIES strip track, and can colour any plot through Color by Facies. Delete a facies from
        its chip in the toolbar. Polygons save with the interpretation.
      </Para>
      <SubHeading>Selection brush and Split view</SubHeading>
      <Para>
        <Code>Select…</Code> draws a polygon on any plot and <Code>Apply selection</Code> highlights
        those samples: they turn bright on the plot while the rest dim, and cyan ticks mark their
        depths in the track axis gutter. <Code>Clear selection</Code> removes it. The
        <Code>Split</Code> view puts Tracks and the crossplot side by side (60/40, fixed) so you
        can see where a cloud of points lives in depth without leaving the plot. Selecting and
        facies tagging are separate: selection is a temporary highlight and is not saved.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="histograms">
      <SectionHeading icon={BarChart3}>Histograms and cutoffs</SectionHeading>
      <Para>
        The Histograms view plots any loaded input or computed curve for the whole well or one zone
        interval, with a cumulative frequency curve on the right axis and P10, P50 and P90 markers.
      </Para>
      <Table
        headers={['Control', 'What it does']}
        rows={[
          ['Curve', 'Any of GR, RHOB, NPHI, DT, RT that is loaded, then any of PHIE, VSH, SW, KPERM, BVW, TEMP that is computed. RT and KPERM bin in log space.'],
          ['Bins', 'Bin count, 5 to 200; default 40'],
          ['Interval', 'Whole well, or one zone by name'],
          ['passing cutoff', 'For PHIE, VSH and SW: the percentage of finite samples that pass that curve\'s cutoff at the current value'],
          ['P10 · P50 · P90', 'Percentiles of the plotted samples, also drawn as dashed markers'],
          ['Overlay wells', 'Checkboxes for the other registry wells; each overlay draws as a stepped outline in its own colour on the same bins'],
          ['normalize… / two-point P5/P95 / mean-std / Fit', 'GR normalization: pick a target well from the overlays, choose the fit, press Fit. The result reads shift and scale and a dashed preview shows the current well\'s curve after normalization.'],
        ]}
      />
      <SubHeading>Dragging the cutoff lines</SubHeading>
      <Para>
        The vertical lines are live parameters: <Code>φ ≥</Code> on PHIE, <Code>Vsh ≤</Code> on
        VSH, <Code>Sw ≤</Code> on SW, and <Code>clean</Code> and <Code>clay</Code> on GR. Drag one
        and the line previews as you move; releasing commits the value (four significant figures)
        straight into the parameter set, exactly as if you had typed it and pressed Apply, and the
        status bar confirms which parameter was set. This is the quickest way to set GR clean and
        GR clay from the sand and shale modes.
      </Para>
      <Para>
        A normalization fit is a preview only. To actually shift and scale a curve you apply the
        fit in the Condition dialog, where the values are prefilled from the last fit.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="conditioning">
      <SectionHeading icon={Wand2}>Conditioning curves</SectionHeading>
      <Para>
        <Code>Condition…</Code> opens the <Code>Condition a curve</Code> dialog for a well you own.
        It never edits a raw curve. Every operation saves a new registry curve named
        <Code>KEY_CND</Code> (for example GR_CND) with the operation and its settings recorded in
        provenance, and the dialog says so at the top. Choose the source curve, the operation,
        check the preview count of samples changed and nulled, then press <Code>Save KEY_CND</Code>.
      </Para>
      <Table
        headers={['Operation', 'Settings and defaults', 'Behaviour']}
        rows={[
          ['Despike (Hampel)', 'Half window 5, n sigma 3', 'Replaces a sample by the window median when it is more than n robust sigmas from it. A window with zero spread treats any deviation as a spike.'],
          ['Smooth (mean)', 'Half window 5', 'Centred moving average; a NaN centre stays NaN.'],
          ['Smooth (median)', 'Half window 5', 'Centred moving median; same NaN rule.'],
          ['Depth shift (block)', 'Shift (m) 0.5', 'Moves the whole curve by a constant depth. This is a block shift only; stretch and squeeze correlation is out of scope.'],
          ['Bad-hole repair', 'Bit size 8.5, Washout over 2, |DRHO| max 0.15, Repair null out or bridge short gaps, Max gap (samples) 6', 'Flags samples where caliper exceeds bit size plus the washout allowance or |DRHO| exceeds the limit. Null out blanks them; bridge short gaps interpolates across flagged runs no longer than the max gap and blanks longer ones. Also saves a BADHOLE flag curve.'],
          ['Apply normalization', 'Shift and Scale, prefilled from the histogram fit', 'Writes shift + scale × curve.'],
        ]}
      />
      <Para>
        The Curve list offers every loaded curve except depth, so CAL, DRHO and PEF can be
        conditioned too. After saving, the status bar tells you to pick the new curve as the input
        in the explorer. Until you do, the pipeline keeps reading the raw curve. Bad-hole repair
        refuses to run without a CAL or DRHO curve on the well and says so in the preview line.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="rwtools">
      <SectionHeading icon={Droplets}>Rw quicklook tools</SectionHeading>
      <Para>
        <Code>Rw tools…</Code> opens two calculators. Each has an <Code>Apply as Rw</Code> button
        that writes the result into the Rw parameter, sets Rw ref T to the temperature it applies
        at, closes the dialog and quotes what was applied in the status bar. You type Celsius; the
        SP and Arps formulas run in Fahrenheit inside.
      </Para>
      <Table
        headers={['Tool', 'Inputs (defaults)', 'Output']}
        rows={[
          ['SP quicklook', 'SSP (mV) -100, Rmf (ohm·m) 0.5, Formation T (°C) 65', 'K at that temperature and Rwe, the equivalent water resistivity from the static SP'],
          ['Arps temperature converter', 'Rw 0.1, at T (°C) 25, to T (°C) 65', 'Rw at the second temperature'],
        ]}
      />
      <Callout tone="warn" title="Rwe is applied as Rw">
        The SP tool treats the equivalent resistivity Rwe as Rw. The Bateman-Konen correction from
        Rwe to Rw is deliberately not included until a page-referenced source for its coefficients
        is on file. For fresh formation waters the difference is small; for very saline waters
        prefer a Pickett or Hingle fit, or a measured sample.
      </Callout>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="field">
      <SectionHeading icon={Columns}>Field view</SectionHeading>
      <Para>
        <Code>Field</Code> places up to eight wells side by side on one displayed-depth axis. It
        opens with <Code>Pick wells above to compare them side by side</Code>; tick the wells in the
        <Code>Wells</Code> row of the field header. A ninth is refused with a message, and a well
        without a depth curve is skipped with a message. Each well is computed with its own curves,
        its own zones and the open interpretation&apos;s parameters and overrides, and each column
        shows compact GR, PHIE, SW and PAY tracks taken from the active template, with the
        well&apos;s tops as markers. The same wheel, drag and double-click gestures apply.
      </Para>
      <Table
        headers={['Datum option', 'Effect']}
        rows={[
          ['Structural (MD)', 'Columns share measured depth.'],
          ['Flatten on TOP', 'Every column is shifted so the named top sits at the same displayed depth. A well without that top is drawn unflattened and labelled: no datum top, unflattened.'],
        ]}
      />
      <Para>
        Below the columns, the cross-well zone summary table lists every zone name found on the
        selected wells (matched case-insensitively) and, per well, net metres, N/G, φ and Sw. A
        dash means the well has no zone of that name; nothing is guessed. Curves are decimated per pixel row (min and
        max preserved) so eight wells stay responsive, and the crosshair lives on its own layer so
        moving the mouse never redraws the columns.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="publish">
      <SectionHeading icon={UploadCloud}>Publish, batch, digitize</SectionHeading>
      <SubHeading>Publish</SubHeading>
      <Para>
        <Code>Publish</Code> writes the computed outputs to the registry as ordinary logs on the
        current well, one row per curve, as float32 samples with the full parameter set, the input
        log ids, the interpretation name, the zone overrides and the pipeline version in provenance.
      </Para>
      <Table
        headers={['Published curve', 'Unit', 'Description recorded']}
        rows={[
          ['VSH', 'V/V', 'Shale volume (model name)'],
          ['PHIE', 'V/V', 'Effective porosity (source)'],
          ['SW', 'V/V', 'Water saturation (model name)'],
          ['PAY', 'FLAG', 'Net-pay flag (1 = pay)'],
          ['KPERM', 'MD', 'Permeability (model, mD); only when a permeability model is on'],
        ]}
      />
      <Callout tone="info" title="The overwrite-own contract">
        Re-running a recipe overwrites its own earlier output on the same well, same mnemonic and
        same interpretation. It never touches curves from another interpretation, another user, or
        a raw import. Publishing is disabled on wells you do not own.
      </Callout>
      <SubHeading>Batch</SubHeading>
      <Para>
        <Code>Batch…</Code> opens <Code>Batch run with current parameters</Code>: tick the wells you own
        and every one is computed with the parameter set now applied and published. Each well&apos;s
        own zones are used for overrides, and the dialog reports the result per well; a well with
        missing inputs reports <Code>nothing to publish</Code>.
      </Para>
      <SubHeading>Digitize</SubHeading>
      <Para>
        <Code>Digitize…</Code> is a wizard for a scanned log image. Load the image, click two depth
        reference lines and enter their depths in metres MD, click two value reference lines for
        the curve, then click along the trace. Name the mnemonic, give a unit and a depth step in
        metres, and Save adds the curve to the well in the registry. It needs at least two traced
        points and a positive step.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="export">
      <SectionHeading icon={FileDown}>Export deliverables</SectionHeading>
      <Para>
        <Code>Export…</Code> is enabled once a well has computed outputs and offers five downloads.
        A depth options strip at the top of the dialog sets the unit (metres or feet, starting from
        the workstation toggle), which depth columns travel (MD, TVD, TVDSS) and which of them is
        <Code>DEPT</Code>. TVD is below KB, TVDSS is TVD minus the well&apos;s KB, both derived
        through the deviation survey by minimum curvature; a well without a survey is treated as
        vertical and the dialog says so. Every deliverable below follows the same options.
      </Para>
      <Table
        headers={['Deliverable', 'Contents']}
        rows={[
          ['Curves CSV', 'The chosen depth columns, the mapped inputs and the four core outputs VSH, PHIE, SW and PAY; blank cells for nulls.'],
          ['Zone summary CSV', 'Gross, net, N/G and net-weighted averages per zone at the current parameters.'],
          ['LAS 2.0', 'DEPT plus any extra depth columns as curves, inputs plus VSH, PHIE, SW and PAY, with the parameter set in the ~Parameter block (DEPTREF, EKB and DEPTHSRC record the depth choice). Feet write the unit F. The writer is round-trip gated: what it writes parses back bit for bit.'],
          ['Track plot PNG', 'The track view exactly as rendered, with a branded title band. Open the Tracks view first; the other views have no track canvas to capture.'],
          ['PDF summary report', 'Well and interpretation, the parameter table, the methods in use with their literature citations, the zone table (top, base, gross, net, N/G, φ avg, Vsh avg, Sw avg) and provenance.'],
        ]}
      />
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="units">
      <SectionHeading icon={Ruler}>Units, outputs, provenance</SectionHeading>
      <Table
        headers={['Quantity', 'Unit in the Studio']}
        rows={[
          ['Depth', 'Metres MD in storage. The ft toggle changes what you see and type (tracks, zone panel, statuses) and is the starting unit of the Export dialog, whose options also add TVD and TVDSS columns.'],
          ['Slowness', 'µs/m'],
          ['Density', 'g/cc'],
          ['Resistivity', 'ohm·m'],
          ['Temperature', 'Degrees Celsius everywhere you type; Arps runs in Fahrenheit inside the engine'],
          ['Porosity, Vsh, Sw, BVW', 'Fractions (v/v)'],
          ['Permeability', 'Millidarcies. This is the one documented exception to SI, because every cited correlation is written in mD.'],
          ['Qv', 'meq/cm³'],
        ]}
      />
      <SubHeading>Output curves</SubHeading>
      <Table
        headers={['Curve', 'Available when', 'Chartable as']}
        rows={[
          ['VSH', 'GR present', 'output:VSH'],
          ['PHIE (with PHID, PHIS, PHIND behind it)', 'The chosen source\'s inputs present', 'output:PHIE'],
          ['SW', 'PHIE and RT present', 'output:SW'],
          ['PAY', 'PHIE, VSH and SW present', 'output:PAY'],
          ['TEMP', 'Temperature model linear', 'output:TEMP'],
          ['KPERM', 'Permeability model not none', 'output:KPERM'],
          ['BVW', 'Permeability model not none (φe × Sw)', 'output:BVW'],
        ]}
      />
      <Para>
        Every published curve and zone summary carries <Code>pipeline_version</Code> (currently 4),
        the method keys, the parameter set, the input log ids and the interpretation name, so a
        number in Well Correlation or a map can always be traced back to how it was made.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="validation">
      <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
      <Para>
        The engine is validated against an independent oracle written from the literature, never
        from the app code, on an analytic type well whose Archie round trip is exact. Every method
        reproduces the oracle to 1e-12. The shaly-sand models are anchored to reduce exactly to
        Archie when their clay terms vanish (Qv = 0, Swb = 0, Vsh = 0). The Hingle fit on the type
        well&apos;s water leg returns the construction Rw exactly, and the LAS writer is gated on a
        bit-for-bit round trip through the Suite&apos;s own parser.
      </Para>
      <Table
        headers={['Method', 'Reference']}
        rows={[
          ['Larionov tertiary and older', 'Larionov (1969)'],
          ['Clavier', 'Clavier, Hoyle and Meunier (1971)'],
          ['Steiber', 'Steiber (1970)'],
          ['Sonic porosity', 'Wyllie, Gregory and Gardner (1956); Raymer, Hunt and Gardner (1980)'],
          ['Archie', 'Archie (1942)'],
          ['Simandoux / modified Simandoux', 'Simandoux (1963); Bardon and Pied (1969)'],
          ['Indonesia', 'Poupon and Leveaux (1971)'],
          ['Waxman-Smits', 'Waxman and Smits (1968), SPE Journal 8(2); B(T) per Juhasz (1981), SPWLA 22nd'],
          ['Dual water', 'Clavier, Coates and Dumanoir (1984), SPE Journal 24(2)'],
          ['Temperature and Rw(T)', 'Linear geothermal profile; Arps relation'],
          ['Permeability', 'Timur (1968, SPWLA 9th); Tixier (1949); Coates and Denoo (1981); Wyllie and Rose (1950) with Morris and Biggs (1967) presets'],
          ['Hingle', 'Hingle (1959)'],
          ['Despike', 'Hampel (1974)'],
        ]}
      />
      <Para>
        These are the same citations the PDF report prints, drawn from one table beside the math so
        the report can never disagree with the engine.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
      <SubHeading>Nothing changed when I edited a parameter</SubHeading>
      <Para>
        The dock is draft-and-apply. Press <Code>Apply parameters</Code>. If the button is greyed
        out, a visible field is not a number.
      </Para>
      <SubHeading>Publish, Condition, Digitize or zone dragging is disabled</SubHeading>
      <Para>
        The well is shared with you by someone else in your organization and is read-only. You can
        still interpret it, save interpretations and export.
      </Para>
      <SubHeading>My zone card says no computed curves yet</SubHeading>
      <Para>
        Net pay needs PHIE, VSH and SW together, which means GR, a porosity source and RT must all
        be mapped. Check the inventory under the well for a dash beside any of them.
      </Para>
      <SubHeading>Porosity is near zero or negative with sonic</SubHeading>
      <Para>
        Slowness is in µs/m. Multiply a chart-book µs/ft value by 3.281.
      </Para>
      <SubHeading>I saved GR_CND but the tracks look the same</SubHeading>
      <Para>
        Pick it as the GR input in the explorer dropdown. Conditioned curves are never substituted
        for you.
      </Para>
      <SubHeading>The TVD toggle is missing</SubHeading>
      <Para>
        It appears only when the well carries a deviation survey. When it does, remember that only
        the labels change; spacing stays MD and the axis title says so.
      </Para>
      <SubHeading>The Waxman-Smits result moved a lot when I switched from Archie</SubHeading>
      <Para>
        The m and n fields became m* and n*, the shaly-rock exponents, and Qv and Rw ref T came
        into play. Enter values for the shaly rock rather than reusing clean-sand m and n.
      </Para>
      <SubHeading>Two zones overlap</SubHeading>
      <Para>
        The status bar names them. In the overlap the shallower zone&apos;s overrides win. Adjust an
        edge by dragging it on the tracks or re-enter the zone.
      </Para>
      <SubHeading>What the Studio does not do</SubHeading>
      <Para>
        There is no probabilistic multi-mineral solver: porosity comes from one chosen source and
        lithology is a judgement you make on the Density-Neutron plot. Depth shifting is a block
        shift, with no stretch and squeeze. Rwe from the SP is applied as Rw without a Bateman-Konen
        correction. Tops are read-only. The split divider is fixed. None of these are hidden
        behind a setting.
      </Para>
    </GuideSection>

    {/* ------------------------------------------------------------------ */}
    <GuideSection id="glossary">
      <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
      <Table
        headers={['Term', 'Meaning']}
        rows={[
          ['IGR', 'Gamma-ray index, the linear position of GR between the clean and clay lines'],
          ['Vsh', 'Shale volume fraction'],
          ['PHIE', 'Effective porosity, whichever source was chosen'],
          ['Sw, Swt', 'Water saturation; Swt is total water saturation as returned by dual water'],
          ['Swirr', 'Irreducible water saturation, the input to every permeability correlation'],
          ['BVW', 'Bulk volume water, φe × Sw; constant along a Buckles hyperbola at irreducible conditions'],
          ['Rw, Rwe, Rwb', 'Formation water resistivity; the equivalent value from the SP; bound-water resistivity in dual water'],
          ['Rsh', 'Shale resistivity used by Simandoux and Indonesia'],
          ['Qv', 'Cation exchange capacity per unit pore volume, the Waxman-Smits clay term'],
          ['a, m, n', 'Archie tortuosity factor, cementation exponent and saturation exponent'],
          ['m*, n*', 'The shaly-rock exponents used by Waxman-Smits, distinct from clean-sand m and n'],
          ['NTG', 'Net to gross'],
          ['k gm', 'Thickness-weighted geometric-mean permeability over pay'],
          ['MD, TVD', 'Measured depth; true vertical depth from the deviation survey'],
          ['KEY_CND', 'A conditioned copy of the input KEY saved by the Condition dialog'],
          ['Interpretation', 'A named saved state: parameters, zone overrides, layouts, facies and crossplot settings'],
          ['Provenance', 'The record on every published curve of how it was computed'],
        ]}
      />
    </GuideSection>
  </HelpGuideShell>
);

export default PetrophysicsHelpGuide;
