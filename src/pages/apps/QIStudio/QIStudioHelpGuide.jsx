// QI Studio in-app help guide (QI programme Q1 / A4, 2026-10-06), on the
// shared HelpGuideLayout shell. The inventory groups and the usability items
// are quoted from the live services so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import { BookOpen, Zap, ClipboardList, Grid3x3, AlertTriangle, Scale, FileText, Share2, Activity, Layers, Gauge, MapPin, PackageCheck } from 'lucide-react';
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
  { id: 'properties', icon: Gauge, title: 'Property prediction' },
  { id: 'prospects', icon: MapPin, title: 'Prospects' },
  { id: 'issues', icon: AlertTriangle, title: 'Issue register' },
  { id: 'feasibility', icon: Scale, title: 'Feasibility per target' },
  { id: 'handover', icon: PackageCheck, title: 'Handover' },
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
        <Para>
          Sensitivity and uncertainty repeat the inversion under alternative assumptions: each tie wavelet and the field
          wavelet, the model cut at half and one and a half times the setting, and seeded noise at a signal-to-noise ratio
          you set (up to twelve scenarios). Checked at the wells, it gives each well&apos;s blind error at its 10th, 50th and
          90th percentile across the scenarios, and the mean error of each scenario, so you see which assumption the result
          depends on most. Inverted over the volume, it writes four volumes in one run: impedance at Q10, Q50 and Q90 (the
          10th, 50th and 90th percentiles per sample) and the relative spread (Q90 - Q10) / Q50.
        </Para>
      </GuideSection>

      <GuideSection id="properties">
        <SectionHeading icon={Gauge}>Property prediction</SectionHeading>
        <Para>
          The Properties tab predicts porosity or facies from a finished impedance volume. Read the wells: each gives its
          impedance and its porosity curve, or the facies curve written back from Rock Physics Studio&apos;s Multi-well
          crossplot, on the volume&apos;s time axis (facies codes go to the nearest sample, never interpolated). The logs are
          taken to seismic scale and, optionally, to a time window around the target.
        </Para>
        <Para>
          Porosity is a straight line in impedance fitted by least squares, with the 80 percent prediction interval of a new
          value: the volumes are porosity at Q10, Q50 and Q90. Facies are classified the Bayesian way: a Gaussian or kernel
          density of impedance per facies, priors from the wells&apos; proportions or equal, and the probability of each facies
          with the most likely one. A facies named for a fluid (gas, oil, brine) is labelled a fluid hypothesis.
        </Para>
        <Para>
          Calibrate and check before predicting the volume: each well is left out, the model is refitted on the others, and the
          well is predicted from the inverted impedance at its trace. Porosity reports the RMS error, the correlation and how
          much of the well falls inside Q10 to Q90 (about 80 percent is right); facies report the share predicted correctly. A
          poor correlation, a poor facies score or an interval that covers under 60 or over 95 percent is offered to the
          issue register.
        </Para>
      </GuideSection>

      <GuideSection id="prospects">
        <SectionHeading icon={MapPin}>Prospects</SectionHeading>
        <Para>
          Add a prospect on a depth surface from the registry. The crest is found by climbing from a point you give, or
          from the highest node, and the trap is flooded to its spill point with Mapping &amp; Surface Studio&apos;s closure
          engine: crest and spill depths, column, closure area and GRV. A spill on the edge of the mapped area is flagged,
          because the trap may go on off the map.
        </Para>
        <Para>
          Choose an attribute map and a threshold to mark the anomaly; only the patches that reach into the closure are kept.
          A hydrocarbon anomaly ends downdip at a contact, so its downdip edge should follow one depth contour: the fit is 1
          minus the scatter of the edge depths over the closure relief, with the share of the anomaly inside the closure
          and the contact the edge implies. List the evidence with the response each item comes from: two attributes of the
          same full stack count as one. Mark each competing explanation open, ruled out or likely.
        </Para>
        <Para>
          The recommendation follows a fixed table. Mature needs a fit of 0.7 or more, two independent supporting responses,
          no competing explanation open or likely, and a target the feasibility study says is visible. With no anomaly, the
          prospect is downgraded only where the feasibility study says the hydrocarbon case would be visible; otherwise it is
          retained. QI does not set the chance of success: open the prospect in Risked Reserves Valuation from its row and the
          QI evidence is shown there beside it, read only.
        </Para>
      </GuideSection>

      <GuideSection id="handover">
        <SectionHeading icon={PackageCheck}>Handover</SectionHeading>
        <Para>
          Every finished inversion and property run has a SEG-Y button per volume: the seismic worker writes SEG-Y rev 1
          (IEEE float, big-endian, inline at byte 189, crossline at 193, CDP X and Y at 181 and 185 with a scalar at 71),
          leaves out the traces outside the survey and writes null samples as 0. The download link lasts 24 hours and the
          file is removed after 3 days; export again when you need it.
        </Para>
        <Para>
          The run record button saves what the run was: the job, its settings, the wells and horizons it used (long logs
          as a count and a fingerprint), the engine version, the volumes it wrote and the checks it made. Wavelets download
          as text from the Well ties tab, and the edited logs as LAS from Well Data Manager. A saved QI Studio project travels
          in a Petrolord project package (.pld) like any other saved project.
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
