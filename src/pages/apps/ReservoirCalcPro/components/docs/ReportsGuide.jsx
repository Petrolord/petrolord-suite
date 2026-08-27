import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const ReportsGuide = () => (
  <Article
    title="Reports, Slides and Exports"
    lead="ReservoirCalc Pro produces branded PDF reports, 16:9 presentation slides, and several data exports. Every one of them is generated in the browser from the results already on screen, so what you export is exactly the case you ran."
  >
    <H2>Where the export controls live</H2>
    <P>
      Open the Results window after a run. It has two views, switched from the toggle in its header.
    </P>
    <UL>
      <li>
        <strong>Presentation.</strong> A fixed 16:9 slide with a toolbar carrying <Code>Copy image</Code>,
        <Code>Download PNG</Code> and <Code>Full PDF</Code>.
      </li>
      <li>
        <strong>Detailed.</strong> The full tables and charts. For a probabilistic run this view also carries
        the report template selector and its own <Code>Export PDF</Code> button.
      </li>
    </UL>
    <P>
      The header of the Results window shows which project and which reservoir the results belong to, and
      those two names are carried into the report header and into every export filename.
    </P>

    <H2>The two PDF generators</H2>
    <P>
      Deterministic and probabilistic runs are written by separate generators. They share the branded header
      and footer and nothing else.
    </P>

    <H3>Deterministic report</H3>
    <P>
      Produced by the <Code>Full PDF</Code> button on the deterministic presentation slide. It is a single
      fixed layout with no template choice, containing:
    </P>
    <UL>
      <li>A KPI band showing STOOIP, GIIP (when gas is present) and gross rock volume.</li>
      <li>An input parameters table: NTG, porosity, Sw, then Bo, OWC and oil recovery factor for oil, and Bg, GOC and gas recovery factor for gas.</li>
      <li>A volumetrics table: gross rock volume, net rock volume, pore volume, hydrocarbon pore volume, STOOIP, recoverable oil, GIIP and recoverable gas.</li>
      <li>An input quality check carrying the consistency score out of 100 and every warning the validator raised.</li>
      <li>A methodology block with the HCPV, STOOIP and GIIP expressions actually used for your unit system.</li>
    </UL>
    <P>
      Filename: <Code>Project_Reservoir_deterministic_report.pdf</Code>, with spaces replaced by
      underscores.
    </P>

    <H3>Probabilistic report</H3>
    <P>
      Produced by <Code>Export PDF</Code> in the Detailed probabilistic view, using whichever of the three
      templates is selected next to that button. The <Code>Full PDF</Code> button on the probabilistic slide
      writes the same report and always uses the Technical template.
    </P>
    <P>
      The charts are captured from what is on screen at the moment you export. The Detailed view supplies all
      three (histogram, expectation curve and tornado), and the slide view supplies the expectation curve and
      the tornado, so a report exported from the slide carries those two.
    </P>
    <P>
      Filename: <Code>Project_Reservoir_&lt;template&gt;_report.pdf</Code>, where <Code>&lt;template&gt;</Code> is
      <Code>executive</Code>, <Code>technical</Code> or <Code>audit</Code>.
    </P>

    <H2>The three probabilistic templates</H2>
    <P>
      Each tier is a superset of the one before it. Choosing Audit gives you everything Technical has, plus
      the audit sections.
    </P>
    <Table
      headers={['Template', 'Label in the app', 'What it contains']}
      rows={[
        [
          <Code key="e">executive</Code>,
          'Executive Summary',
          'One page for a decision meeting: the P90 / P50 / P10 KPI band, a short statistics table (mean, median P50, P90 and P10, standard deviation), and the volume histogram.',
        ],
        [
          <Code key="t">technical</Code>,
          'Technical Report',
          'Adds the full statistics table (minimum and maximum, and the P10 to P90 ratio), all three charts (histogram, expectation curve and sensitivity tornado), and the parameter sensitivity table with variance share, impact direction and the low and high P50 swings per parameter.',
        ],
        [
          <Code key="a">audit</Code>,
          'Detailed Audit',
          'Adds simulation diagnostics (iterations requested, valid realisations, rejected out-of-bounds count with its percentage, and any diagnostic warnings), the representative P50 realisation inputs, and the methodology and assumptions notes.',
        ],
      ]}
    />

    <H3>What the audit sections give you</H3>
    <UL>
      <li>
        <strong>Simulation diagnostics.</strong> The rejection percentage tells a reviewer how much of the
        sample was thrown away against your truncation bounds. Anything above 5 percent also appears as a
        warning row.
      </li>
      <li>
        <strong>Representative P50 realisation.</strong> The single set of sampled inputs (area, thickness,
        NTG, porosity, Sw, Bo, Bg) taken from the realisation that sits at the median of the sorted target
        volume. It lets a reviewer reproduce a plausible mid case by hand.
      </li>
      <li>
        <strong>Methodology and assumptions.</strong> States the Gaussian copula sampling, the marginal
        families available, the default porosity to water saturation correlation of -0.8, the rejection rule
        for unbounded marginals, the volumetric expressions, and the petroleum P90 to P10 convention.
      </li>
    </UL>

    <H2>The branded header</H2>
    <P>
      Every page of both report types opens with a slate banner carrying the Petrolord mark, the
      title <strong>Petrolord Suite - ReservoirCalc Pro</strong>, and a subtitle naming the report type
      (for probabilistic reports the subtitle also names the template). On the right the banner carries three
      lines:
    </P>
    <UL>
      <li><strong>Project</strong>, taken from the project metadata name.</li>
      <li><strong>Reservoir</strong>, taken from the active reservoir name, omitted when there is none.</li>
      <li><strong>Date</strong>, the local date at the moment the PDF is generated.</li>
    </UL>
    <P>
      Long project and reservoir names are measured against the space left beside the banner title and are
      truncated with an ellipsis so they can never overlap it. Each page also carries a footer with the page
      number and the Petrolord Suite mark.
    </P>
    <Note tone="info" title="Reports are snapshots">
      A report is written from the results object, which echoes back the inputs used at calculation time. If
      you edit an input after running and then export without re-running, the PDF still describes the run
      that produced the numbers.
    </Note>

    <H2>Presentation slides</H2>
    <P>
      The Presentation view renders a fixed 1280 by 720 logical slide on a white background. The on-screen
      preview is scaled to fit the window, and the capture always happens at true size, so the preview scale
      never affects the output.
    </P>
    <UL>
      <li>
        <strong>Download PNG.</strong> Captures the slide at 2x, giving a 2560 by 1440 PNG, and saves it.
      </li>
      <li>
        <strong>Copy image.</strong> Renders the same bitmap and writes it to the clipboard so you can paste
        it straight into PowerPoint or Keynote. Where the browser exposes no clipboard image support, the app
        falls back automatically and downloads the identical PNG instead, and the toast tells you it did so.
      </li>
      <li>
        <strong>Full PDF.</strong> Runs the matching PDF generator described above.
      </li>
    </UL>
    <P>
      Slide filenames are built from the project and reservoir names with spaces replaced by underscores:
      <Code>Project_Reservoir_volumetrics.png</Code> for a deterministic run
      and <Code>Project_Reservoir_probabilistic.png</Code> for a probabilistic one. The toolbar itself is
      outside the captured area and never appears in the image.
    </P>

    <H2>The other export routes</H2>
    <Table
      headers={['Export', 'Where', 'Output']}
      rows={[
        [
          'Audit trail CSV',
          'Audit Trail panel, Export CSV',
          <span key="a">
            <Code>reservoircalc_audit.csv</Code> with columns Timestamp, Action, Details and User. Timestamps
            are written in full ISO form, and every field is quoted.
          </span>,
        ],
        [
          'Surface XYZ',
          'Data Manager, download icon on a surface row',
          <span key="b">
            <Code>Surface_name.xyz</Code>, one point per line as space separated X, Y and Z in the exact
            coordinates the surface holds. No header, and no unit conversion is applied.
          </span>,
        ],
        [
          'Workspace JSON',
          'Collaboration panel, Export workspace file, and the Export action on each row of the saved project list',
          <span key="c">
            <Code>Project_name_v&lt;version&gt;.json</Code>, a self-contained project file carrying inputs,
            surfaces, AOIs, generated maps, deterministic and Monte Carlo results, every reservoir case in the
            project, and the audit trail.
          </span>,
        ],
      ]}
    />
    <P>
      The workspace JSON is the file a colleague imports from the Projects panel. See the Collaboration guide
      for the full round trip.
    </P>

    <H2>A practical export sequence</H2>
    <OL>
      <li>Run the deterministic base case and confirm the quality score and warnings are acceptable.</li>
      <li>Run the Monte Carlo study with base-case consistency mode on.</li>
      <li>Open Results, stay on Presentation, and use Copy image for the slide that goes in the deck.</li>
      <li>Switch to Detailed, choose Detailed Audit, and export the PDF that goes in the project file.</li>
      <li>Export the audit trail CSV, then save the project so the trail persists with it.</li>
    </OL>
    <Note tone="warn" title="Screening estimates">
      Both PDF generators print the same caution in their methodology block: these are screening volumetric
      estimates. Confirm them against reservoir simulation before using them for reserves booking.
    </Note>
  </Article>
);

export default ReportsGuide;
