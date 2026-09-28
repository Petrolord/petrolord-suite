// In-app help guide for Forecast Scenario Hub.
//
// The app shipped without help. The two things a user cannot infer from the
// screen are that "Decline (%/yr)" is nominal rather than effective, and that
// an economic limit of zero disables the cutoff. Both are documented
// prominently below. Senior test T1 (2026-09-26): EUR now runs to the
// economic limit under a 50 year maximum life, and the horizon cumulative
// is its own column.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Layers, Calculator, LineChart, Share2, Save, AlertTriangle,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'cases', icon: Layers, title: 'Building cases' },
  { id: 'engine', icon: Calculator, title: 'How the forecast is computed' },
  { id: 'results', icon: LineChart, title: 'Reading the results' },
  { id: 'economics', icon: Calculator, title: 'Indicative economics' },
  { id: 'handoff', icon: Share2, title: 'Sending it to Economics' },
  { id: 'saving', icon: Save, title: 'Saving scenario sets' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const ForecastScenarioHubHelpGuideContent = () => (
  <HelpGuideShell
    title="Forecast Scenario Hub Help Guide"
    subtitle="Comparing multi-case Arps forecasts and handing the profile to Economics"
    metaDescription="How to use Forecast Scenario Hub: building cases, the decline convention, reading the comparison table, and exporting the annual profile."
    backTo="/dashboard/apps/reservoir/forecast-scenario-hub"
    backLabel="Back to Forecast Scenario Hub"
    sections={sections}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        Forecast Scenario Hub runs several Arps decline cases side by side and compares them on
        the numbers that matter for ranking: estimated ultimate recovery, cumulative at five
        years, time to the economic limit, and an indicative NPV. It is the place to bracket a
        forecast into low, base and high cases before any of it reaches a fiscal model.
      </Para>
      <Para>
        The decline engine here is the same one Decline Curve Analysis uses, so a case built
        from a DCA fit will forecast identically in both apps.
      </Para>
      <Callout tone="info" title="Where this sits in the workflow">
        Decline Curve Analysis fits history and gives you the parameters. This app takes
        parameters you already have and compares scenarios built from them. Petroleum Economics
        Studio and NPV Scenario Builder own valuation. The economics on this screen are for
        ranking cases against each other and nothing more.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Start from the three shipped cases">
        The app opens with Base, High (infill support) and Low (no workovers) already
        populated. Edit those rather than starting from empty, because every field is a plain
        number box with no guidance on screen.
      </Step>
      <Step n={2} title="Set the five parameters per case">
        Initial rate, decline, b factor, horizon and economic limit. Read the decline
        convention section below before typing a decline, because it is nominal.
      </Step>
      <Step n={3} title="Set the three economics inputs">
        Price, opex and discount rate sit in their own card and apply to every case at once.
      </Step>
      <Step n={4} title="Read the comparison table, not just the chart">
        The chart shows shape. The table carries the ranking numbers, and each row has an
        Annual CSV button that exports that case's yearly profile.
      </Step>
    </GuideSection>

    <GuideSection id="cases">
      <SectionHeading icon={Layers}>Building cases</SectionHeading>
      <Table
        headers={['Field', 'Unit', 'Meaning', 'Default on a new case']}
        rows={[
          ['qi', 'bbl/d', 'Initial rate at the start of the forecast.', '1000'],
          ['Decline', 'percent per year, nominal', 'The nominal annual decline. See the warning below.', '18'],
          ['b factor', 'dimensionless', '0 gives exponential, 1 gives harmonic, anything else is hyperbolic.', '0.5'],
          ['Horizon', 'years', 'How long the forecast runs if the economic limit is never reached.', '20'],
          ['Econ limit', 'bbl/d', 'Rate at which the forecast stops. Zero disables the cutoff.', '30'],
        ]}
      />
      <Callout tone="danger" title="Decline is the nominal rate">
        The engine converts your entry to a daily nominal decline by dividing by 365. It does
        not convert between nominal and effective. Entering 18 for an exponential case
        produces a first year drop of about 16.5 percent, because that is what a nominal 18
        percent works out to. If you are copying a secant effective decline off a decline
        analysis report, convert it first or your forecast will decline too slowly and your
        EUR will be too high.
      </Callout>
      <SubHeading>Adding, duplicating and deleting</SubHeading>
      <Para>
        Duplicate is the fastest way to build a sensitivity: copy the base case and change one
        parameter. Add case creates a case named after the current count, so deleting a case
        and then adding one can produce two cases with the same name. Each case keeps its own
        line on the chart, but the legend and table will show the same label twice, so rename
        to keep them apart.
      </Para>
      <Para>
        Six colours are available. A seventh case reuses the first colour.
      </Para>
      <Callout tone="warn" title="Clearing a box writes zero">
        Every numeric field falls back to zero when emptied. Clearing the economic limit does
        not mean no limit in the sense of leaving it unset, it means zero, which disables the
        cutoff, so EUR then runs to the 50 year maximum life. Clearing qi or the horizon puts the case into an error state and the row is
        replaced with a message telling you the values must be positive.
      </Callout>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>How the forecast is computed</SectionHeading>
      <Para>
        The engine steps day by day from day one, using the standard Arps forms with a 365 day
        year. The horizon run gives the chart, the horizon cumulative, the annual profile and
        the indicative NPV. For EUR the same decline is followed on past the horizon.
      </Para>
      <Formula>q(t) = qi · exp(-Di · t)  for b = 0</Formula>
      <Formula>q(t) = qi / (1 + Di · t)  for b = 1</Formula>
      <Formula>q(t) = qi / (1 + b · Di · t)^(1/b)  otherwise</Formula>
      <Para>
        Cumulative production is the running sum of daily rates rather than an analytical
        integral, so it carries a small numerical difference from the closed form. Measured
        against the analytic result on the three shipped cases, that difference is under 0.03
        percent, which is far below the uncertainty in any of your inputs. The forecast stops on
        the first day the rate falls below the economic limit, and that day is not added to the
        cumulative.
      </Para>
      <SubHeading>What EUR means here</SubHeading>
      <Para>
        EUR is the cumulative from the forecast start to the economic limit, whatever the
        horizon. When the limit lies beyond 50 years, or there is no limit, the forecast is
        stopped at a 50 year maximum life, as reserves software does, and the table marks that
        EUR with "50 yr max life". A slow hyperbolic decline can take a very long time to reach
        a low limit (the shipped High case reaches 30 bbl/d after about 148 years), so a
        capped EUR is a sign that the limit or the b factor deserves a second look. Changing
        the horizon changes the horizon cumulative but not the EUR.
      </Para>
      <SubHeading>Time starts at day one</SubHeading>
      <Para>
        The first forecast point is one day after the start, so the first plotted rate is
        already slightly below qi. Over a twenty year case this is invisible, but it explains a
        small difference against a hand calculation that starts at time zero.
      </Para>
    </GuideSection>

    <GuideSection id="results">
      <SectionHeading icon={LineChart}>Reading the results</SectionHeading>
      <SubHeading>The rate profile chart</SubHeading>
      <Para>
        One line per case. A line that ends before the right edge is a case that reached its
        economic limit inside the horizon. The axis is years from the forecast start, with a
        point every 30 days plus the last day of the horizon. Use it for shape and crossover,
        and read volumes from the table.
      </Para>
      <SubHeading>The comparison table</SubHeading>
      <Table
        headers={['Column', 'What it is', 'What to watch']}
        rows={[
          ['Model', 'Exponential, Harmonic or Hyperbolic, derived from b.', 'A b above 1 still shows as Hyperbolic and is accepted without warning.'],
          ['Cum @5 yr (MMbbl)', 'Cumulative at five years.', 'For a horizon under five years the cell reads the horizon and says so under the value.'],
          ['Cum to horizon (MMbbl)', 'Cumulative over the horizon, or to the limit if it comes first.', 'This is the volume in the chart, the annual CSV and the NPV.'],
          ['EUR (MMbbl)', 'Cumulative to the economic limit.', 'Marked "50 yr max life" when the limit is further out or disabled.'],
          ['Time to limit (yr)', 'When the rate crosses the economic limit.', 'Marked "past horizon" when that is after the horizon; "> 50" when beyond the maximum life; "No limit" when the limit is zero.'],
          ['Indicative NPV ($MM)', 'Ranking number only. See the next section.', 'Never includes capex, so it is positive whenever price exceeds opex.'],
          ['Handoff', 'Annual CSV export for that case.', 'The year column is a sequence starting at 1, not a calendar year.'],
        ]}
      />
      <Callout tone="info" title="Horizon and economic life are separate">
        The horizon is the window you want to plan and hand off. The economic life is when the
        rate reaches the limit. A case whose time to limit reads "past horizon" is still
        producing above the limit at the end of the horizon, and its EUR is larger than its
        horizon cumulative by the tail you have not planned.
      </Callout>
    </GuideSection>

    <GuideSection id="economics">
      <SectionHeading icon={Calculator}>Indicative economics</SectionHeading>
      <Para>
        The three economics inputs are global. They apply to every case at once, so you cannot
        price one case differently from another. Changing any of them reranks the whole set.
      </Para>
      <Formula>cash flow (year i) = annual oil · (price - opex)</Formula>
      <Formula>NPV = sum over years of cash flow / (1 + discount)^i</Formula>
      <Para>
        That is the entire calculation. Discounting is at year end, so the first year is
        discounted a full year.
      </Para>
      <Callout tone="danger" title="What this NPV leaves out">
        There is no capex, no abandonment, no royalty, no tax, no fiscal regime, no price
        escalation, no inflation, no working interest, and no gas or liquids revenue. Because
        capex is absent, the number is positive for any case where price exceeds opex. It can
        rank cases against one another. It can never tell you whether a project is economic.
        For that, export the profile and use Petroleum Economics Studio or NPV Scenario
        Builder.
      </Callout>
    </GuideSection>

    <GuideSection id="handoff">
      <SectionHeading icon={Share2}>Sending it to Economics</SectionHeading>
      <SubHeading>The annual CSV</SubHeading>
      <Para>
        The Annual CSV button on each table row writes two columns, <Code>year</Code> and
        <Code> production_bbl</Code>, one row per year of that case's horizon. The year column
        counts from 1, so mapping it onto calendar years is done by whoever consumes it. Years
        after the economic limit are written as zero rather than omitted.
      </Para>
      <SubHeading>The direct import into Petroleum Economics Studio</SubHeading>
      <Para>
        You do not have to move a file by hand. In a Petroleum Economics Studio case, the
        Import from Forecast Scenario Hub button reads your saved scenario sets directly. You
        pick a saved set, then a case within it, then a first production year, and the studio
        rebuilds the annual profile with this same decline engine and writes it into the case's
        production volumes.
      </Para>
      <Para>
        Two things to know about that route. The set must be saved first, because the import
        reads saved sets rather than what is currently on your screen. And the first production
        year you choose there is what turns this app's year 1 into a calendar year.
      </Para>
    </GuideSection>

    <GuideSection id="saving">
      <SectionHeading icon={Save}>Saving scenario sets</SectionHeading>
      <Para>
        Type a name into the box at the bottom of the left rail and click the save icon. A
        scenario set stores the case definitions and the three economics settings. Results are
        not stored, they are recomputed from the inputs when you load, which is why a set
        loaded a month later gives the same answer.
      </Para>
      <Callout tone="info" title="Saving under the same name updates the set">
        Saving under a name you have used before overwrites that set with what is on screen.
        Use a new name to keep both. Delete in the Load dialog asks for a second click before
        it removes a set.
      </Callout>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>A b factor above 1 is accepted</SubHeading>
      <Para>
        Only a negative b is rejected. Values above 1 give a decline that flattens without ever
        terminating, and the EUR grows quickly with b. If you are booking anything from a case
        with b above 1, make sure the economic limit is doing real work, because the 50 year
        maximum life will otherwise be what sets your EUR.
      </Para>
      <SubHeading>Cases cannot be seeded from a fit</SubHeading>
      <Para>
        There is no inbound handoff from Decline Curve Analysis. Parameters from a fit have to
        be typed in here. When you do that, take qi and Di from the fit rather than from the
        raw data, and remember the decline convention above.
      </Para>
      <SubHeading>The economics card has no capex box for a reason</SubHeading>
      <Para>
        It is not an omission to be worked around by netting capex off the price. Doing that
        distorts the discounting, because capex is spent up front while the price applies
        across the whole profile. Export the profile instead.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

// Design system rollout batch 2A: the guide follows the same per-user theme
// as Forecast Scenario Hub itself, so the look does not flip between the two pages.
const ForecastScenarioHubHelpGuide = () => (
  <div className="min-h-screen" data-testid="fsh-help-root">
    <ForecastScenarioHubHelpGuideContent />
  </div>
);

export default ForecastScenarioHubHelpGuide;
