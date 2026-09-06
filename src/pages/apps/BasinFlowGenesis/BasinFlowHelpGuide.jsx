// Basin & Charge Modeling in-app help guide (BF3, 2026-09-06). Full-page
// route on the shared HelpGuideLayout shell, replacing the in-app help
// sheet whose articles described lithology mixing the engine ignores,
// an API and keyboard shortcuts. Every control named here exists in the
// app today. Copy rule: no em dashes. Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Layers, Thermometer, Mountain, Target, Upload, BarChart2, UploadCloud, Ruler, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { HeatFlowPresets } from './data/HeatFlowPresets';
import { ErosionPresets } from './data/ErosionPresets';
import { DEPTH_UNITS, TEMP_UNITS } from './services/units';

const APP_PATH = '/dashboard/apps/geoscience/basinflow-genesis';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Basin & Charge Modeling is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (15 min)' },
  { id: 'stratigraphy', icon: Layers, title: 'Stratigraphy and source rocks' },
  { id: 'thermal', icon: Thermometer, title: 'Heat flow and surface temperature' },
  { id: 'erosion', icon: Mountain, title: 'Erosion events' },
  { id: 'calibration', icon: Target, title: 'Calibration and Auto-Fit' },
  { id: 'import', icon: Upload, title: 'Import and the registry' },
  { id: 'results', icon: BarChart2, title: 'Reading the results' },
  { id: 'export', icon: UploadCloud, title: 'Scenarios, saving and export' },
  { id: 'units', icon: Ruler, title: 'Display units' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function BasinFlowHelpGuide() {
  return (
    <HelpGuideShell
      title="Basin & Charge Modeling Help Guide"
      subtitle="1D burial, thermal, maturity and charge history on oracle-validated engines, in Guided and Expert mode"
      metaDescription="How to build a layer stack, set heat flow and erosion, calibrate to vitrinite and temperature data, run the burial and thermal history, read maturity and generation, and export in Petrolord Basin & Charge Modeling."
      backTo={APP_PATH}
      backLabel="Back to Basin & Charge Modeling"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Basin &amp; Charge Modeling is</SectionHeading>
        <Para>
          Basin &amp; Charge Modeling reconstructs the burial, temperature, maturity and hydrocarbon generation history
          of one location through geological time. You describe the layers as they are today (thickness, lithology,
          deposition ages, source-rock richness), the basal heat flow through time, the surface temperature and any
          erosion; the engine decompacts the layers back through time (Athy compaction), solves the heat equation at
          every time step, tracks vitrinite reflectance with Easy%Ro, converts kerogen with a distributed-activation
          kinetic model, and expels hydrocarbons once a retention threshold is passed.
        </Para>
        <Para>
          Guided mode is a six-step wizard from a basin template to a run. Expert mode is the workspace: the project
          wells on the left, the Properties, Calibration, Scenarios, Sensitivity, Analysis, Templates, Batch and
          Import tabs in the centre, Simulate in the header. Both modes edit the same model.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (15 min)</SectionHeading>
        <Step n={1} title="Open Expert mode">Choose Expert on the welcome screen. The project well list on the left holds your models; the first one is created for you.</Step>
        <Step n={2} title="Build the stack">In Properties add layers from the top down: name, start and end age (Ma), thickness and lithology. Mark the source rock and give it TOC, HI and a kerogen type.</Step>
        <Step n={3} title="Set the history">In Global History choose a constant heat flow or a history table, type the surface temperature, and add erosion events if the section was uplifted.</Step>
        <Step n={4} title="Simulate">Press Simulate. The Analysis tab opens on the summary with the present-day temperature and Ro of every layer, then the burial, temperature, maturity, generation and timing plots.</Step>
        <Step n={5} title="Calibrate">In Calibration type or import measured Ro and temperature points, read the misfit, and let Auto-Fit find the heat flow.</Step>
      </GuideSection>

      <GuideSection id="stratigraphy">
        <SectionHeading icon={Layers}>Stratigraphy and source rocks</SectionHeading>
        <Para>
          Layers are listed youngest first, as in a well. Each layer deposits at its start age and is complete at its
          end age; the engine deposits it at once at the start age and steps forward one million years at a time.
          Thickness is the present-day thickness; the engine finds the solid thickness and decompacts it back through
          time with the lithology's porosity-depth curve. A gap or overlap between the ages of neighbouring layers is
          flagged before the run.
        </Para>
        <SubHeading>Source rocks</SubHeading>
        <Para>
          A source layer carries TOC in percent, hydrogen index in mg HC per g TOC and a kerogen type. Generation is
          mass based: the layer's organic mass times its potential, converted by the kinetic model as the layer heats.
          Expulsion starts once the generated mass exceeds the retention threshold and is reported per square metre.
        </Para>
      </GuideSection>

      <GuideSection id="thermal">
        <SectionHeading icon={Thermometer}>Heat flow and surface temperature</SectionHeading>
        <Para>
          The basal heat flow is constant or a history: a table of age and value pairs the engine interpolates
          between and holds outside. Global History in Expert mode edits the table with the chart under it; the wizard
          offers presets:
        </Para>
        <Table headers={['Preset', 'Range', 'Shape']} rows={HeatFlowPresets.map((p) => [p.name, p.range, p.type === 'constant' ? 'Constant' : 'History'])} />
        <Para>
          The surface temperature is the upper boundary of the heat solution, held through time. Effective conductivity
          follows the porosity at each depth, so shallow rocks conduct less than compacted ones.
        </Para>
      </GuideSection>

      <GuideSection id="erosion">
        <SectionHeading icon={Mountain}>Erosion events</SectionHeading>
        <Para>
          An erosion event is a shale section of the given thickness deposited at the surface and removed at the event
          age. The rocks below it were buried deeper and hotter before the uplift, so maturity is higher than the
          present-day depth alone would give. Add events in Global History (Erosion) in Expert mode, or choose a preset
          or a custom event in the wizard:
        </Para>
        <Table headers={['Option', 'Removed']} rows={ErosionPresets.map((p) => [p.name, p.amount > 0 ? `${p.amount} m` : 'none'])} />
      </GuideSection>

      <GuideSection id="calibration">
        <SectionHeading icon={Target}>Calibration and Auto-Fit</SectionHeading>
        <Para>
          The Calibration tab holds measured vitrinite reflectance and temperature points against depth, typed in the
          points tables or imported from a file. The profile plots draw the modelled present-day values through the
          layers with the measurements on top; the residual plots and the RMS misfits quantify the fit. Auto-Fit Heat
          Flow searches the basal heat flow that minimises the Ro and temperature misfit; with a history, the whole
          history is scaled and its shape kept. Save stores the points with the well and marks it calibrated when the
          misfit is small.
        </Para>
      </GuideSection>

      <GuideSection id="import">
        <SectionHeading icon={Upload}>Import and the registry</SectionHeading>
        <Table headers={['Import', 'File', 'What it does']} rows={[
          ['Calibration data', 'Delimited text with depth and Ro and/or temperature columns', 'Previews the points and every row it could not read; replaces or adds to the points.'],
          ['Formation tops', 'Delimited text with name and depth', 'Previews the layers it would make (thickness from the gaps, optional total depth, a lithology guess) and replaces the stratigraphy; ages are placeholders to type.'],
          ['Registry well', 'A well in the shared registry with tops', 'The same from Well Data Manager tops, and the well becomes this model\'s tie for the launchers.'],
        ]} />
        <Callout tone="info" title="File units">
          Files are read in the display depth unit shown on the import tab; switch it if a file is in the other unit.
          Temperatures in files are degrees C.
        </Callout>
      </GuideSection>

      <GuideSection id="results">
        <SectionHeading icon={BarChart2}>Reading the results</SectionHeading>
        <Table headers={['View', 'Shows']} rows={[
          ['Summary', 'Present-day top, base, temperature and Ro per layer; the source layers that passed 10% transformation.'],
          ['Burial', 'Every layer\'s top and base through time, decompacted, with erosion as a bulge before the event.'],
          ['Temperature', 'Layer temperature through time.'],
          ['Maturity', 'Easy%Ro through time with the oil, wet gas and dry gas windows shaded.'],
          ['Generation', 'Generated and expelled mass per square metre for the source layers.'],
          ['Timing', 'The generation window and the peak rate age per source layer.'],
        ]} />
      </GuideSection>

      <GuideSection id="export">
        <SectionHeading icon={UploadCloud}>Scenarios, saving and export</SectionHeading>
        <Para>
          Every edit auto-saves to the active project well after a short pause. Save Scenario snapshots the
          stratigraphy, heat flow and results so you can compare runs in the Scenarios tab. Export offers a PDF report
          with the stratigraphy table and summary, a CSV of every layer at every age (SI columns plus the display
          units), and the project as JSON.
        </Para>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Display units</SectionHeading>
        <Para>
          The Units selectors in the header convert thicknesses, depths and temperatures on the layer cards, the
          history editors, the calibration tables and plots, the summary table and the burial and temperature plots.
          The model, the saved well and the SI columns of the CSV stay in metres and degrees C. The depth unit starts
          from your Geoscience depth setting, shared with Mapping &amp; Surface Studio and Earth Modeling.
        </Para>
        <Table headers={['Quantity', 'Choices']} rows={[['Depth and thickness', DEPTH_UNITS.join(', ')], ['Temperature', TEMP_UNITS.map((u) => `°${u}`).join(', ')]]} />
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Well Data Manager', 'Well data in the header opens the tied registry well on its tops once the model is built from a registry well.'],
          ['Petrophysics Studio, Well Correlation and the rest', 'Open in lists the Geoscience apps for the tied well.'],
          ['Pore Pressure Studio', 'Uses its own sonic-based method; the two share the registry wells.'],
          ['Geoscience home', 'The home button in the Expert header.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>Ro is lower than measured everywhere</SubHeading>
        <Para>Raise the heat flow (or let Auto-Fit do it), or add the erosion the region records: present-day depth understates maximum burial.</Para>
        <SubHeading>A layer's start age must be older than its end age</SubHeading>
        <Para>Ages are millions of years before present, so the start of deposition is the larger number.</Para>
        <SubHeading>No generation shows</SubHeading>
        <Para>Check that a layer is marked as a source with TOC and HI above zero, and that it reached the oil window on the maturity plot.</Para>
        <SubHeading>The imported layers have odd ages</SubHeading>
        <Para>Tops files carry depths, not ages. The ages are placeholders flagged on the cards until you type them.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Decompaction', 'Restoring a layer to its thickness at an earlier, shallower burial from its solid thickness and the lithology porosity curve.'],
          ['Easy%Ro', 'The Sweeney and Burnham vitrinite reflectance kinetics used for maturity.'],
          ['Transformation ratio', 'The fraction of a source rock\'s generative potential already converted to hydrocarbons.'],
          ['HI', 'Hydrogen index, mg of hydrocarbon per g of organic carbon: the generative potential of the kerogen.'],
          ['Phantom section', 'The eroded thickness the engine adds and removes to model an erosion event.'],
          ['Ma', 'Millions of years before present.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
