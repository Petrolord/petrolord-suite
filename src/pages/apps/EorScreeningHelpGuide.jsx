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

const EorScreeningHelpGuide = () => (
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
        SPE Reservoir Engineering, August 1997. The limits in this app are that paper's tables
        entered verbatim. Nothing has been modernized or tuned.
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
      <Step n={1} title="Load the sample if you want to see it work first">
        The button under the input card loads a West Texas style CO2 candidate: 32 degrees API,
        2 cp, 45 percent oil saturation, 40 ft net, 25 md, 5200 ft, 105 degrees F, carbonate.
        Three methods qualify on that reservoir.
      </Step>
      <Step n={2} title="Enter your reservoir">
        Type over the eight fields. Every one is optional. A field you leave blank is not
        scored rather than assumed, which is important and is covered in detail below.
      </Step>
      <Step n={3} title="Read the ranking bar chart">
        Methods are sorted with qualified ones first, then by score. Green bars qualify on
        every criterion that could be scored. Grey bars failed at least one.
      </Step>
      <Step n={4} title="Open a method to see why">
        Each row expands into the full verdict table: every criterion, the published
        requirement, your reservoir's value, and a pass, fail or not scored verdict. This
        table is the actual output of the tool. The bar chart is only a summary of it.
      </Step>
      <Callout tone="info" title="Nothing is saved">
        This app has no projects and no save. Closing or reloading the page clears your
        inputs, and there is no export. Screen a reservoir, read the verdict tables, and
        record the outcome wherever your study lives.
      </Callout>
    </GuideSection>

    <GuideSection id="inputs">
      <SectionHeading icon={Sliders}>The eight inputs</SectionHeading>
      <Para>
        All units are US oilfield and there is no metric toggle. Enter values in the units
        shown on the labels.
      </Para>
      <Table
        headers={['Field', 'Unit', 'Sample value', 'What it drives']}
        rows={[
          ['Oil gravity', 'degrees API', '32', 'Every method. The single most discriminating input.'],
          ['Oil viscosity', 'cp', '2', 'Every method. Note polymer flooding uses a two sided window.'],
          ['Oil saturation', 'percent PV', '45', 'Every method. This is saturation at the start of the EOR process, not initial oil saturation.'],
          ['Net thickness', 'ft', '40', 'Scored only for in-situ combustion and steam flooding. Advisory for the gas methods.'],
          ['Average permeability', 'md', '25', 'Chemical and thermal methods. Not critical for any gas method.'],
          ['Depth', 'ft', '5200', 'Every method. Gas methods need a minimum depth, chemical and thermal a maximum.'],
          ['Reservoir temperature', 'degrees F', '105', 'Chemical methods (an upper limit) and in-situ combustion (a lower limit).'],
          ['Formation', 'selection', 'Carbonate', 'Sandstone, Carbonate, or Other and unconsolidated. See the warning below.'],
        ]}
      />
      <SubHeading>Blank and zero are different</SubHeading>
      <Para>
        A blank field is left unscored. A zero is a real measured value and is tested like any
        other. Clearing the viscosity box removes viscosity from the screen entirely. Typing
        <Code>0</Code> into it makes polymer flooding fail, because polymer's window starts at
        10 cp and zero falls below it.
      </Para>
      <Callout tone="warn" title="Formation cannot be blanked">
        The other seven fields can be cleared. The formation selector cannot be returned to
        empty once a value is set, so formation is always scored. That matters because
        choosing Carbonate screens out both chemical methods and both thermal methods on
        formation alone. If your formation is genuinely uncertain, read the verdict tables
        rather than the qualification badges.
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
          ['CO2 miscible', 'above 22 API', 'below 10 cp', 'above 20 percent', 'above 2500 ft', 'Sandstone or carbonate', '5'],
          ['Immiscible gas', 'above 12 API', 'below 600 cp', 'above 35 percent', 'above 1800 ft', 'Not critical', '4'],
        ]}
      />
      <Para>
        For all four gas methods, permeability and temperature are not critical, and net
        thickness is advisory only. The app shows a note such as "thin unless dipping" and
        does not score it, because the paper's guidance there is about geometry and dip rather
        than a number.
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
        Both chemical methods require sandstone and fail on carbonate. Both score all seven of
        their criteria, so they are the hardest methods to qualify.
      </Para>
      <Callout tone="info" title="Polymer viscosity is a window, not a ceiling">
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
        Both thermal methods require a high porosity sand and fail on carbonate. In-situ
        combustion is the only method in the app where all eight criteria are scored, which
        makes its percentage directly comparable to nothing else on the chart.
      </Para>
    </GuideSection>

    <GuideSection id="scoring">
      <SectionHeading icon={Gauge}>How scoring works</SectionHeading>
      <Para>
        Each criterion returns one of three verdicts. <strong>Pass</strong> means your value is
        inside the published limit. <strong>Fail</strong> means it is outside.
        <strong> Not scored</strong> means either you left the field blank, or the paper gives
        no limit for that property and method.
      </Para>
      <SubHeading>The two rules that decide everything</SubHeading>
      <Para>
        <strong>The score is a fraction of scored criteria.</strong> It is the number of passes
        divided by the number of criteria that could be scored. Criteria that are not scored
        are dropped from both the numerator and the denominator.
      </Para>
      <Para>
        <strong>Qualification requires a clean sheet.</strong> A method qualifies when at least
        one criterion was scored and every scored criterion passed. One failure anywhere
        removes the badge, however good the rest look.
      </Para>
      <Callout tone="danger" title="Unscored criteria inflate the score">
        Because unscored criteria leave the denominator, a reservoir with most fields blank can
        show methods at 100 percent and "Qualified" on the strength of a single criterion. That
        is a statement about how little you entered, not about how good the method is. Before
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
        rule out, rather than as the method being recommended.
      </Para>
      <SubHeading>The percentages are not comparable across methods</SubHeading>
      <Para>
        A method with four scored criteria and one with eight both report a percentage on the
        same bar chart, but they are fractions of different denominators. Compare the verdict
        tables rather than the bar lengths when two methods are close.
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
        Taber, J. J., Martin, F. D., and Seright, R. S., "EOR Screening Criteria Revisited",
        SPE Reservoir Engineering, August 1997 (SPE 35385 and SPE 39234), Tables 1 to 3.
      </Para>
      <Para>
        The paper is a survey of projects operating in the mid 1990s. Its limits reflect the
        technology and economics of that period. CO2 practice in particular has moved on since
        publication, so treat a marginal CO2 result as a prompt to look at recent analogues
        rather than as a closed question.
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

export default EorScreeningHelpGuide;
