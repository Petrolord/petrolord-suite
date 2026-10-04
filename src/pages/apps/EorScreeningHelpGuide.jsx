// In-app help guide for EOR Screening.
//
// The app shipped without any help, which mattered more here than elsewhere:
// the qualification rule (all SCORED criteria must pass, unscored ones are
// ignored) is not something a user can infer from the screen, and it changes
// how the ranking should be read.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, ListChecks, Gauge, AlertTriangle, BookMarked,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this screens' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'inputs', icon: Sliders, title: 'The eight inputs' },
  { id: 'methods', icon: ListChecks, title: 'The eight methods' },
  { id: 'scoring', icon: Gauge, title: 'How scoring works' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
  { id: 'references', icon: BookMarked, title: 'Source and scope' },
];

const EorScreeningHelpGuideContent = () => (
  <HelpGuideShell
    title="EOR Screening Help Guide"
    subtitle="Shortlisting enhanced recovery methods against the published criteria"
    metaDescription="How to use EOR Screening: inputs, the eight methods, how qualification is decided, and how to read the ranking honestly."
    backTo="/dashboard/apps/reservoir/eor-screening"
    backLabel="Back to EOR Screening"
    sections={sections}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this screens</SectionHeading>
      <Para>
        EOR Screening takes eight reservoir and fluid properties and checks them against the
        published screening criteria for eight enhanced oil recovery methods. It answers one
        question: which methods are worth studying further for this reservoir, and which are
        ruled out by the rock and fluid you actually have.
      </Para>
      <Para>
        The criteria come from Taber, Martin and Seright, "EOR Screening Criteria Revisited",
        Parts 1 and 2, SPE Reservoir Engineering, August 1997: the summary in Table 3 of Part 1,
        and the detail tables of Part 2 where they sharpen it (the CO2 minimum depth for each oil
        gravity, and the "sandstones preferred" wording of the chemical floods). Every verdict
        names the table it came from. Nothing has been modernized or tuned.
      </Para>
      <Callout tone="warn" title="This is a shortlisting tool">
        Screening tells you which methods survive the published limits. It does not design a
        flood, predict recovery, calculate minimum miscibility pressure, size a chemical slug,
        or evaluate economics. A method that qualifies here is a candidate for study, and
        nothing more than that.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="The app opens on a worked example">
        You start on an illustrative West Texas style CO2 candidate: 32 degrees API, 2 cp, 45
        percent oil saturation, 40 ft net, 25 md, 5200 ft, 105 degrees F, carbonate. It is not a
        real field, and the input card and the report say so until you replace the values.
        Three methods qualify and one is marginal. Load sample brings it back; Clear inputs
        empties every field.
      </Step>
      <Step n={2} title="Enter your reservoir">
        Type over the eight fields. Every one is optional. A field you leave blank is left out
        of the score and nothing is assumed for it, which is important and is covered in detail below.
      </Step>
      <Step n={3} title="Read the ranking bar chart">
        Methods are sorted qualified first, then marginal, then screened out, and within each by
        the share of screened criteria that pass. Green bars qualify on every criterion that
        could be screened, amber bars are marginal, grey bars failed at least one.
      </Step>
      <Step n={4} title="Open a method to see why">
        Each row expands into the full verdict table: every criterion, the published
        requirement, the paper's project average, your reservoir's value, the verdict with its
        reason, and the table it came from. This table is the actual output of the tool. The bar
        chart is only a summary of it.
      </Step>
      <Step n={5} title="Save it, share it, report it">
        Create a project from the project bar to save the screening; it autosaves every ten
        seconds. Share it with your organisation to view, or to edit one person at a time with
        the check-out bar. The Report tab takes the identification (company, field, licence,
        reservoir, wells, analyst) and exports a PDF with every input and its source, the
        criteria edition, each method criterion by criterion, the limits and two figures.
      </Step>
      <Callout tone="info" title="Saving waits for its database table">
        Until the EOR Screening table is switched on for your organisation the project bar says
        so, and the screening stays on the page while it is open. Export the report to keep a copy.
      </Callout>
    </GuideSection>

    <GuideSection id="inputs">
      <SectionHeading icon={Sliders}>The eight inputs</SectionHeading>
      <Para>
        Choose Oilfield or SI in the header. A new project opens in the system your unit profile
        leans to. In SI, depth and thickness are in m, viscosity in mPa.s, temperature in degC
        and pressure in kPa. The criteria are published in oilfield units, so every value is
        converted to oilfield before it is compared; a limit typed in SI (1,371.6 m is 4,500 ft)
        is read as on the limit. Below each input, Source says where the value came from; click
        it to state a source (lab, correlation, offset well) and a note. The report prints it.
      </Para>
      <Table
        headers={['Field', 'Unit', 'Sample value', 'What it drives']}
        rows={[
          ['Oil gravity', 'degrees API', '32', 'Every method. The single most discriminating input.'],
          ['Oil viscosity', 'cp', '2', 'Every method. Note polymer flooding uses a two sided window.'],
          ['Oil saturation', 'percent PV', '45', 'Every method. This is saturation at the start of the EOR process. It is not the initial oil saturation.'],
          ['Net thickness', 'ft', '40', 'Scored only for in-situ combustion and steam flooding. Advisory for the gas methods.'],
          ['Average permeability', 'md', '25', 'Chemical and thermal methods. Not critical for any gas method.'],
          ['Depth', 'ft', '5200', 'Every method. Gas methods need a minimum depth, chemical and thermal a maximum.'],
          ['Reservoir temperature', 'degrees F', '105', 'Chemical methods (an upper limit) and in-situ combustion (a lower limit).'],
          ['Formation', 'selection', 'Carbonate', 'Sandstone, Unconsolidated sand, Carbonate, Other lithology, or Not given.'],
        ]}
      />
      <Para>
        Three more values are printed in the report for context and are not screened: reservoir
        pressure, bubble point pressure and original oil in place. Taber 1997 screens none of
        them. State the depth reference too (TVDSS, TVD below the rotary table, or below ground
        level); it is printed and no correction is applied.
      </Para>
      <SubHeading>Values from other apps</SubHeading>
      <Para>
        The From other apps card reads a saved project by id. Fluid Systems Studio gives the oil
        gravity, the reservoir temperature and the oil viscosity at reservoir conditions, read
        from the project's own PVT table at the reservoir pressure you state (at the bubble
        point when you leave it blank; never extrapolated). Well Test Analysis Studio gives the
        permeability with its method and window. Material Balance Studio gives the OOIP and the
        last average pressure. Each card says where the values came from and when; a value you
        then change is marked edited after intake, and a source saved again with different
        content is marked source changed since.
      </Para>
      <Para>
        You can also start from the other app: Send to EOR Screening in Fluid Systems Studio
        (Integration Suite), Well Test Analysis Studio (Report tab, Send results) and Material
        Balance Studio (Run tab, after a run of an oil case) opens this app with that saved
        project already chosen. Press Take values to read it. Each sender needs a saved
        project, because this app reads it by id.
      </Para>
      <SubHeading>Distance to the limit</SubHeading>
      <Para>
        Each criterion row also says how far your value sits from the limit it was judged on, in
        your display units and as a share of the limit (for a window such as polymer viscosity,
        the nearer end). The paper says its limits are not sharp, so a value just inside or just
        outside deserves a second look. The distance is information only: it never changes a
        verdict or the ranking.
      </Para>
      <SubHeading>CO2 miscibility: MMP against reservoir pressure</SubHeading>
      <Para>
        Taber 1997 judges CO2 miscibility by depth for typical Permian Basin oils and says other
        oils need a measured minimum miscibility pressure. The app adds that check beside the
        verdicts, from one published correlation whose own slim-tube data it is tested against:
        Zhu et al. (2025), ACS Omega 10 (47), 57267-57276. It reads the reservoir temperature and
        two fractions of the reservoir oil, C1 + N2 and C2 to C10 (count CO2 dissolved in the oil
        with C2 to C10), in mol %. With the reservoir pressure stated it says miscible (pressure
        above the MMP) or immiscible, and by how much. On its 12 points the correlation is within
        0.48 MPa on average and 2.05 MPa at worst, so a difference smaller than that is flagged
        as needing a measured MMP.
      </Para>
      <Callout tone="warn" title="Know where the correlation comes from">
        The paper fitted black oils of the Ordos Basin (43 to 92 degC) with pure CO2. Inputs
        outside its data are computed and flagged as extrapolated. It does not cover nitrogen,
        hydrocarbon gas or impure CO2. The check changes no Taber verdict: CO2 miscible still
        uses the depth by oil gravity table.
      </Callout>
      <SubHeading>Blank and zero are different</SubHeading>
      <Para>
        A blank field is left unscored. A zero is a real measured value and is tested like any
        other. Clearing the viscosity box removes viscosity from the screen entirely. Typing
        <Code>0</Code> into it makes polymer flooding fail, because polymer's window starts at
        10 cp and zero falls below it.
      </Para>
      <Callout tone="warn" title="Formation is a strong criterion">
        Choosing Carbonate screens out both thermal methods on formation alone and makes both
        chemical methods marginal. If your formation is genuinely uncertain, choose Not given
        and read the verdict tables.
      </Callout>
    </GuideSection>

    <GuideSection id="methods">
      <SectionHeading icon={ListChecks}>The eight methods</SectionHeading>
      <Para>
        Values shown as "typical" in the app are the paper's averages across projects running
        at the time of publication. They are displayed for context and never affect scoring.
        Only the hard limits below decide pass or fail.
      </Para>

      <SubHeading>Gas injection</SubHeading>
      <Table
        headers={['Method', 'Gravity', 'Viscosity', 'Oil sat', 'Depth', 'Formation', 'Scored count']}
        rows={[
          ['Nitrogen and flue gas', 'above 35 API', 'below 0.4 cp', 'above 40 percent', 'above 6000 ft', 'Sandstone or carbonate', '5'],
          ['Hydrocarbon miscible', 'above 23 API', 'below 3 cp', 'above 30 percent', 'above 4000 ft', 'Sandstone or carbonate', '5'],
          ['CO2 miscible', 'above 22 API', 'below 10 cp', 'above 20 percent', '2500 to 4000 ft by gravity (below)', 'Sandstone or carbonate', '5'],
          ['Immiscible gas', 'above 12 API', 'below 600 cp', 'above 35 percent', 'above 1800 ft', 'Not critical', '4'],
        ]}
      />
      <SubHeading>CO2 miscible: minimum depth by oil gravity</SubHeading>
      <Table
        headers={['Oil gravity', 'Depth must be greater than']}
        rows={[['above 40 API', '2500 ft'], ['32 to 39.9 API', '2800 ft'], ['28 to 31.9 API', '3300 ft'], ['22 to 27.9 API', '4000 ft'], ['below 22 API', 'fails miscible; screen for immiscible gas']]}
      />
      <Para>
        Part 2, Table 3. The Part 1 summary prints only "above 2500 ft" and points to this
        table; heavier oils need more pressure to become miscible, so a 25 API oil at 3000 ft
        is screened out. The paper notes these depths are for typical Permian Basin oils.
      </Para>
      <Para>
        For all four gas methods, permeability and temperature are not critical, and net
        thickness is never scored. What the thickness row says varies by method, because the
        paper's guidance there is about geometry and dip. It gives no number.
      </Para>
      <Table
        headers={['Method', 'What the thickness row reads']}
        rows={[
          ['Nitrogen and flue gas', 'Thin unless dipping (advisory)'],
          ['Hydrocarbon miscible', 'Thin unless dipping (advisory)'],
          ['CO2 miscible', 'Not critical'],
          ['Immiscible gas', 'Not critical if dipping (advisory)'],
        ]}
        widths={[2.4, 4.2]}
      />
      <Para>
        None of those four affects the score. If your candidate is a thin gas injection target,
        the thickness and dip question has to be settled outside this tool.
      </Para>

      <SubHeading>Chemical</SubHeading>
      <Table
        headers={['Method', 'Gravity', 'Viscosity', 'Oil sat', 'Permeability', 'Depth', 'Temperature']}
        rows={[
          ['Micellar polymer, ASP and alkaline', 'above 20 API', 'below 35 cp', 'above 35 percent', 'above 10 md', 'below 9000 ft', 'below 200 F'],
          ['Polymer flooding', 'above 15 API', '10 to 150 cp', 'above 50 percent', 'above 10 md', 'below 9000 ft', 'below 200 F'],
        ]}
      />
      <Para>
        Both chemical methods prefer sandstone. The paper says preferred (Part 2, Table 4) and,
        for polymer, that it can be used in carbonates (Part 2, Table 5), so a carbonate is
        marginal for both. A carbonate polymer flood between 3 and 10 md is also marginal: the
        paper allows it where the intent is to sweep only the fracture system (Part 1, Table 3,
        note b). Part 1 prints the depth and temperature limits as "&gt; 9,000" and "&gt; 200"
        with downward arrows; Part 2 gives "below about 9,000 ft" and "below 200 F", which the
        app uses.
      </Para>
      <Callout tone="info" title="Polymer viscosity is a window with a floor and a ceiling">
        Polymer flooding requires viscosity between 10 and 150 cp. Oil below 10 cp fails, and
        that is deliberate in the source: oil that thin does not need mobility control, so
        polymer is not the right tool even though it would flow perfectly well.
      </Callout>

      <SubHeading>Thermal</SubHeading>
      <Table
        headers={['Method', 'Gravity', 'Viscosity', 'Oil sat', 'Net thickness', 'Permeability', 'Depth', 'Temperature']}
        rows={[
          ['In-situ combustion', 'above 10 API', 'below 5000 cp', 'above 50 percent', 'above 10 ft', 'above 50 md', 'below 11500 ft', 'above 100 F'],
          ['Steam flooding', 'above 8 API', 'below 200000 cp', 'above 40 percent', 'above 20 ft', 'above 200 md', 'below 4500 ft', 'Not critical'],
        ]}
      />
      <Para>
        Both thermal methods require a high porosity sand and fail on carbonate. They also carry
        a transmissibility limit, k h divided by viscosity: above 20 md-ft/cp for combustion and
        above 50 md-ft/cp for steam (Part 1, Table 3, notes c and d). It is computed when the
        permeability, net thickness and viscosity are all given. In-situ combustion scores nine
        criteria, more than any other method, so its percentage is not directly comparable to
        the rest of the chart.
      </Para>
    </GuideSection>

    <GuideSection id="scoring">
      <SectionHeading icon={Gauge}>How scoring works</SectionHeading>
      <Para>
        Each criterion returns one of four verdicts. <strong>Pass</strong> means your value is
        inside the published limit. <strong>Fail</strong> means it is outside.
        <strong> Marginal</strong> means the paper itself softens the limit (a preferred
        formation, the carbonate fracture note, a formation the table does not name for gas
        injection). <strong> Not screened</strong> (unscored) means either you left the field
        blank, or the paper gives no limit for that property and method.
      </Para>
      <SubHeading>The two rules that decide everything</SubHeading>
      <Para>
        <strong>The score is a fraction of scored criteria.</strong> It is the number of passes
        divided by the number of criteria that could be scored. Criteria that are not scored
        are dropped from both the numerator and the denominator.
      </Para>
      <Para>
        <strong>Qualification requires a clean sheet.</strong> A method qualifies when at least
        one criterion was scored and every scored criterion passed. A method with no fail and
        at least one marginal verdict is Marginal. One failure anywhere screens it out, however
        good the rest look. A marginal verdict does not count as a pass in the percentage.
      </Para>
      <Callout tone="danger" title="Unscored criteria inflate the score">
        Because unscored criteria leave the denominator, a reservoir with most fields blank can
        show methods at 100 percent and "Qualified" on the strength of a single criterion. That
        is a statement about how little you entered. It says nothing about how good the method is. Before
        trusting a qualification, open the row and count how many criteria actually carry a
        pass or fail verdict.
      </Callout>
      <SubHeading>Limits are inclusive</SubHeading>
      <Para>
        The requirement column prints "above 22" and "below 200" for readability, but the test
        is inclusive at both ends. A reservoir at exactly 22 degrees API passes the CO2 miscible
        gravity criterion, and one at exactly 200 degrees F passes the chemical temperature
        criterion.
      </Para>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>Immiscible gas nearly always qualifies</SubHeading>
      <Para>
        Only four criteria are scored for immiscible gas and all four are loose. It will sit
        near the top of the ranking for most reservoirs. Read that as the method being hard to
        rule out. It does not mean the method is recommended.
      </Para>
      <SubHeading>The percentages are not comparable across methods</SubHeading>
      <Para>
        A method with four scored criteria and one with eight both report a percentage on the
        same bar chart, but they are fractions of different denominators. When two methods are close,
        compare the verdict tables and set the bar lengths aside.
      </Para>
      <SubHeading>Net thickness is displayed for every method and used by two</SubHeading>
      <Para>
        Thickness is only scored for in-situ combustion, which needs more than 10 ft, and steam
        flooding, which needs more than 20 ft. For the four gas methods and both chemical
        methods it appears in the table and has no effect on the outcome.
      </Para>
      <SubHeading>Oil saturation means saturation at the start of the EOR process</SubHeading>
      <Para>
        The paper's criterion is the oil left in place when the enhanced recovery process
        begins, after primary and any waterflood. Entering initial oil saturation will make
        every method look better than it should.
      </Para>
      <SubHeading>What screening cannot see</SubHeading>
      <Para>
        The criteria are properties of rock and fluid. They say nothing about CO2 supply or
        transport, minimum miscibility pressure for your specific oil, injectivity, pattern
        geometry, conformance and heterogeneity, surface facilities, water chemistry for
        chemical floods, regulatory constraints, or cost. A method that passes all eight
        criteria can still be the wrong answer for the field on any of those grounds.
      </Para>
    </GuideSection>

    <GuideSection id="references">
      <SectionHeading icon={BookMarked}>Source and scope</SectionHeading>
      <Para>
        Taber, J. J., Martin, F. D., and Seright, R. S., "EOR Screening Criteria Revisited, Part 1:
        Introduction to Screening Criteria and Enhanced Recovery Field Projects", SPE Reservoir
        Engineering 12 (3), August 1997, 189 to 198 (SPE-35385-PA), Table 3 and its notes; and
        "Part 2: Applications and Impact of Oil Prices", same issue, 199 to 205 (SPE-39234-PA),
        Tables 3, 4 and 5. Surface mining, in the Part 1 table, is not screened here.
      </Para>
      <Para>
        The paper is a survey of projects operating in the mid 1990s. Its limits reflect the
        technology and economics of that period. CO2 practice in particular has moved on since
        publication, so treat a marginal CO2 result as a prompt to look at recent analogues.
        It does not settle the question.
      </Para>
      <Para>
        This app replaced an earlier EOR Designer tile that promised flood design it did not
        implement. The scope was narrowed deliberately to what can be done honestly from
        published criteria. If you need displacement design, the Waterflood Design Studio
        covers immiscible waterflooding, and Reservoir Simulation Studio covers full field
        modelling.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

// Design system rollout batch 3E: the guide follows the same per-user theme
// as EOR Screening itself, so the look does not flip between the two pages.
const EorScreeningHelpGuide = () => (
  <div className="min-h-screen" data-testid="eor-help-theme-scope">
    <EorScreeningHelpGuideContent />
  </div>
);

export default EorScreeningHelpGuide;
