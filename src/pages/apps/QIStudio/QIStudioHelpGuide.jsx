// QI Studio in-app help guide (QI programme Q1 / A4, 2026-10-06), on the
// shared HelpGuideLayout shell. The inventory groups and the usability items
// are quoted from the live services so the guide cannot drift.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.
import React from 'react';
import LocalWorkspaceHelp, { LOCAL_WORKSPACE_SECTION } from '@/components/localWorkspace/LocalWorkspaceHelp';
import { BookOpen, Zap, ClipboardList, Grid3x3, AlertTriangle, Scale, FileText, Share2, Activity, Layers, Gauge, MapPin, PackageCheck, Rows, TrendingDown, Combine, MapIcon } from 'lucide-react';
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
  { id: 'qc-additions', icon: Activity, title: 'More seismic QC' },
  { id: 'prestack', icon: Rows, title: 'Prestack gathers and angle stacks' },
  { id: 'gathers', icon: Rows, title: 'Gather viewer' },
  { id: 'avo', icon: TrendingDown, title: 'AVO' },
  { id: 'inversion', icon: Layers, title: 'Impedance inversion' },
  { id: 'simultaneous', icon: Combine, title: 'Simultaneous inversion' },
  { id: 'properties', icon: Gauge, title: 'Property prediction' },
  { id: 'prospects', icon: MapPin, title: 'Prospects' },
  { id: 'issues', icon: AlertTriangle, title: 'Issue register' },
  { id: 'feasibility', icon: Scale, title: 'Feasibility per target' },
  { id: 'handover', icon: PackageCheck, title: 'Handover' },
  { id: 'report', icon: FileText, title: 'The report' },
  LOCAL_WORKSPACE_SECTION,
  { id: 'sharing', icon: Share2, title: 'Saving and sharing' },
  { id: 'maps', icon: MapIcon, title: 'Maps from volumes' },
];

function QIStudioHelpGuideContent() {
  return (
    <HelpGuideShell
      title="QI Studio Help Guide"
      subtitle="Quantitative interpretation, from the data audit to the prospect assessment"
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
        <Para>QI Studio opens with a QI Studio licence, or with the Geoscience module, which includes it.</Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (10 min)</SectionHeading>
        <Step n={1} title="Create a project">Give the study a name in the project box. Without a project the work stays on the page only.</Step>
        <Step n={2} title="Setup">Tick the wells and the target intervals (zone names shared by the wells), the seismic volumes, the date the seismic was acquired and each well&apos;s first production date. A depth volume imported into Seismolord is listed but cannot be ticked: every QI tool works in two-way time.</Step>
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
          For each volume chosen on Setup, Run QC on the server works on the seismic worker. It samples 12 inlines
          spread across the survey and measures, in three time windows: the average amplitude spectrum, its peak and the band within 6 dB of the
          peak; and the signal-to-noise ratio from how alike neighbouring traces are (Hatton and others, 1986: for a
          correlation c between neighbours, signal-to-noise is c / (1 - c)), from 64 traces of each sampled inline for the
          spectra and up to its first 200 crosslines for the signal-to-noise. On RMS amplitude maps of every trace around three
          times it looks for an acquisition footprint: a stripe that repeats every few lines.
        </Para>
        <Para>
          A stripe is reported when one period and its harmonics hold over 30 percent of the map profile&apos;s
          variance, stand at least ten times above the band&apos;s median power, and repeat at least five times across
          the survey. Signal-to-noise below 1 is a high-severity issue and below 3 a medium one; a band narrower than
          10 Hz, a footprint, and a dominant frequency that falls by 40 percent with depth are flagged too. Add the QC
          issues to the register with one click; the results are kept with the project and printed in the report.
        </Para>
      </GuideSection>

      <GuideSection id="qc-additions">
        <SectionHeading icon={Activity}>More seismic QC: multiples, amplitudes, alignment</SectionHeading>
        <Para>Seismic QC now also reads each window&apos;s autocorrelation for periodic energy: a peak that repeats near twice its lag is the signature of a multiple train (water-bottom or peg-leg), and it is offered to the issue register. A narrow spectral spike under a broad spectrum (the centroid well above the band around the peak) is reported as a spike, not a narrow band.</Para>
        <Para>On the AVO tab, after Compare at the wells, Check amplitude preservation at the wells samples each stack at the wells&apos; zone tops and fits the seismic over the modelled amplitude as exp(c + k sin^2 theta) per well. A shared k over 0.5 means the amplitudes change with angle against the model, so the processing may not have preserved relative amplitudes, and an AVO gradient would read that as geology.</Para>
        <Para>On the Well ties tab, Depth alignment between wells takes a horizon on the first study volume and the zone top it follows, and gives each well&apos;s mistie (the horizon time at the well minus the top&apos;s time through the well&apos;s tie). A well more than the tolerance (8 ms) from the median is flagged; a shift every well shares is a datum or tie matter for the study.</Para>
      </GuideSection>

      <GuideSection id="prestack">
        <SectionHeading icon={Rows}>Prestack gathers and angle stacks</SectionHeading>
        <Para>
          Upload the CDP gather SEG-Y with Seismolord&apos;s import: a large file goes to the seismic worker&apos;s store. If you
          try to import a gather file as a stack, Seismolord says it looks like gathers and points here. On the Prestack tab,
          Build gathers reads the file twice, straight through, and keeps every CDP&apos;s gather in offset bins of the width you
          set, with its fold. The file must be sorted by inline, then crossline, and the gathers are taken as NMO-corrected.
        </Para>
        <Para>
          Gathers can be cropped while they are read, with the same saved crop as the stacks (Seismolord&apos;s Crop before
          importing): every trace of each kept location and the same time window are uploaded, and the gather store puts
          the window back at its own times so it lines up with the cropped stacks.
        </Para>
        <Para>
          Make angle stacks with an RMS velocity table (a time in ms and a velocity in m/s per row) and three named angle
          ranges (near, mid and far by default; edit their limits). Each offset bin&apos;s incidence angle at each time is Walden&apos;s straight-ray estimate, which stays within 1.5
          degrees of an exact ray trace up to an offset equal to the depth. A stack is the fold-weighted mean of the bins whose
          angle falls in its range. The usable angle of each CDP is the widest angle reached with the least fold you set, averaged down the trace, shown
          across the survey as its 10th, 50th and 90th percentiles. Convert each stack into a Seismolord volume with one button:
          it goes through the same server import as any large SEG-Y.
        </Para>
        <Para>
          QC the gathers before stacking: on about 1,500 CDPs sampled across the store, the residual moveout at the far offset
          at three event times (each offset&apos;s shift against the near traces, by cross-correlation, fitted with a parabola in
          offset), the fold and the far covered offset, and, with the velocity table, the offset beyond which NMO stretch passes
          30 percent. Residual moveout over 4 ms at the 90th percentile, stretch inside the covered offsets, and low fold over a
          tenth of the survey are offered to the issue register.
        </Para>
        <Para>
          Trim statics flattens the gathers around an event you give: each trace of every gather is shifted onto that
          gather&apos;s own stack in the window, with the shifts capped, and the result is a new gather store beside the first,
          with how much flatter it came out. Judge the trim against the synthetic gathers at the wells, never only by how
          clean the gathers look.
        </Para>
        <Para>
          Conditioning removes multiples and random noise from a gather store, again written as a new store beside the
          input, with what was removed as a third store when you keep it. Compare the three on the Gathers tab before you
          make angle stacks. Radon demultiple models each NMO-corrected gather as events with parabolic residual moveout;
          multiples, under-corrected by the primary velocity, sit at large moveout, so everything past the cut (in ms at the
          far offset) is rebuilt and subtracted, and the primaries never pass through the transform. AVO terms give each
          moveout an intercept and a gradient, so a primary whose amplitude changes with offset stays at zero moveout; high
          resolution reweights the transform toward its strongest moveouts; the gather is worked in overlapping time windows.
          On the test gathers this removed over 20 dB of multiple energy with isolated primaries&apos; intercepts within 2
          percent and gradients within 5 percent. A multiple that starts on a primary is the hard case: its intercept came
          back within 6 percent and its gradient within 14, from 40 percent or more before. Radon costs about a second per
          gather, so try an area first (an inline and crossline range; the CDPs outside are left out of the new store).
        </Para>
        <Para>
          f-x noise attenuation predicts each frequency slice from trace to trace across the offsets and keeps the
          predictable part. Random noise is not predictable, so it drops by 4 to 6 dB on the test gathers. The prediction
          weakens a noisy event a little: intercepts came back 2 to 7 percent low at signal-to-noise of 6 to 0 dB and within
          1 percent on clean data, so use it where noise hides the events, and check the AVO at the wells afterwards. The
          report lists each run with its settings and the energy removed in each quarter of the trace.
        </Para>
      </GuideSection>

      <GuideSection id="avo">
        <SectionHeading icon={TrendingDown}>AVO</SectionHeading>
        <Para>
          Choose two or three angle stacks on one lattice and give each its mean incidence angle. At every sample a two-term
          Shuey fit, R = A + B sin squared of the angle, gives the intercept A and the gradient B. The Smith and Gidlow fluid
          factor comes from A and B with Gardner&apos;s density and the Vs/Vp you set: it is near zero along the mudrock line and
          negative for gas. The chi projection A cos(chi) + B sin(chi) is the reflectivity of an extended elastic impedance
          at that chi. Keep the stacks within about 30 degrees: past that a two-term fit biases the gradient, which is gated in
          the engine.
        </Para>
        <Para>The stacks must be balanced against each other, since A, B and the fluid factor carry their amplitude scale. The products are elastic estimates and open in Seismolord.</Para>
        <Para>
          Balance the spectra before matching: far stacks carry lower frequencies, so the same interface looks different on
          each. One zero-phase operator per stack takes its mean amplitude spectrum (about 300 traces across the survey) to
          the reference stack&apos;s, or to flat inside a band, with the boost capped where a stack has little energy. Each stack
          keeps its own energy in the band, and one operator for every trace keeps each trace&apos;s amplitude relative to its
          neighbours (a trace twice as bright stays exactly twice as bright), so AVO still reads the differences. The table
          shows each stack&apos;s band centroid and half-power band before and after, and the chart shows the operators. On the
          test stacks a 20 Hz far stack came out correlating over 0.93 with the same geology through the 35 Hz near
          wavelet, from under 0.8.
        </Para>
        <Para>
          Then match the stacks: each stack is brought onto a reference stack in time shift and constant phase together,
          then in amplitude, with one operator per stack for the whole survey (the median shift and scale and the circular
          mean phase of about 300 traces). A per-trace match would remove the very amplitude differences AVO reads, so the
          survey operator is the one applied. The matched stacks join the study&apos;s volumes for AVO and the simultaneous
          inversion.
        </Para>
        <Para>
          At the wells, Compare reads Rock Physics Studio&apos;s published gather of each study well (its zone, in situ and fluid
          substituted), takes the zone top to time through the well&apos;s tie, and reads the intercept and gradient volumes at
          the well&apos;s trace, at the event within 8 ms of that time. One least-squares scale over every well ties the volumes to
          reflectivity. The table and the intercept-gradient crossplot show each well&apos;s model beside its scaled seismic, with the
          AVO class of each. A class that differs, or a scale below zero (a polarity problem), is offered to the issue register.
        </Para>
              <SubHeading>Terms, calibration and classes</SubHeading>
        <Para>Under the products, Terms, calibration to reflectivity and class volumes sets three things. Shuey terms: two (the default), three, or three where the angles allow (three stacks or more, the farthest at 35 degrees or more), which adds the curvature C as a product. To reflectivity: as the stacks are, one scale from the wells, or a scale field from the wells, where each well&apos;s own scale (from Compare at the wells) is spread over the map by inverse distance or kriging, so a survey whose amplitude scale drifts is calibrated trace by trace and each well keeps its own scale. With a calibration, the AVO class volume holds the class of each sample, 1 to 4 for classes I to IV, by the same classifier Rock Physics Studio uses; it is an interpretation.</Para>
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
        <Para>
          A pilot run tries the settings on a small area before the whole survey. Tick Pilot run under the run buttons
          (here, on the Simultaneous tab and on the AVO tab) and give an inline and crossline range and a time window, or
          pick a crop saved in Seismolord. The worker processes and writes only that sub-volume, so it is quick and uses
          little storage. The output is named and labelled as a pilot and is empty outside the area. Inside the area it
          matches a full run, because every trace is still processed over its whole length. Property runs on a pilot
          impedance volume keep to its area. The report lists the pilot runs with their areas.
        </Para>
        <SubHeading>Low-frequency model options</SubHeading>
        <Para>
          Open Low-frequency model options under the wells to change how the model is spread between the wells. Kriging
          uses a variogram (spherical, exponential or gaussian) with the range you give in metres, in place of inverse
          distance. Faults picked in Seismolord on this volume can be ticked: the model never averages wells on the two sides
          of a fault (a trace whose every well is cut off falls back to all of them). A velocity trend reads a velocity
          volume on the same lattice, in two-way time (interval velocity, or RMS velocity taken to interval by Dix), maps it
          to impedance by a straight line in ln V fitted at the wells, and adds back each well&apos;s difference from it, so the
          model follows the velocity away from the wells and returns each well at its own trace. In the blind check the
          held-back well is left out of that fit too.
        </Para>
        <Para>
          Compare model scenarios at the wells runs the blind check once per scenario (inverse distance, kriging, with the
          faults, the velocity trend) and lists each scenario&apos;s mean blind error and the calibration line; the report prints
          the table. The chosen options apply to the checks and runs below. The uncertainty run uses the wells-only or kriged
          model.
        </Para>
        <SubHeading>Truly blind wells</SubHeading>
        <Para>
          A well held back in the blind check is left out of everything the inversion learns from the wells: the
          low-frequency model, the wavelet scale (for coloured inversion, the operator&apos;s impedance and seismic spectra) and,
          with the field wavelet, the wavelet average itself, which is rebuilt from the other ties. The with-well column is
          the full inversion. If the wavelet is one well&apos;s own tie wavelet, that well&apos;s blind result is not independent of
          the wavelet, and the line under the table says so. Results from before this change say they held the well out of
          the model only. A volume run records each well&apos;s held-back estimate, so the property check can use it.
        </Para>
        <Para>
          Tick Also write the seismic residual (absolute methods) to get a second volume: the seismic minus the synthetic of
          the inverted impedance through the same scaled wavelet. Where the inversion explains the seismic it is small;
          energy left in it marks what the model could not fit. The blind result also gives the residual at each well as a
          percentage of the seismic RMS.
        </Para>
      </GuideSection>

      <GuideSection id="simultaneous">
        <SectionHeading icon={Combine}>Simultaneous inversion</SectionHeading>
        <Para>
          The Simultaneous tab inverts three to five angle stacks for acoustic impedance, shear impedance and density at once,
          with Fatti&apos;s three-term reflectivity. Read the wells: each needs a sonic, a density and a shear sonic, and the
          shear and density go to time through the same tie as the impedance. Each parameter is pulled to its own
          low-frequency model from the wells along your horizons. The tie wavelet is scaled to the stacks at the wells.
        </Para>
        <Para>
          Density is the least resolved: give at least one stack past 25 degrees. The engine is gated against pylops, and with
          the near angles alone the density detail is lost, which is its negative control. Check at the wells first: each well
          is left out of all three models in turn, and the table gives the blind AI, SI and density errors with the density
          correlation. Invert the stacks to write AI, SI, density and Vp/Vs volumes; the AI one feeds Property prediction like
          a post-stack impedance.
        </Para>
        <Para>
          Angle wavelets from the wells extracts one wavelet per stack: at each well, by least squares against the Fatti
          reflectivity of its logs at that stack&apos;s angle, then aligned and averaged across the wells. Far stacks usually come
          out at a lower frequency (absorption and NMO stretch). The table gives each wavelet&apos;s peak frequency and phase, and
          each well&apos;s synthetic against the stack: the synthetic-against-real check by angle. With Use one wavelet per stack,
          the inversion takes them in place of the single tie wavelet.
        </Para>
        <Para>
          The blind check here is truly blind too: a held-back well is out of all three models, the wavelet scale, the
          background Vs/Vp (unless you typed it), and the wavelet average (the angle wavelets or the field wavelet are
          rebuilt from the other wells). Add the blind results to the issue register with the button under the table: an AI
          or SI error over 10 percent, a density correlation under 0.5, or a density error over 10 percent.
        </Para>
        <SubHeading>Settings and the density gate</SubHeading>
        <Para>
          Under Settings you can change the pull of AI, SI and density to their models (0.05 each by default; a larger pull
          keeps that parameter closer to its model), the low-frequency model cut, and the background Vs/Vp of the
          linearisation (blank takes the wells&apos; mean, shown beside the box). A cleared box holds the run with a message.
        </Para>
        <Para>
          The density gate decides whether a density volume is written, and says why under the blind table. Density is
          written when the farthest stack reaches 25 degrees and the blind density correlation at the wells (the median, over
          two wells or more) reaches the gate, 0.5 by default. Otherwise the run still writes AI, SI and Vp/Vs, and density
          is left out with its reason. Stacks that all sit under 25 degrees no longer stop the run.
        </Para>
        <Para>
          Tick Also write each stack&apos;s seismic residual to get, for every stack, the stack minus the synthetic of the
          inverted logs through the same wavelet and Fatti operator. The line under the blind table gives the residual at each
          well as a percentage of each stack&apos;s RMS: structured energy left in the residual is what the inversion could not fit.
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
          with the most likely one. A facies named for a fluid (gas, oil, brine) is labelled a fluid hypothesis. From a
          simultaneous inversion, facies can be classified in AI and Vp/Vs together: that is what tells a gas sand from a shale
          of the same impedance. The wells then need a shear sonic, and the Vp/Vs volume of the same run is used beside the AI.
        </Para>
        <Para>
          Calibrate and check before predicting the volume: each well is left out, the model is refitted on the others, and the
          well is predicted from the inverted impedance at its trace. Porosity reports the RMS error, the correlation and how
          much of the well falls inside Q10 to Q90 (about 80 percent is right); facies report the share predicted correctly. A
          poor correlation, a poor facies score or an interval that covers under 60 or over 95 percent is offered to the
          issue register.
        </Para>
        <Para>
          The check is blind. A well is left out of the property model, and it is predicted from the inversion run with that
          well held back (the estimate the inversion volume recorded at it), or from the volume where the inversion never
          used the well. An impedance volume made before 2026-10-15 holds no held-back estimate; the check then names the
          wells where it is not blind and offers an issue to rerun the inversion.
        </Para>
        <SubHeading>Net-to-gross and water saturation</SubHeading>
        <Para>
          Predict also offers net-to-gross and water saturation from impedance, beside porosity, each as Q10, Q50 and Q90
          held within 0 and 1. Net-to-gross reads an NTG or net-flag curve (NTG, NET, NET_FLAG, NETSAND, PAYFLAG and similar);
          a well without one gets a net flag from its shale volume and porosity with the cutoffs you set (Vsh at most 0.4 and
          porosity at least 0.08 by default), named in the wells table. Water saturation reads the SW curve. Water saturation
          from the seismic is labelled a fluid hypothesis.
        </Para>
        <Para>
          Each is written only when its blind check passes the gate: the check must be fully blind, at two wells or more, and
          every well left out must correlate at the set value or more (0.5) with the set share of the well inside Q10 to Q90
          (60 to 95 percent). Until it passes, Predict the volume stays off and the line under the check says why; change
          the gate and the line follows. Porosity is not gated, as before.
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
              <SubHeading>Depth uncertainty and a suggested Pg</SubHeading>
        <Para>Under the prospects, each analysed prospect has a Depth uncertainty block. Choose its time structure from the surface registry and give velocity cases (a constant average velocity, or v0 + k z, each with a weight; Slow, Mid and Fast to start). Convert and close each case takes the structure to depth under every case, finds the crest and spill point on each, and gives the GRV to spill per case, its low and high, and weighted Q10, Q50 and Q90 for ranking. Give your own Pg and the block suggests a change from the QI assessment by a stated rule: times 1.3 when the QI matures the prospect with conformance of 0.7 or more and a feasible target, times 0.7 when it argues against, otherwise no change, held within 0.01 and 0.9. It is a suggestion for discussion; you set Pg in Risked Reserves Valuation.</Para>
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
        <SubHeading>Objectives and decisions</SubHeading>
        <Para>Write the study's objectives and acceptance criteria on Setup, under the three setup cards: what the study must deliver and how a result will be judged, for example the blind-well error a product must meet before it is used. A line per target is optional.</Para>
        <Para>Under the issue register, record each decision taken at a gate of the study: the gate (Data QC, Feasibility, Pilot or one you name), the outcome and the decision, who took it, the date, and the run or check it rests on (any blind-well check, inversion, property check or other run the study holds, or a version you type). Decisions are records for the report. Nothing is locked and no sign-off is enforced; a decision never counts as an issue.</Para>
        <Para>The report prints the objectives after the summary and the decisions after the issue register; the summary says how many decisions were recorded and the latest one.</Para>
      </GuideSection>

      <GuideSection id="gathers">
        <SectionHeading icon={Rows}>Gather viewer</SectionHeading>
        <Para>The Gathers tab shows the gathers of a worker gather store: one CDP (the centre one if you leave the inline and crossline blank), part of an inline or crossline (up to 24 gathers, with a step), or the gathers at the study wells (each well at the middle of its first study target, or at its surface location). Show one CDP first so the store's line numbers are known. A time window shortens the panel. When a store was trimmed on the Prestack tab, pick the trimmed copy under Beside it to see the two side by side.</Para>
        <Para>The overlays come from the velocity table (the one used for this store's angle stacks when there is one): angle contours at 10, 20, 30 and 40 degrees (Walden's straight ray), the stretch-mute line at the stretch limit you set, and an angle mute line. Residual moveout is measured on the shown gather at the event times (the prestack QC times, or the times you type): green picks and the fitted parabola where the event is coherent across the nearer offsets, grey picks where it is not. Where the prestack QC sampled the CDP, its stored reading is drawn too (orange) and listed beside the live one. Gathers are taken as NMO-corrected, as the store records; a store recorded as not corrected is shown NMO-corrected with the velocity table, which you can switch off.</Para>
        <Para>The worker writes each panel to its store for six hours with a two-hour link; showing the gathers again makes a new one. Only your own stores can be viewed.</Para>
      </GuideSection>

      <GuideSection id="feasibility">
        <SectionHeading icon={Scale}>Feasibility per target</SectionHeading>
        <Para>For each target record a verdict (feasible, feasible with conditions or not feasible) and the reasoning: which properties separate the cases, whether the change is detectable against tuning and noise, and the recommended route. The evidence is built in Rock Physics Studio (fluid substitution, rock model lines, the multi-well crossplot).</Para>
        <SubHeading>Automatic feasibility sweeps</SubHeading>
        <Para>Under the target cards, open a target&apos;s automatic feasibility sweep. Give the base rock (porosity, shale volume, net-to-gross, thickness), the stresses (overburden and pore pressure give the effective stress), the reservoir temperature and brine salinity, the hydrocarbon (gas gravity, or oil API and GOR), the shale, the wavelet peak and the signal-to-noise ratio (the seismic QC median is a good start). The sand is modelled with a soft or stiff sand model and Gassmann, thin-bedded with the shale by Backus averaging, and set in the shale under a Ricker wavelet. Each row varies one of porosity, shale volume, effective stress or thickness and gives d&apos;, how far apart the brine and hydrocarbon amplitudes are against the noise (the brine amplitude of a thick bed over the signal-to-noise ratio), at normal incidence and 30 degrees, and the chance one measurement lands in the wrong case. The cases separate at d&apos; of 2.</Para>
        <Para>The sweep suggests a verdict: feasible when the base case separates, feasible with conditions when only some swept values do (the ranges are named), not feasible when none does. Use the suggested verdict or add its text to the reasoning; nothing changes until you do. The report prints each target&apos;s sweep, and a Feasibility decision can refer to it.</Para>
      </GuideSection>

      <GuideSection id="report">
        <SectionHeading icon={FileText}>The report</SectionHeading>
        <Para>The Report tab builds the quantitative interpretation report: an executive summary, the inventory, the usability matrix with the reasons for every limited or missing item, depletion notes, the well ties, the AVO volumes and angle wavelets, the prospect QI assessment, the handover list, the issue register (dismissed issues left out), the feasibility of each target and the assumptions behind them. The data section names where each seismic volume came from: its source file, its original geometry and the crop it was cut to before upload; pilot runs are listed with their areas.</Para>
      </GuideSection>

      <LocalWorkspaceHelp />

      <GuideSection id="sharing">
        <SectionHeading icon={Share2}>Saving and sharing</SectionHeading>
        <Para>A project saves 10 seconds after your last change once it is created. Saving needs the QI Studio projects table on the database; until it is switched on the page says so and the work stays on screen.</Para>
        <SharingHelp record="project" where="The sharing control is under the project box once the project is saved." />
      </GuideSection>

      <GuideSection id="maps">
        <SectionHeading icon={MapIcon}>Maps from volumes</SectionHeading>
        <Para>
          The Maps tab turns a volume into maps over a zone: between two horizons, or a horizon and a window below it. Pick
          the volume (a stack, an impedance, the Q10, Q50 and Q90 of an uncertainty run, or a facies probability), tick the
          maps and choose the zone. The seismic worker computes every trace&apos;s statistic over the zone.
        </Para>
        <Table
          headers={['Map', 'What it shows']}
          rows={[
            ['Property map', 'The zone mean of a Q50 volume (porosity, impedance), or the zone mean of any volume.'],
            ['Confidence map', 'The zone mean of Q90 minus Q10: the width of the 80 percent band. Narrower is more confident. The relative spread divides it by Q50.'],
            ['Probability map', 'The zone mean of a facies probability, which is the expected share of the zone in that facies; the highest probability in the zone; or the share of the zone where the probability is over a cutoff.'],
            ['Zone statistics', 'Mean, RMS, minimum, maximum, and the share of the zone above or below a cutoff.'],
          ]}
        />
        <Para>
          The zone takes the samples from the top pick to the base pick, rounded to the nearest sample, the same window as
          Seismolord&apos;s interval attributes. Save the maps to the surface registry: each becomes an attribute surface of the
          stack, gridded on the survey&apos;s own cell, with its unit and the zone in its name. Seismolord lists them under the
          stack&apos;s Surfaces and Mapping &amp; Surface Studio opens them; both export XYZ, CPS-3, ZMAP+ and Irap grids. The
          report lists the maps with their ranges.
        </Para>
              <SubHeading>AVO class maps</SubHeading>
        <Para>Every AVO product can be mapped like any volume, and each AVO run with an intercept and a gradient offers an AVO class map under AVO classes: the class (1 to 4 for I to IV) of the zone means of A and B, by the classifier Rock Physics Studio uses. A run computed with a calibration is already in reflectivity; otherwise Compare at the wells on the AVO tab first, and its scale takes A and B to reflectivity. Class maps are gridded by the nearest trace so classes are never blended, and are saved as interpretations.</Para>
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
