// In-app help guide for Forecast Scenario Hub.
//
// The app shipped without help. The two things a user cannot infer from the
// screen are that "Decline (%/yr)" is nominal rather than effective, and that
// an economic limit of zero silently disables the cutoff so "Time to limit"
// then reports the horizon. Both are documented prominently below.
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

const ForecastScenarioHubHelpGuide = () => (
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
      <Callout tone="danger" title="Decline is nominal, not effective">
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
        and then adding one can produce two cases with the same name. That matters more than it
        sounds, because the chart keys its series on the case name and two identical names
        collapse into a single line. Rename immediately.
      </Para>
      <Para>
        Six colours are available. A seventh case reuses the first colour.
      </Para>
      <Callout tone="warn" title="Clearing a box writes zero">
        Every numeric field falls back to zero when emptied. Clearing the economic limit does
        not mean no limit in the sense of leaving it unset, it means zero, which disables the
        cutoff. Clearing qi or the horizon puts the case into an error state and the row is
        replaced with a message telling you the values must be positive.
      </Callout>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>How the forecast is computed</SectionHeading>
      <Para>
        The engine steps day by day from day one to the end of the horizon, using the standard
        Arps forms with a 365 day year.
      </Para>
      <Formula>q(t) = qi · exp(-Di · t)  for b = 0</Formula>
      <Formula>q(t) = qi / (1 + Di · t)  for b = 1</Formula>
      <Formula>q(t) = qi / (1 + b · Di · t)^(1/b)  otherwise</Formula>
      <Para>
        Cumulative production is the running sum of daily rates rather than an analytical
        integral, so it carries a small numerical difference from the closed form, on the order
        of half a percent. The forecast stops on the first day the rate falls below the economic
        limit, and that day is not added to the cumulative.
      </Para>
      <SubHeading>What EUR means here</SubHeading>
      <Para>
        EUR is the cumulative over the window the forecast actually covered, which is the
        economic limit or the horizon, whichever came first. It is not a true ultimate
        recovery. Extending the horizon on a case that never reaches its limit will increase
        its EUR, so compare cases only when their horizons match.
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
        economic limit. The axis is labelled Month, and each point is a sample taken every 30
        days rather than a calendar month sum, so a twenty year case runs to about month 244
        rather than 240. Use it for shape and crossover, and read volumes from the table.
      </Para>
      <SubHeading>The comparison table</SubHeading>
      <Table
        headers={['Column', 'What it is', 'What to watch']}
        rows={[
          ['Model', 'Exponential, Harmonic or Hyperbolic, derived from b.', 'A b above 1 still shows as Hyperbolic and is accepted without warning.'],
          ['EUR (MMbbl)', 'Cumulative over the covered window.', 'Depends on the horizon when the limit is never reached.'],
          ['Cum @5 yr (MMbbl)', 'Cumulative at five years.', 'For a horizon under five years this is the cumulative at the horizon, still labelled five years.'],
          ['Time to limit (yr)', 'When the rate crossed the economic limit.', 'If the limit was never reached this reports the horizon, so the two cases look identical.'],
          ['Indicative NPV ($MM)', 'Ranking number only. See the next section.', 'Never includes capex, so it is positive whenever price exceeds opex.'],
          ['Handoff', 'Annual CSV export for that case.', 'The year column is a sequence starting at 1, not a calendar year.'],
        ]}
      />
      <Callout tone="warn" title="Time to limit is ambiguous by design">
        The same value appears whether a case genuinely died at that time or simply ran out of
        horizon. If a case reports a time to limit exactly equal to its horizon, check whether
        its final rate is still above the limit before you treat that number as an economic
        life.
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
      <Callout tone="warn" title="Saving twice creates two sets">
        Save always creates a new entry rather than updating an existing one. Saving under a
        name you have used before leaves you with two sets sharing that name, distinguishable
        only by their timestamps. Delete in the Load dialog removes a set immediately with no
        confirmation step.
      </Callout>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>A b factor above 1 is accepted</SubHeading>
      <Para>
        Only a negative b is rejected. Values above 1 give a decline that flattens without ever
        terminating, and the EUR grows quickly with b. If you are booking anything from a case
        with b above 1, make sure the economic limit is doing real work, because the horizon
        will otherwise be what sets your volume.
      </Para>
      <SubHeading>The chart axis says Month and means 30 day sample</SubHeading>
      <Para>
        Points are taken every 30 days. Twelve points is about 360 days rather than a year.
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

export default ForecastScenarioHubHelpGuide;
