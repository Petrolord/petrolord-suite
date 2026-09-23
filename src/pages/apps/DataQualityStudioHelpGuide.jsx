// In-app help guide for the Data Quality Studio (Data & AI D1).
//
// Sourced from the engine itself (the basis strings and flag rules
// engines/dataai/quality.js returns) and from its validation record,
// packages/engines/tools/validation/dataai/FINDINGS-quality.md. Where this
// guide states an equation, a constant or a convention, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BarChart3, BookOpen, CheckCircle2, Database, Filter, Fingerprint, Gauge, Layers, ListChecks, Sigma, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { QC_STUDIO_ROUTE } from '@/utils/dataAi/qcRun';

export const QC_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'data', icon: Database, title: 'Where the data comes from' },
  { id: 'completeness', icon: Layers, title: 'Completeness' },
  { id: 'validity', icon: ListChecks, title: 'Validity' },
  { id: 'consistency', icon: CheckCircle2, title: 'Consistency' },
  { id: 'uniqueness', icon: Fingerprint, title: 'Uniqueness' },
  { id: 'outliers', icon: Sigma, title: 'Outliers' },
  { id: 'charts', icon: BarChart3, title: 'Control charts' },
  { id: 'scorecard', icon: Gauge, title: 'The scorecard' },
  { id: 'flags', icon: Filter, title: 'Every flag and what it means' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const DataQualityStudioHelpGuide = () => (
  <HelpGuideShell
    title="Data Quality Studio Help Guide"
    subtitle="Completeness, validity, consistency, uniqueness, outliers and control charts on oilfield data"
    metaDescription="How to use the Data Quality Studio: the data sources, every check and its parameters, the scorecard, the meaning of each flag, and the NIST/SEMATECH sources the engine is validated against."
    backTo={QC_STUDIO_ROUTE}
    backLabel="Back to Data Quality Studio"
    icon={Filter}
    sections={QC_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The studio checks a set of measurements before anyone builds on them. It reads well log curves from the wells
        registry, daily production from the production data spine, or a table you upload, and runs a QC profile: a list
        of checks with their parameters. Each check is a statistical or rule-based test from the Petrolord data quality
        engine. The result is a scorecard across five dimensions and a table of flags, where every flag names the rule
        that raised it and gives the reason in a sentence with the numbers in it.
      </Para>
      <Para>
        QC runs are saved to your organization. A run stores its inputs and a record of what it found. When a run
        opens, the data is read again and every check is recomputed; if the data has changed since the run was saved,
        the studio says so.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warn" title="A flag is a question to answer">
        A flag says a value broke a stated rule or stands out by a stated test. Whether it is an error is for you to
        judge: a real high gamma ray shale, a real rate change after a workover and a real spike in a log all raise
        outlier flags. Outlier tests find unusual values; judging whether one is wrong is yours.
      </Callout>
      <Callout tone="warn" title="Defaults are choices">
        Some defaults come from the published sources (the modified z-score 3.5, Tukey&apos;s 1.5, the NIST control chart
        constants). Others are Petrolord choices, labelled so on screen: the Hampel window of 5, the frozen run of 5
        samples, the phase sum tolerance of 0.5 percent of the total, the Mahalanobis alpha of 0.025, the EWMA lambda of
        0.2 and the CUSUM h of 5. Change any of them to fit your data. No range for a gamma ray, a density or a rate is
        shipped as plausible: only definitional limits are suggested, and plausibility limits are yours to type.
      </Callout>
      <Callout tone="info" title="What is not here">
        The generalised ESD test for several outliers and a robust (MCD) covariance for Mahalanobis are not built. Grubbs
        tests one outlier at a time, and a second outlier can mask the first. Units are never converted: a limit in
        another unit is refused.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Choose the data">
        In the left panel pick Well logs, Production or Upload. For well logs choose a well and its curves; for
        production a field and a well; for an upload map the index, identifier and number columns.
      </Step>
      <Step n={2} title="Review the profile">
        The QC profile tab lists every check with its parameters. Range rules are suggested per channel where a
        definitional limit applies. Choose a channel for the control charts and give it an in-control target and sigma,
        or fill them from a baseline stretch you judge in control.
      </Step>
      <Step n={3} title="Run it">
        Press Run QC profile. The scorecard and flags appear on the next tab, the charts on the third. Change a
        parameter and the studio marks the results as out of date until you run again.
      </Step>
      <Step n={4} title="Save and export">
        Create a saved QC run to keep it for your organization. Export the report as CSV (every flag, the scorecard and
        every parameter) or PDF.
      </Step>
      <SubHeading>With the Ekene demonstration data</SubHeading>
      <Para>
        Import the kit&apos;s <Code>01-wells/*.las</Code> files in the Well Data Manager and they appear under Well logs;
        import <Code>11-production-engineering/ekene-daily-production.csv</Code> in the Production Surveillance Studio and
        it appears under Production. The same CSV can be uploaded here directly: choose <Code>date</Code> as the index,
        <Code>well</Code> as the identifier and one well in Rows to check. Ekene is a synthetic teaching field; plant a gap, a spike or a stuck value in a copy to see each check fire.
      </Para>
    </GuideSection>

    <GuideSection id="data">
      <SectionHeading icon={Database}>Where the data comes from</SectionHeading>
      <Table
        headers={['Source', 'What is read', 'Notes']}
        rows={[
          ['Well logs', 'The chosen curves of one well in the wells registry, and its stored depth curve as the index', 'Curves are stored as 32-bit floats, so a value typed as 2.0969 reads back as 2.0968999862. Sonic is stored in us/m by the importer. Uniqueness is checked on the well names you can see.'],
          ['Production', 'One well of one field in the production data spine, indexed by date', 'Columns oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf and hours_on, as stored. Uniqueness is checked on the field’s well names.'],
          ['Upload', 'A CSV, TSV, TXT or Excel sheet, read in your browser', 'Blank, NA, NaN, null, none and - are missing; add your file’s own codes such as -999.25. A cell that is not a number is counted, reported and treated as missing.'],
        ]}
      />
    </GuideSection>

    <GuideSection id="completeness">
      <SectionHeading icon={Layers}>Completeness</SectionHeading>
      <Para>Missing is a blank, null or NaN. Infinity is an invalid value and is refused, never counted as missing.</Para>
      <Formula>completeness = present / n</Formula>
      <Para>
        Each run of consecutive missing samples is one flag, <Code>missing-run</Code>. Coverage is optional: give the
        largest step that still counts as covered, and every stretch of the index with no data closer than that is a
        <Code>coverage-hole</Code>. A step equal to the largest step counts as covered.
      </Para>
    </GuideSection>

    <GuideSection id="validity">
      <SectionHeading icon={ListChecks}>Validity</SectionHeading>
      <SubHeading>Range rules</SubHeading>
      <Para>
        A definitional limit is a bound a value cannot cross by definition. The engine carries these and nothing else:
      </Para>
      <Table
        headers={['Quantity', 'Unit', 'Limit']}
        rows={[
          ['fraction (water cut, porosity, saturation, shale volume, net to gross)', 'v/v', '0 to 1 inclusive'],
          ['rate, cumulative', 'any', 'not below 0'],
          ['gamma ray', 'gAPI', 'not below 0'],
          ['resistivity, bulk density, sonic slowness, caliper', 'ohm.m; g/cm3; us/ft or us/m; in or mm', 'above 0 (0 itself is refused)'],
          ['absolute pressure', 'psia, kPa, bara', 'not below 0'],
          ['temperature', 'degC, degF, K', 'not below absolute zero'],
        ]}
      />
      <Para>
        Neutron porosity is left without a suggestion because an apparent neutron porosity can read below zero. Your
        limits can be typed per channel; a blank bound is open.
      </Para>
      <SubHeading>Index checks</SubHeading>
      <Para>
        On the depth or date index: a missing entry, a duplicate (equal to any earlier value), a reversal (a step
        against the stated direction) and an irregular step (differing from the expected step by more than the
        tolerance). The expected step defaults to the median step, the tolerance to 1e-6 times the expected step. Dates
        are counted in days, so calendar months show irregular steps until you type a tolerance of a few days.
      </Para>
      <SubHeading>Rate rules</SubHeading>
      <Para>A negative rate, and a positive rate on a row whose hours on is 0 (shut in).</Para>
    </GuideSection>

    <GuideSection id="consistency">
      <SectionHeading icon={CheckCircle2}>Consistency</SectionHeading>
      <Table
        headers={['Rule', 'Test', 'Default']}
        rows={[
          ['Cumulative', 'each present value at least the previous present value minus the tolerance', 'tolerance 0'],
          ['Water cut', 'in [0, 1]; and with oil and water rates, equal to water / (oil + water) within the tolerance (liquid basis)', 'tolerance 1e-6'],
          ['Phase sum', '|sum of parts - total| at most max(absolute tolerance, relative tolerance x |total|)', '0.5 percent of the total (Petrolord choice)'],
          ['Frozen run', 'at least the shortest run of consecutive values, each within the tolerance of the run’s first value; a missing value ends a run', '5 samples, tolerance 0 (Petrolord choice)'],
        ]}
      />
      <Para>
        Comparing each value with the run&apos;s first value means a slow drift is not a frozen run; a stuck sensor is.
      </Para>
    </GuideSection>

    <GuideSection id="uniqueness">
      <SectionHeading icon={Fingerprint}>Uniqueness</SectionHeading>
      <Para>
        Identifiers are normalised by NFKD, trimmed, upper-cased, reduced to A to Z and 0 to 9, and each number has its
        leading zeros stripped, so <Code>Well-007</Code> and <Code>WELL 7</Code> are the same. Every pair is then one of:
      </Para>
      <Table
        headers={['Class', 'Meaning']}
        rows={[
          ['exact', 'the raw strings are equal'],
          ['normalised', 'equal after normalisation'],
          ['near', 'Levenshtein distance 1 (default) after normalisation, and the same digits in the same order'],
        ]}
      />
      <Para>
        The digit rule keeps <Code>EKENE-1</Code> and <Code>EKENE-2</Code> apart as two wells while <Code>EKNE-1</Code> and
        <Code>EKENE-1</Code> are called near duplicates. For an upload with a well column, check the distinct values: a
        well repeats on each of its rows, and only different spellings are of interest.
      </Para>
    </GuideSection>

    <GuideSection id="outliers">
      <SectionHeading icon={Sigma}>Outliers</SectionHeading>
      <Para>Every threshold is strict: a value exactly on a limit is not flagged. Missing values are skipped.</Para>
      <SubHeading>z-score (NIST/SEMATECH 1.3.5.17)</SubHeading>
      <Formula>z = (x - mean) / s,   s the sample standard deviation (n - 1)</Formula>
      <Para>
        The largest |z| any point can reach is (n - 1) / sqrt(n) with the sample standard deviation and sqrt(n - 1) with
        the population standard deviation. At n = 10 those are 2.85 and exactly 3, so no point can pass |z| &gt; 3 either
        way; the list of checks that ran gives the ceiling for your data and whether the threshold can be reached.
      </Para>
      <SubHeading>Modified z-score (Iglewicz and Hoaglin, as NIST 1.3.5.17 prints it)</SubHeading>
      <Formula>M = 0.6745 (x - median) / MAD,   MAD = median |x - median|,   flag |M| &gt; 3.5</Formula>
      <Para>When half or more of the values equal the median, MAD is 0 and the test is refused.</Para>
      <SubHeading>Tukey fences</SubHeading>
      <Formula>flag x &lt; Q1 - k IQR  or  x &gt; Q3 + k IQR,   k = 1.5</Formula>
      <Para>
        Quartiles are R7 by default (the Excel, R and numpy rule, so a spreadsheet reproduces them); R6 (the NIST
        default) and R8 are offered, as NIST 7.2.6.2 defines them.
      </Para>
      <SubHeading>Hampel identifier</SubHeading>
      <Formula>flag |x - window median| &gt; n sigma x 1.4826 x window MAD</Formula>
      <Para>
        The window is 2 x half window + 1 samples, truncated at the ends; a window with fewer than three present samples
        is not judged. The decision is the Petrophysics Studio&apos;s despike, imported unchanged.
      </Para>
      <SubHeading>Grubbs&apos; test (NIST 1.3.5.17.1)</SubHeading>
      <Formula>G = max |x - mean| / s;   reject when G &gt; ((n - 1) / sqrt(n)) sqrt(t² / (n - 2 + t²))</Formula>
      <Para>
        t is the upper alpha / (2n) point (two-sided) or alpha / n (one-sided) of Student&apos;s t on n - 2 degrees of
        freedom. It tests for one outlier.
      </Para>
      <SubHeading>Mahalanobis distance</SubHeading>
      <Formula>d² = (x - mean)&apos; S⁻¹ (x - mean),   flag d² &gt; chi-square quantile (1 - alpha, p)</Formula>
      <Para>
        S is the sample covariance of the complete rows, p the number of channels. Rows with a missing value are
        skipped and listed. The estimates are classical, so several outliers together can pull the centre toward
        themselves and hide.
      </Para>
    </GuideSection>

    <GuideSection id="charts">
      <SectionHeading icon={BarChart3}>Control charts</SectionHeading>
      <Para>
        A control chart needs a complete series; a gap is refused with the sample named, so choose a window without
        one. The target and sigma belong to in-control history. The studio never estimates them from the series it
        is watching, because a shift would then be absorbed into its own reference. Fill them from a baseline stretch
        you judge in control, or type them.
      </Para>
      <SubHeading>Individuals and moving range (NIST 6.3.2.2)</SubHeading>
      <Formula>MR = |x(i) - x(i-1)|,   sigma = MRbar / 1.128,   limits = centre ± 3 sigma,   MR limit = 3.267 MRbar</Formula>
      <SubHeading>EWMA (NIST 6.3.2.4)</SubHeading>
      <Formula>EWMA(t) = lambda x(t) + (1 - lambda) EWMA(t-1),   EWMA(0) = target,   limits = target ± L sigma sqrt(lambda / (2 - lambda))</Formula>
      <Para>Exact limits multiply the variance by 1 - (1 - lambda)^(2t), which narrows them at the start.</Para>
      <SubHeading>Tabular CUSUM (NIST 6.3.2.3)</SubHeading>
      <Formula>S_hi(i) = max(0, S_hi(i-1) + x(i) - target - k),   S_lo(i) = max(0, S_lo(i-1) + target - k - x(i)),   signal when either exceeds h</Formula>
      <Para>
        k and h are in multiples of sigma or in the data&apos;s own units, as you choose; the rule of thumb is k = 0.5
        and h = 4 or 5 sigma. The sums are not reset after a signal, as in the NIST table.
      </Para>
    </GuideSection>

    <GuideSection id="scorecard">
      <SectionHeading icon={Gauge}>The scorecard</SectionHeading>
      <Para>
        Each dimension scores 1 - failed / checked, counted over distinct cells (one channel at one sample), so a value
        two rules flag counts once. The total is the weighted mean; with no weights typed every scored dimension weighs
        the same, and typed weights are divided by their sum. The weakest dimension is the lowest score, a tie going to
        the one listed first.
      </Para>
      <Table
        headers={['Dimension', 'Checked', 'Failed']}
        rows={[
          ['Completeness', 'every sample of every checked channel', 'a missing sample'],
          ['Validity', 'the index entries, and every present value a range or rate rule looked at', 'a flagged entry or value'],
          ['Consistency', 'the values a cumulative, water cut or phase sum rule compared, and the present values searched for frozen runs', 'a flagged value, or a sample inside a frozen run'],
          ['Uniqueness', 'the identifiers', 'the later member of a duplicate pair'],
          ['Plausibility', 'every present value of a checked channel', 'a value any enabled univariate outlier test flags'],
        ]}
      />
      <Para>
        Coverage holes, Mahalanobis rows and control chart signals are listed with their reasons and left out of the
        score. A dimension nothing checked is left out rather than scored as perfect. No grade bands are given: what
        counts as good enough is your organization&apos;s call.
      </Para>
    </GuideSection>

    <GuideSection id="flags">
      <SectionHeading icon={Filter}>Every flag and what it means</SectionHeading>
      <Para>
        On screen, figures in a reason are rounded to at most 6 decimal places with trailing zeros trimmed, and whole
        numbers are shown as they are; a figure that would then read the same as a different figure it is compared with
        is shown in full. The CSV and PDF exports keep the engine&apos;s full-precision figures.
      </Para>
      <Para>
        Entries are counted from 0, the way the reasons count them: the Entry column, the CSV entry column and a reason
        that says entry 57 all mean the 58th value. The At column gives the index value there (a depth or a date), or
        the entry again when the data has no index.
      </Para>
      <Table
        headers={['Rule', 'Meaning']}
        rows={[
          [<Code key="1">missing-run</Code>, 'one or more consecutive samples are missing'],
          [<Code key="2">coverage-hole</Code>, 'a stretch of the index has no data within the largest step'],
          [<Code key="3">below-minimum / above-maximum</Code>, 'a value is outside its range rule'],
          [<Code key="4">missing-index / duplicate-index</Code>, 'an index entry is absent, or repeats an earlier one'],
          [<Code key="5">reversal / irregular-step</Code>, 'the index steps backwards, or by other than the expected step'],
          [<Code key="6">negative-rate / rate-while-shut-in</Code>, 'a rate below zero, or a rate on a shut-in row'],
          [<Code key="7">cumulative-decrease</Code>, 'a cumulative fell by more than the tolerance'],
          [<Code key="8">water-cut-out-of-range / water-cut-mismatch</Code>, 'water cut outside [0, 1], or disagreeing with the rates'],
          [<Code key="9">phase-sum-mismatch</Code>, 'the parts do not add to the total within the tolerance'],
          [<Code key="10">frozen-run</Code>, 'a sensor held one value for at least the shortest run'],
          [<Code key="11">duplicate-exact / duplicate-normalised / duplicate-near</Code>, 'two identifiers name the same thing, by the class stated'],
          [<Code key="12">z-score / modified-z / hampel / grubbs</Code>, 'the value passed that test’s threshold'],
          [<Code key="13">below-lower-fence / above-upper-fence</Code>, 'the value is outside a Tukey fence'],
          [<Code key="14">mahalanobis</Code>, 'the row is farther from the centre than the chi-square cutoff'],
          [<Code key="15">individuals-above-ucl / individuals-below-lcl / moving-range-above-ucl</Code>, 'a point or a moving range outside its limit'],
          [<Code key="16">ewma-above-ucl / ewma-below-lcl</Code>, 'the EWMA crossed a limit'],
          [<Code key="17">cusum-high / cusum-low</Code>, 'the upper or lower CUSUM exceeded h: the mean has shifted'],
        ]}
      />
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine, <Code>engines/dataai/quality.js</Code> in the Petrolord engines, is checked against 402 cases written
        by an independent oracle in plain Python from the published equations, and against numpy, scipy and statsmodels
        as a second witness. Eight cases reproduce the NIST/SEMATECH e-Handbook of Statistical Methods worked examples:
      </Para>
      <Table
        headers={['NIST section', 'What it reproduces']}
        rows={[
          ['6.3.2.2 Individuals Control Charts', 'the flow rate example: centre, MRbar, limits and every moving range'],
          ['6.3.2.4 EWMA Control Charts', 'all 20 EWMA values and both limits'],
          ['6.3.2.3 CUSUM Control Charts', 'the tabular CUSUM for all 20 groups and the first signal at group 14'],
          ['1.3.5.17.1 Grubbs’ Test', 'G = 2.4687 and the critical value 2.032 on the uranium isotope data'],
          ['7.2.6.2 Percentiles', 'the 90th percentile by R6, R7 and R8'],
        ]}
      />
      <Para>
        Four printed figures were found to be rounded or misprinted and are recorded as errata in the engine&apos;s
        findings: G prints as 2.4687 where 2.468765 rounds to 2.4688; the EWMA lower limit rounds an intermediate value;
        two rows of the CUSUM table have a sign typo in a column the engine does not output; and the CUSUM h of 4.1959
        cannot be derived from the page&apos;s own design formula, so the engine takes k and h as inputs. A negative
        control planted 41 defects in the engine and every one turned the gates red. The modified z-score, Hampel,
        Mahalanobis, completeness, validity, consistency, uniqueness and scorecard cases are oracle-derived: no published
        worked example with printed numbers was found for them.
      </Para>
      <Para>
        This studio is tested on Ekene data the same way: every result it shows is compared, whole, with a direct call to
        the engine on the same values and parameters.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default DataQualityStudioHelpGuide;
