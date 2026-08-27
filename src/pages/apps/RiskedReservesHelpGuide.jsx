// In-app help guide for Risked Reserves Valuation.
//
// The single most important thing in this guide is the convention warning:
// the three input boxes are labelled P10 / P50 / P90 but are read as
// low / mode / high, while the result cards use the petroleum convention where
// P10 is the high case. A reserves engineer entering petroleum-convention
// values silently gets samples outside the range they intended.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, Calculator, LineChart, Activity, AlertTriangle,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'convention', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'variables', icon: Sliders, title: 'The five variables' },
  { id: 'settings', icon: Calculator, title: 'Economic settings' },
  { id: 'engine', icon: Calculator, title: 'The cash flow model' },
  { id: 'results', icon: LineChart, title: 'Reading the results' },
  { id: 'sensitivity', icon: Activity, title: 'The tornado' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const RiskedReservesHelpGuide = () => (
  <HelpGuideShell
    title="Risked Reserves Valuation Help Guide"
    subtitle="Monte Carlo NPV over uncertain reserves, prices and costs"
    metaDescription="How to use Risked Reserves Valuation: the input convention, the cash flow model, and how to read the S-curve, histogram and tornado."
    backTo="/dashboard/apps/reservoir/risked-reserves-valuation"
    backLabel="Back to Risked Reserves Valuation"
    sections={sections}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        Risked Reserves Valuation runs a Monte Carlo simulation over five uncertain inputs and
        returns the full distribution of project NPV. Each iteration draws a value for reserves,
        oil price, capex, opex and decline rate, runs a discounted cash flow, and records the
        resulting NPV. Thousands of iterations later you get an S curve, a histogram, percentile
        outcomes and a sensitivity ranking.
      </Para>
      <Para>
        It is a screening valuation for ranking a prospect or a development option under
        uncertainty. The cash flow model is deliberately simple, and the section on what it
        leaves out is worth reading before you quote a number from it.
      </Para>
      <Callout tone="info" title="Nothing is saved">
        There are no projects, no save and no export in this app. Inputs and results are lost on
        reload. Screenshot or transcribe anything you need to keep.
      </Callout>
    </GuideSection>

    <GuideSection id="convention">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="danger" title="The input boxes are low, mode and high">
        Each variable has three boxes labelled P10, P50 and P90. The engine reads them as the
        <strong> low bound</strong>, the <strong>most likely value</strong> and the
        <strong> high bound</strong> of a triangular distribution, in that order. The shipped
        defaults show the intent: oil reserves are 80, 100, 120.
      </Callout>
      <Para>
        That is the statistical reading, where P10 is the tenth percentile and therefore the low
        value. It is the opposite of the petroleum convention, where P10 is the optimistic case.
        The result cards at the top of the results panel do use the petroleum convention, so
        the P10 card shows the high outcome and the P90 card shows the low one.
      </Para>
      <Para>
        The two conventions sit on the same screen. Enter low to high, left to right, and read
        the output cards knowing P90 is your downside.
      </Para>
      <Callout tone="danger" title="What happens if you enter them the other way round">
        <p className="mb-2">
          If you enter 120, 100, 80 for reserves, expecting P10 to be the optimistic case, the
          sampler does not warn you and does not error. It produces something far stranger than a
          wider distribution.
        </p>
        <p className="mb-2">
          The triangular inverse is being fed a negative width, and the result splits into two
          disjoint lobes. Half the draws land between 120 and 140, the other half between 60 and
          80, and <strong>nothing at all is drawn between 80 and 120</strong>. The value you
          entered as the most likely case is never sampled once. Every iteration is therefore an
          extreme case, and the P50 you read out is an artefact of where the two lobes happen to
          sit rather than a median of anything meaningful.
        </p>
        <p>
          Enter low, most likely, high, left to right. If a result distribution ever looks
          strongly two-humped on the histogram, check the input order before you interpret it.
        </p>
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Start from the shipped defaults">
        The app opens on a worked offshore prospect. Every variable already has a sensible low,
        mode and high, so change the numbers rather than starting from blank.
      </Step>
      <Step n={2} title="Set your five variables">
        Reserves, oil price, capex, opex and decline rate. Enter each as low, most likely, high.
      </Step>
      <Step n={3} title="Set the economic settings">
        Discount rate, tax rate, royalty rate, project life and iteration count. All three rates
        are percentages, so a ten percent discount rate is entered as 10.
      </Step>
      <Step n={4} title="Run and read the S curve first">
        The S curve tells you the probability of clearing any given NPV. The KPI cards give you
        the three percentile outcomes and the probability that NPV is positive.
      </Step>
    </GuideSection>

    <GuideSection id="variables">
      <SectionHeading icon={Sliders}>The five variables</SectionHeading>
      <Table
        headers={['Variable', 'Unit', 'Default low, mode, high', 'Notes']}
        rows={[
          ['Oil Reserves', 'MMSTB', '80, 100, 120', 'Recoverable volume. The production profile is scaled so cumulative production equals this exactly.'],
          ['Initial Oil Price', '$/STB', '60, 70, 85', 'Flat for the whole project life. There is no escalation.'],
          ['CAPEX', '$MM', '450, 500, 600', 'Spent entirely at time zero and not discounted.'],
          ['OPEX', '$/boe', '18, 20, 25', 'Charged per barrel produced.'],
          ['Decline Rate', 'percent per year', '8, 10, 12', 'Sets the shape of the profile. Read the warning below about which way it moves NPV.'],
        ]}
      />
      <Para>
        Every variable is sampled from a triangular distribution, and all five are sampled
        independently. There is no correlation between them, so the simulation will happily
        draw the highest reserves alongside the lowest price.
      </Para>
      <Callout tone="warn" title="The five variables are fixed">
        The engine recognises these five by name. The Add Variable button appends a row, but the
        name cannot be edited and the engine will not read it, so a new variable has no effect
        beyond adding a zero length bar to the tornado. Deleting one of the five is worse: the
        model then has a missing input and every result becomes NaN.
      </Callout>
    </GuideSection>

    <GuideSection id="settings">
      <SectionHeading icon={Calculator}>Economic settings</SectionHeading>
      <Table
        headers={['Setting', 'Unit', 'Default', 'Notes']}
        rows={[
          ['Discount Rate', 'percent', '10', 'Applied at year end. Enter 10 for ten percent.'],
          ['Tax Rate', 'percent', '30', 'Applied to profit before tax when positive.'],
          ['Royalty Rate', 'percent', '12.5', 'Applied to gross revenue.'],
          ['Project Life (yrs)', 'years', '20', 'The production profile is spread across this many years.'],
          ['Iterations', 'count', '5000', 'Number of Monte Carlo draws.'],
        ]}
      />
      <Callout tone="danger" title="Do not set iterations to zero">
        A zero or blank iteration count produces an empty result set, and the results panel
        cannot render it. The page will error rather than showing a friendly message. Keep the
        count at a few thousand. Very large counts freeze the browser while the run completes,
        because the simulation runs on the main thread.
      </Callout>
      <Para>
        The three rates are percentages. Entering <Code>0.1</Code> for a ten percent discount
        rate gives you a discount rate of one tenth of one percent, and the app will accept it.
      </Para>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>The cash flow model</SectionHeading>
      <Para>
        Each iteration builds a production profile, runs it through an annual cash flow, and
        discounts back to a single NPV.
      </Para>
      <SubHeading>The production profile</SubHeading>
      <Para>
        Production declines geometrically at the sampled decline rate. The first year rate is
        chosen so that the sum of production over the project life equals the sampled reserves
        exactly.
      </Para>
      <Formula>q(year) = q1 · (1 - D)^(year - 1)</Formula>
      <Para>
        This is the most important property of the model to understand, and it drives the
        counterintuitive result described below.
      </Para>
      <SubHeading>The annual cash flow</SubHeading>
      <Formula>revenue = production · price</Formula>
      <Formula>profit before tax = revenue - royalty - opex</Formula>
      <Formula>tax = profit before tax &gt; 0 ? profit before tax · tax rate : 0</Formula>
      <Formula>NPV = -capex + sum of (profit before tax - tax) / (1 + discount)^year</Formula>
      <Callout tone="danger" title="A steeper decline raises NPV here">
        Because the profile is scaled so cumulative production always equals reserves, changing
        the decline rate does not change how much oil is produced. It only changes when. A
        steeper decline pulls the same barrels forward in time, so they discount less and NPV
        goes up. If you read the tornado expecting steeper decline to hurt the project, you will
        read it backwards. This is a property of the model rather than of the reservoir.
      </Callout>
      <SubHeading>What the model leaves out</SubHeading>
      <Para>
        There is no depreciation or depletion allowance, no tax loss carried forward, no capex
        phasing, no abandonment cost, no price escalation or inflation, no working capital, no
        ring fencing, and no gas revenue. Capex lands entirely at time zero and is not
        discounted. Discounting is at year end, so the first year is discounted a full year,
        which gives a lower NPV than a mid year convention on the same inputs.
      </Para>
    </GuideSection>

    <GuideSection id="results">
      <SectionHeading icon={LineChart}>Reading the results</SectionHeading>
      <SubHeading>The four cards</SubHeading>
      <Table
        headers={['Card', 'What it is']}
        rows={[
          ['P90', 'The low outcome. Ninety percent of iterations came out above this.'],
          ['P50', 'The median outcome.'],
          ['P10', 'The high outcome. Ten percent of iterations came out above this.'],
          ['Chance of success', 'The percentage of iterations where NPV was greater than zero.'],
        ]}
      />
      <Callout tone="warn" title="Chance of success here means chance of a positive NPV">
        It is a commercial probability computed from this simulation. It is not a geological
        chance of success and it carries no trap, reservoir, charge or seal risking. If you need
        a geological Pg, that lives in ReservoirCalc Pro's prospect risking, and the two numbers
        multiply rather than substitute for one another.
      </Callout>
      <SubHeading>S curve</SubHeading>
      <Para>
        The cumulative distribution. Read it by picking an NPV on the horizontal axis and
        reading the probability of being below it on the vertical. Note that points are spaced
        by rank rather than by value, so the horizontal shape is stretched relative to a true
        cumulative distribution plot. Use it for percentiles rather than for judging the shape
        of the tails.
      </Para>
      <SubHeading>Histogram</SubHeading>
      <Para>
        The same results binned into twenty equal width bins between the minimum and maximum
        outcome. This is where you see skew and whether the distribution is single peaked.
      </Para>
    </GuideSection>

    <GuideSection id="sensitivity">
      <SectionHeading icon={Activity}>The tornado</SectionHeading>
      <Para>
        The tornado is computed separately from the Monte Carlo run. It starts from a base case
        with every variable at its mode, then moves one variable at a time to its low bound and
        then its high bound, holding everything else at the mode. The bar length is the
        difference between those two NPVs.
      </Para>
      <Callout tone="warn" title="The bars show size and not direction">
        Only the magnitude of the swing is recorded, so a bar tells you how much a variable
        matters and not which way it pushes NPV. Combine it with the cash flow model above to
        reason about direction, and remember the decline rate behaves opposite to intuition
        here.
      </Callout>
      <Para>
        Because it is a one factor at a time analysis, it also cannot show interaction between
        variables. Two inputs that are individually modest can matter a great deal together, and
        this chart will not reveal that.
      </Para>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>Variables are sampled independently</SubHeading>
      <Para>
        Real projects have correlated uncertainty. Larger fields tend to cost more to develop,
        and price and cost inflation often move together. None of that is modelled here, which
        widens the distribution relative to a correlated model.
      </Para>
      <SubHeading>Project name is decorative</SubHeading>
      <Para>
        The project name field is not used by the engine and does not appear in the results.
      </Para>
      <SubHeading>Percent icons do not render on the rate fields</SubHeading>
      <Para>
        Discount, tax and royalty show no unit next to the box. They are all percentages.
      </Para>
      <SubHeading>A single simulation is not a reserves report</SubHeading>
      <Para>
        The percentile outcomes here are NPV percentiles from an assumed input distribution.
        They are not reserves categories in the SPE PRMS sense, and P90 NPV is not the same
        thing as the NPV of 1P reserves. Use the output to compare options and to see which
        uncertainty dominates, and keep formal booking in the reserves process where it belongs.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default RiskedReservesHelpGuide;
