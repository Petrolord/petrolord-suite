// QI Studio in-app help guide (QI programme Q1 / A4, 2026-10-06), on the
// shared HelpGuideLayout shell. The inventory groups and the usability items
// are quoted from the live services so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import { BookOpen, Zap, ClipboardList, Grid3x3, AlertTriangle, Scale, FileText, Share2, Activity, Layers } from 'lucide-react';
import { HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Step, Table } from '@/components/helpguide/HelpGuideLayout';
import SharingHelp from '@/components/recordSharing/SharingHelp';
import { GROUPS, STATES } from './services/inventory';
import { FAMILIES } from './services/usability';
import { INVERSION_METHODS, INVERSION_DEFAULTS } from './services/inversionRun';

const APP_PATH = '/dashboard/apps/geoscience/qi-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What QI Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (10 min)' },
  { id: 'inventory', icon: ClipboardList, title: 'Data inventory' },
  { id: 'usability', icon: Grid3x3, title: 'Usability matrix' },
  { id: 'qc', icon: Activity, title: 'Seismic QC' },
  { id: 'inversion', icon: Layers, title: 'Impedance inversion' },
  { id: 'issues', icon: AlertTriangle, title: 'Issue register' },
  { id: 'feasibility', icon: Scale, title: 'Feasibility per target' },
  { id: 'report', icon: FileText, title: 'The report' },
  { id: 'sharing', icon: Share2, title: 'Saving and sharing' },
];

function QIStudioHelpGuideContent() {
  return (
    <HelpGuideShell
      title="QI Studio Help Guide"
      subtitle="The data audit and feasibility of a quantitative interpretation study"
      metaDescription="How to set up a QI study, audit the data, read the usability matrix, keep an issue register, record feasibility per target and produce the audit report in Petrolord QI Studio."
      backTo={APP_PATH}
      backLabel="Back to QI Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What QI Studio is</SectionHeading>
        <Para>
          QI Studio holds the first package of a quantitative interpretation study: what data was asked for and what
          arrived, whether each well can support rock physics and a seismic tie at each target, the issues that follow,
          and whether the targets are feasible. It reads the Suite&apos;s shared records (the wells registry of Well Data
          Manager, Seismolord&apos;s volumes) and never changes them. The rock physics evidence is built in Rock Physics
          Studio; QI Studio records the verdicts and produces the report.
        </Para>
        <Para>QI Studio opens with a Seismolord or Rock Physics Studio licence.</Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Create a project">Give the study a name in the project box. Without a project the work stays on the page only.</Step>
        <Step n={2} title="Setup">Tick the wells and the target intervals (zone names shared by the wells), the seismic volumes, the date the seismic was acquired and each well&apos;s first production date.</Step>
        <Step n={3} title="Data inventory">Check each group&apos;s state. Groups the Suite already holds are suggested; change them to what was delivered.</Step>
        <Step n={4} title="Usability and issues">Read the matrix, open a cell for the reasons, then keep, resolve or dismiss the suggested issues.</Step>
        <Step n={5} title="Feasibility and report">Record a verdict per target from Rock Physics Studio, then download the report.</Step>
      </GuideSection>

      <GuideSection id="inventory">
        <SectionHeading icon={ClipboardList}>Data inventory</SectionHeading>
        <Para>{`Each group takes one of ${STATES.length} states: ${STATES.map((s) => s.label.toLowerCase()).join(', ')}. A received date and a note travel with it. The groups:`}</Para>
        <Table headers={['Area', 'Data']} rows={GROUPS.map((g) => [g.area, g.label])} />
        <Para>Suggestions come from the registries: for example the share of wells with a shear log, or the seismic volumes chosen. A suggestion is only a starting point.</Para>
      </GuideSection>

      <GuideSection id="usability">
        <SectionHeading icon={Grid3x3}>Usability matrix</SectionHeading>
        <Para>
          Every well against every target is good, limited or missing. A target is found on a well by its zone name.
          Each curve family is judged on the recorded depth extent of the best curve over the zone; a digitized curve
          counts as limited. Missing sonic or density, a missing zone or an unset elevation make a cell missing;
          no shear log, partial coverage, no checkshots or no survey make it limited.
        </Para>
        <Table headers={['Curve family', 'Mnemonics read']} rows={Object.values(FAMILIES).map((f) => [f.label, f.aliases.slice(0, 8).join(', ')])} />
        <SubHeading>Depletion</SubHeading>
        <Para>When the seismic was acquired after a well&apos;s first production date, the well is flagged: amplitudes near it may show pressure and saturation changes the logs do not.</Para>
      </GuideSection>

      <GuideSection id="qc">
        <SectionHeading icon={Activity}>Seismic QC</SectionHeading>
        <Para>
          For each volume chosen on Setup, Run QC on the server reads the whole volume on the seismic worker and
          measures, in three time windows: the average amplitude spectrum, its peak and the band within 6 dB of the
          peak; and the signal-to-noise ratio from how alike neighbouring traces are (Hatton and others, 1986: for a
          correlation c between neighbours, signal-to-noise is c / (1 - c)). On RMS amplitude maps around three times
          it looks for an acquisition footprint: a stripe that repeats every few lines.
        </Para>
        <Para>
          A stripe is reported when one period and its harmonics hold over 30 percent of the map profile&apos;s
          variance, stand at least ten times above the band&apos;s median power, and repeat at least five times across
          the survey. Signal-to-noise below 1 is a high-severity issue and below 3 a medium one; a band narrower than
          10 Hz, a footprint, and a dominant frequency that falls by 40 percent with depth are flagged too. Add the QC
          issues to the register with one click; the results are kept with the project and printed in the report.
        </Para>
      </GuideSection>

      <GuideSection id="inversion">
        <SectionHeading icon={Layers}>Impedance inversion</SectionHeading>
        <Para>
          The Inversion tab turns a stack into acoustic impedance on the seismic worker. Choose the volume, a method, the
          wavelet and the horizons, then read the wells: each study well becomes impedance in time from its sonic and
          density, through its committed tie (or its imported checkshots), on the trace at the middle of its log. A well
          that cannot be used says why, and the curves each well uses are named, so an edited or digitized curve is visible.
        </Para>
        <Table
          headers={['Method', 'What it gives']}
          rows={Object.entries(INVERSION_METHODS).map(([, m]) => [m.label, m.absolute ? 'Absolute impedance, with the low-frequency model below the seismic band' : 'Relative impedance (band-limited), with no wavelet scaling and no model'])}
        />
        <Para>
          {`The low-frequency model is each well's impedance kept below ${INVERSION_DEFAULTS.lfmHz} Hz, spread between the wells by inverse distance and kept at the same proportional position between your horizons, so a layer that thickens or dips keeps its impedance. With no horizons it follows constant time. The wavelet (the field wavelet averaged over the ties, or one well's) is scaled to the seismic at the wells by least squares, which also fixes its polarity.`}
        </Para>
        <Para>
          {`Check at the wells first. Each well is left out of the model in turn, inverted, and compared with its own log after a high cut at ${INVERSION_DEFAULTS.truthHz} Hz: the blind correlation and the blind impedance error, beside the same figures with the well in the model. A blind correlation under 0.6, a blind error over 10 percent, or a blind error far above the with-well error (the result leans on the model away from wells) is offered to the issue register. Then invert the volume: the impedance opens in Seismolord as a new volume, and the check and the runs are kept with the project and printed in the report.`}
        </Para>
      </GuideSection>

      <GuideSection id="issues">
        <SectionHeading icon={AlertTriangle}>Issue register</SectionHeading>
        <Para>The matrix suggests one issue per well and kind of gap, with a remedy. Keep a suggestion by giving it an owner or a status; a dismissed or resolved issue stays as you left it. Add your own issues at the foot of the table.</Para>
      </GuideSection>

      <GuideSection id="feasibility">
        <SectionHeading icon={Scale}>Feasibility per target</SectionHeading>
        <Para>For each target record a verdict (feasible, feasible with conditions or not feasible) and the reasoning: which properties separate the cases, whether the change is detectable against tuning and noise, and the recommended route. The evidence is built in Rock Physics Studio (fluid substitution, rock model lines, the multi-well crossplot).</Para>
      </GuideSection>

      <GuideSection id="report">
        <SectionHeading icon={FileText}>The report</SectionHeading>
        <Para>The Report tab builds the QI data audit and feasibility report: a summary, the inventory, the usability matrix with the reasons for every limited or missing item, depletion notes, the issue register (dismissed issues left out), the feasibility of each target and the assumptions behind them.</Para>
      </GuideSection>

      <GuideSection id="sharing">
        <SectionHeading icon={Share2}>Saving and sharing</SectionHeading>
        <Para>A project saves every few seconds once it is created. Saving needs the QI Studio projects table on the database; until it is switched on the page says so and the work stays on screen.</Para>
        <SharingHelp record="project" where="The sharing control is under the project box once the project is saved." />
      </GuideSection>
    </HelpGuideShell>
  );
}

export default function QIStudioHelpGuide() {
  return (
    <div className="min-h-screen" data-testid="qi-help-theme-scope">
      <QIStudioHelpGuideContent />
    </div>
  );
}
