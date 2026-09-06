// Pore Pressure Studio in-app help guide (PP1, 2026-09-06). Full-page
// route on the shared HelpGuideLayout shell. Every control named here
// exists in the workstation today; the unit choices are quoted from the
// live service so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import {
  BookOpen, Zap, Database, Ruler, TrendingDown, Gauge, Layers, UploadCloud, Link2, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { PRESSURE_UNITS, DEPTH_UNITS, PPG_PER_SG } from './services/units';

const APP_PATH = '/dashboard/apps/geoscience/pore-pressure-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Pore Pressure Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'inputs', icon: Database, title: 'Wells, curves and velocity trends' },
  { id: 'units', icon: Ruler, title: 'Display units and the EMW datum' },
  { id: 'nct', icon: TrendingDown, title: 'The normal compaction trend' },
  { id: 'methods', icon: Gauge, title: 'Eaton, Bowers and the fracture gradient' },
  { id: 'overburden', icon: Layers, title: 'Overburden and hydrostatic' },
  { id: 'deliver', icon: UploadCloud, title: 'Publishing, the CSV and saving' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

export default function PorePressureStudioHelpGuide() {
  return (
    <HelpGuideShell
      title="Pore Pressure Studio Help Guide"
      subtitle="Eaton and Bowers pore pressure prognosis, normal compaction trends, overburden and fracture gradient on the shared Geoscience well registry"
      metaDescription="How to load a registry well or a seismic velocity trend, fit the normal compaction trend, run an Eaton or Bowers prognosis, read pressures as MPa, psi or equivalent mud weight, publish PP/FP/OBG and export the prognosis in Petrolord Pore Pressure Studio."
      backTo={APP_PATH}
      backLabel="Back to Pore Pressure Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Pore Pressure Studio is</SectionHeading>
        <Para>
          Pore Pressure Studio turns a well's sonic and density curves, or a seismic velocity trend, into a pressure
          prognosis: overburden from the density integration, hydrostatic from the pore fluid, pore pressure from the
          departure of the sonic from a normal compaction trend by the Eaton or the Bowers method, and the fracture
          pressure from Poisson's ratio. Every number is computed in SI and shown in the units you choose, including
          equivalent mud weight for the well plan.
        </Para>
        <Para>
          Three panels: the registry wells and the seismic velocity trends on the left, the Prognosis and NCT views
          in the centre, and the method parameters, calibration points and Apply in the right dock. The ribbon carries
          the depth readout, the unit selectors, Prognosis CSV, Publish, Save and the launchers.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Pick a well">Click a registry well on the left. It needs a depth and a sonic curve; a density curve improves the overburden, otherwise Gardner densities stand in and the status bar says so.</Step>
        <Step n={2} title="Set the water column">In the dock type the water depth, the seawater and pore fluid densities and, for an equivalent mud weight referenced to the rotary table, the mudline MD. Press Apply.</Step>
        <Step n={3} title="Fit the trend">In NCT add shale picks at depths in the normally pressured section and press Fit NCT: the mudline transit time and the compaction constant are written into the dock.</Step>
        <Step n={4} title="Read the prognosis">Back in Prognosis, type a depth in the ribbon and read OBG, hydrostatic, PP and FG in the chosen unit; the chart shows the whole profile with your calibration points.</Step>
        <Step n={5} title="Deliver">Prognosis CSV downloads the table in your units with EMW columns; Publish writes PP, FP and OBG to the well; Save keeps the parameters and picks.</Step>
      </GuideSection>

      <GuideSection id="inputs">
        <SectionHeading icon={Database}>Wells, curves and velocity trends</SectionHeading>
        <Para>
          Wells and curves are the registry's (Well Data Manager imports the LAS files). The depth and sonic curves are
          required; the sonic may be in us/m or us/ft and the density in g/cc or kg/m3, both converted on load. Depths
          are taken below the mudline: the dock's mudline MD says where the mudline sits on the well's measured depth.
        </Para>
        <SubHeading>Seismic velocity trends</SubHeading>
        <Para>
          A velocity model calibrated in Seismolord (a v0 plus k times depth trend) can drive a prognosis without a well.
          The result is trend-grade and badged as such: it constrains the regional trend and carries no local
          overpressure anomaly. Publish is unavailable for a trend because there is no well to write to.
        </Para>
      </GuideSection>

      <GuideSection id="units">
        <SectionHeading icon={Ruler}>Display units and the EMW datum</SectionHeading>
        <Para>
          The Units selectors in the ribbon convert the readout, both charts, the dock fields, the calibration lines and
          the CSV. The engine, the saved project and the published curves stay in Pa and metres. The depth unit starts
          from your Geoscience depth setting, shared with Mapping &amp; Surface Studio and Earth Modeling; sonic and
          the compaction constant follow it (us/m and 1/m, or us/ft and 1/ft), and the density fields follow the
          pressure unit (kg/m3 with MPa, ppg with psi and ppg, sg with sg).
        </Para>
        <Table headers={['Quantity', 'Choices']} rows={[
          ['Pressure', PRESSURE_UNITS.map((u) => u.label).join(', ')],
          ['Depth', DEPTH_UNITS.join(', ')],
        ]} />
        <Callout tone="warn" title="An equivalent mud weight needs a datum">
          EMW divides the pressure by the depth below a datum. The datum is the rotary table when the dock's mudline MD
          is set (depth below RKB = mudline MD + depth below mudline), otherwise sea level (water depth + depth below
          mudline). The readout's unit tooltip, the chart axis and the CSV header say which is in use. ppg follows the
          drilling convention psi divided by 0.052 times the true vertical depth in feet; sg is ppg divided by {PPG_PER_SG}.
        </Callout>
      </GuideSection>

      <GuideSection id="nct">
        <SectionHeading icon={TrendingDown}>The normal compaction trend</SectionHeading>
        <Para>
          The normal trend is the transit time a normally pressured shale would have at each depth: the matrix
          transit time plus the mudline excess decaying exponentially with the compaction constant. The NCT view
          overlays it on the measured sonic. Add shale picks at depths in the normally pressured section (the sonic
          value is taken from the nearest sample) and Fit NCT solves the mudline transit time and the constant
          exactly from the picks; the matrix transit time is kept from the dock.
        </Para>
      </GuideSection>

      <GuideSection id="methods">
        <SectionHeading icon={Gauge}>Eaton, Bowers and the fracture gradient</SectionHeading>
        <Table headers={['Method', 'What it does', 'Parameters']} rows={[
          ['Eaton', 'Scales the effective stress by the ratio of the normal to the measured transit time raised to the exponent; the classic sonic method.', 'Exponent n (3 for sonic)'],
          ['Bowers', 'Inverts the velocity to effective stress through the loading curve; with U and the maximum stress set, the unloading curve applies where the velocity has reversed.', 'A and B in ft/s and psi as published; U; sigma max'],
        ]} />
        <Para>
          The fracture pressure is the minimum horizontal stress from Poisson's ratio: the pore pressure plus the
          effective overburden scaled by nu over one minus nu. The dock's calibration points (a depth and a pressure
          per line, in the display units) are drawn on the prognosis as dots for comparison; they do not change the
          computation.
        </Para>
      </GuideSection>

      <GuideSection id="overburden">
        <SectionHeading icon={Layers}>Overburden and hydrostatic</SectionHeading>
        <Para>
          Overburden integrates the seawater column over the water depth and then the bulk density down the well.
          Without a density curve, Gardner's relation converts the velocity to density. Hydrostatic is the pore fluid
          density times gravity times depth below the sea surface. Both are reported at every sample and in the readout.
        </Para>
      </GuideSection>

      <GuideSection id="deliver">
        <SectionHeading icon={UploadCloud}>Publishing, the CSV and saving</SectionHeading>
        <Para>
          Publish writes PP, FP and OBG to the well in the registry in MPa with the method, parameters and input curves
          in the provenance; publishing again from the same project replaces those three curves and leaves other apps'
          curves alone. This is the contract the Drilling mechanical earth model reads. Prognosis CSV downloads the
          profile in the chosen units with EMW columns in ppg and sg and the datum in the header, the table a well plan
          needs. Save keeps the parameters, picks and calibration as your project.
        </Para>
      </GuideSection>

      <GuideSection id="links">
        <SectionHeading icon={Link2}>Working with the other apps</SectionHeading>
        <Table headers={['App', 'Link']} rows={[
          ['Well Data Manager', 'Well data in the ribbon opens the selected well on its logs, where the published curves are listed and can be deleted.'],
          ['Petrophysics Studio, Well Correlation and the rest', 'Open in lists the Geoscience apps for the selected well; Petrophysics and Well Correlation open on that well.'],
          ['Seismolord', 'Velocity models calibrated there appear under Seismic velocity trends.'],
          ['Geoscience home', 'The home icon at the left of the ribbon.'],
        ]} />
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
        <SubHeading>The well will not load</SubHeading>
        <Para>Pore pressure needs a depth and a sonic curve. Import the LAS with DT in Well Data Manager.</Para>
        <SubHeading>The EMW looks too low near the top</SubHeading>
        <Para>Check the datum: with the mudline MD at zero the reference is sea level, so shallow samples carry the whole water column in their depth. Set the mudline MD to reference the rotary table.</Para>
        <SubHeading>Fit NCT refuses</SubHeading>
        <Para>It needs at least two picks at different depths with transit times above the matrix value.</Para>
        <SubHeading>The numbers differ from Petrel or Drillworks</SubHeading>
        <Para>Compare in the same unit and the same datum, with the same normal trend and exponent. The engine matches its published references to the digit; the trend is the usual difference.</Para>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['NCT', 'Normal compaction trend: the sonic a normally pressured shale would show against depth.'],
          ['EMW', 'Equivalent mud weight: the mud density whose column would balance the pressure at that depth.'],
          ['OBG', 'Overburden stress: the weight of water and rock above the depth.'],
          ['FG or FP', "Fracture gradient or pressure: the minimum horizontal stress estimate from Poisson's ratio."],
          ['Trend-grade', 'A prognosis from a seismic velocity trend alone: regional, without local anomalies.'],
          ['bml', 'Below the mudline, the depth reference of the engine.'],
        ]} />
      </GuideSection>
    </HelpGuideShell>
  );
}
