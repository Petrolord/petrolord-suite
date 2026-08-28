// In-app help guide for Well Spacing Optimizer.
//
// This guide was scoped in the 2026-08-27 reservoir help pass and deliberately
// withheld, because the app produced wrong numbers and its headline
// recommendation was a Math.floor artifact. Written now that the engine is
// corrected and the fabricated optimum is gone. The central job of this guide
// is to be clear about what the model does and does not contain, because the
// most damaging way to use this app is to read a spacing recommendation out of
// it that the physics cannot support.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, Calculator, LineChart, AlertTriangle, Share2,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'model', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'inputs', icon: Sliders, title: 'The inputs' },
  { id: 'engine', icon: Calculator, title: 'How a case is computed' },
  { id: 'results', icon: LineChart, title: 'Reading the results' },
  { id: 'choosing', icon: Share2, title: 'Choosing a spacing' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const WellSpacingHelpGuide = () => (
  <HelpGuideShell
    title="Well Spacing Optimizer Help Guide"
    subtitle="Spacing economics at a stated recovery factor"
    metaDescription="How to use Well Spacing Optimizer: what the model contains, what it deliberately does not, and how to read the spacing economics table."
    backTo="/dashboard/apps/reservoir/well-spacing-optimizer"
    backLabel="Back to Well Spacing Optimizer"
    sections={sections}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        Well Spacing Optimizer sweeps a range of well spacings and, for each one, reports how many
        wells fit, how much of the field they drain, what they cost, how much they produce inside
        your project duration, the cost per barrel and the field NPV. It is a screening tool for
        the capital and economics side of a spacing decision.
      </Para>
      <Para>
        It is built around one assumption that governs everything else, and the next section is
        about that assumption. Read it before you use any number from here.
      </Para>
    </GuideSection>

    <GuideSection id="model">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="danger" title="There is no interference physics in this model">
        Every well is given the recovery factor you entered over the area it drains. Nothing in the
        calculation makes a well recover less because its neighbours are close, and nothing makes a
        wider spacing leave oil behind beyond the area that no well covers. Downspacing therefore
        cannot improve recovery here, and wide spacing cannot damage it.
      </Callout>
      <Para>
        That has a consequence you will see immediately in the results. Because total field volume
        barely changes with spacing while capital falls as wells are removed, NPV rises with
        spacing. The highest NPV in any range you choose will be close to the widest spacing that
        divides your area with the least waste.
      </Para>
      <Callout tone="warn" title="Which is why the app does not nominate an optimum">
        An earlier version reported an Optimal Spacing Recommendation. That number turned out to be
        arithmetic rather than engineering: it was whichever spacing happened to divide the
        reservoir area most evenly, because the leftover undrained remainder was the only thing
        distinguishing one case from another. It has been removed. The table is the output.
      </Callout>
      <SubHeading>So what is it good for</SubHeading>
      <Para>
        It answers the capital question cleanly. Given a recovery factor you are willing to defend,
        it tells you what each spacing costs, how long the wells last, what they produce inside your
        project life, and what that does to cost per barrel and NPV. That is genuinely useful for
        bracketing a development, sizing a drilling programme and testing price and cost
        sensitivity by re-running.
      </Para>
      <Para>
        What it cannot do is tell you the recovery factor. That has to come from somewhere else:
        analogue fields, material balance, or a simulation model. If your question is how much
        recovery downspacing buys, that is a simulation question and belongs in Reservoir Simulation
        Studio.
      </Para>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Fill in the field, rock and fluid basics">
        Reservoir area, average net pay, porosity, initial water saturation and recovery factor.
        Watch the units: porosity and recovery factor are percentages while water saturation is a
        fraction.
      </Step>
      <Step n={2} title="Give the well and economic parameters">
        Well cost, annual opex per well, minimum economic rate, decline rate, prices, discount rate,
        project duration and the combined royalty and tax rate.
      </Step>
      <Step n={3} title="Set the spacing range">
        Minimum, maximum and increment, in acres per well. Start wide and coarse to see the shape,
        then narrow the range and reduce the increment around the region you care about.
      </Step>
      <Step n={4} title="Calculate and read the table">
        Every spacing in the range gets a row. The charts show the same information as curves. There
        is no recommended row to look for; the choice is yours to make from the table.
      </Step>
      <Callout tone="info" title="Nothing is saved">
        This app has no projects. Inputs and results are lost on reload, and there are no defaults,
        so you will be retyping everything. Export the CSV or the JSON before you navigate away.
      </Callout>
    </GuideSection>

    <GuideSection id="inputs">
      <SectionHeading icon={Sliders}>The inputs</SectionHeading>
      <SubHeading>The mixed unit convention, which catches people</SubHeading>
      <Table
        headers={['Input', 'Unit', 'Note']}
        rows={[
          ['Porosity', 'percent', 'Enter 15 for fifteen percent.'],
          ['Recovery factor', 'percent', 'Enter 35 for thirty five percent.'],
          ['Initial water saturation', 'fraction', 'Enter 0.25 for twenty five percent. This one differs from the two above.'],
          ['Decline rate', 'percent per year', 'Effective annual decline. Must be below 100.'],
          ['Discount rate, royalties and taxes', 'percent', 'Royalties and taxes are a single combined deduction on gross revenue.'],
          ['Well cost, opex', 'dollars', 'Raw dollars. Opex is a flat annual charge per well.'],
          ['Spacing range', 'acres per well', 'Minimum, maximum and increment.'],
        ]}
        widths={[2.2, 1.5, 2.9]}
      />
      <Para>
        Entering water saturation as 25 rather than 0.25 is now rejected with a message naming the
        field. It used to be accepted, which made the mobile pore volume negative and produced
        nonsense throughout the table with no warning at all.
      </Para>
      <SubHeading>Inputs that are recorded and not used</SubHeading>
      <Para>
        Reservoir temperature, reservoir pressure, oil gravity, gas gravity, well pattern type and
        the map coordinates are stored on the case and travel into the JSON export. They enter no
        equation in this engine. They are no longer marked required, because requiring them implied
        they were doing something.
      </Para>
      <Callout tone="info" title="Why that matters for a future version">
        Those inputs are exactly what a productivity model would need. If this app is ever given
        rate physics, pressure, temperature and gravity would feed the fluid properties and the
        drawdown, and only permeability and a flowing bottomhole pressure would be genuinely new.
        That is the change that would make an optimum meaningful.
      </Callout>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>How a case is computed</SectionHeading>
      <SubHeading>Wells and volume</SubHeading>
      <Formula>wells = floor(reservoir area / spacing)</Formula>
      <Formula>coverage = wells * spacing / reservoir area</Formula>
      <Formula>EUR per well = spacing * net pay * porosity * (1 - Sw) * 7758 * RF</Formula>
      <Formula>field recovery = coverage * RF</Formula>
      <Para>
        The well count is a whole number, so a spacing that does not divide the area evenly leaves a
        remainder undrained. That remainder is the entire reason the field recovery curve steps up
        and down rather than running smoothly, and it is why the Coverage column sits beside it in
        the table.
      </Para>
      <SubHeading>Rate and life</SubHeading>
      <Para>
        Each well declines exponentially from an initial rate down to your minimum economic rate,
        and the initial rate is chosen so the volume produced across that decline is exactly the
        well's EUR. That is what keeps the rate stream and the EUR in the same row consistent.
      </Para>
      <Formula>Dn = -ln(1 - decline rate)</Formula>
      <Formula>qi = EUR * Dn + q at the economic limit</Formula>
      <Formula>economic life = ln(qi / q limit) / Dn</Formula>
      <Para>
        The life used for the cash flow is the shorter of that economic life and your project
        duration. When the duration is the binding one, the well stops before it reaches its
        economic rate and produces less than its EUR. Those rows are marked in the table, and the
        Produced per Well column is what the economics use.
      </Para>
      <SubHeading>Cash flow</SubHeading>
      <Formula>revenue = oil * oil price + associated gas * gas price</Formula>
      <Formula>net revenue = revenue * (1 - royalties and taxes)</Formula>
      <Formula>NPV per well = sum of (net revenue - opex) discounted at year end, minus well cost</Formula>
      <Para>
        Associated gas comes from the solution GOR applied to the oil rate. The well cost lands at
        time zero and is not discounted. Discounting is at year end.
      </Para>
      <Callout tone="warn" title="What the cash flow leaves out">
        There is no facilities or infrastructure capital, no abandonment cost, no drilling schedule
        (every well is treated as producing from year one), no price escalation or inflation, and no
        tax loss carried forward. A real development drills over several years, and that alone will
        move NPV more than most of the spacing differences you see here.
      </Callout>
    </GuideSection>

    <GuideSection id="results">
      <SectionHeading icon={LineChart}>Reading the results</SectionHeading>
      <Table
        headers={['Column', 'What it means']}
        rows={[
          ['Number of Wells', 'Whole wells that fit in the area at this spacing.'],
          ['Coverage', 'Share of the field those wells drain. Below 100 percent means a remainder is left undrained.'],
          ['EUR per Well', 'What the well would ultimately recover if it ran to its economic rate.'],
          ['Produced per Well', 'What it actually produces inside your project duration. A marker means the duration truncated it.'],
          ['Field Recovery', 'Coverage times your recovery factor. It steps because coverage steps.'],
          ['Total Capex', 'Well cost times well count, in millions.'],
          ['NPV', 'Field NPV in millions, at your discount rate.'],
          ['Cost per Barrel', 'Capital plus opex divided by the volume actually produced.'],
        ]}
        widths={[1.9, 4.7]}
      />
      <SubHeading>The three charts</SubHeading>
      <Para>
        NPV, field recovery and cost per barrel against spacing. All three are plotted in spacing
        order. If you have used an older version and remember these curves zigzagging, that was a
        defect: the results array was being sorted by cost per barrel before it reached the chart,
        so the curves were drawn across an axis that was not in order.
      </Para>
      <Para>
        Cost per barrel is the most useful of the three for a screening conversation, because it
        falls smoothly with spacing and is not distorted by the coverage steps in the way NPV is.
      </Para>
    </GuideSection>

    <GuideSection id="choosing">
      <SectionHeading icon={Share2}>Choosing a spacing</SectionHeading>
      <Para>
        The table will not choose for you and should not. A sensible way to use it:
      </Para>
      <Step n={1} title="Rule out what the field cannot support">
        Take your drainage understanding from elsewhere and discard spacings wider than a well can
        realistically drain. The model will happily suggest one well on the whole field, and the
        reason it does is that it has no drainage physics to stop it.
      </Step>
      <Step n={2} title="Look at coverage before NPV">
        Prefer spacings with high coverage. A case that leaves fifteen percent of the field
        undrained is being penalised here purely for that, and in reality you would infill it.
      </Step>
      <Step n={3} title="Read cost per barrel across the surviving cases">
        This is where the capital efficiency argument lives, and it is the number that transfers
        cleanly into a development discussion.
      </Step>
      <Step n={4} title="Check whether the duration is truncating">
        If most rows are marked as truncated, your project duration rather than your spacing is
        setting the volume. Extend it or accept that you are comparing acceleration rather than
        recovery.
      </Step>
      <Step n={5} title="Re-run at a low and a high price">
        There is no built-in sensitivity analysis. Changing the price and recalculating is the
        honest way to test robustness, and it takes seconds.
      </Step>
      <Callout tone="warn" title="On the sensitivity panel that used to be here">
        An earlier version displayed three sensitivity cards for oil price, well cost and recovery
        factor. Those numbers were hard-coded arithmetic on the chosen spacing rather than a re-run
        of the model, and the base row was labelled at a fixed 75 dollar oil price whatever you had
        entered. The panel has been removed. Re-running with different inputs is the replacement.
      </Callout>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>Treating the highest NPV row as a recommendation</SubHeading>
      <Para>
        It is the widest well-covering spacing in the range you happened to type. Widen the range
        and the answer moves. That is the clearest sign that the number is a property of your range
        rather than of your reservoir.
      </Para>
      <SubHeading>Dollars are in millions on screen</SubHeading>
      <Para>
        The NPV and capex columns are labelled in millions. The well cost and opex you type are raw
        dollars.
      </Para>
      <SubHeading>Every well is assumed on stream in year one</SubHeading>
      <Para>
        There is no drilling schedule. A hundred well programme does not appear all at once in
        reality, and a tight spacing suffers far more from that omission than a wide one, so the
        model is systematically kind to high well counts on timing while being kind to low well
        counts on capital.
      </Para>
      <SubHeading>Opex does not scale with rate</SubHeading>
      <Para>
        It is a flat annual charge per well for the life of the well, so a low rate well late in
        life carries the same operating cost as a new one.
      </Para>
      <SubHeading>Nothing is saved and nothing is prefilled</SubHeading>
      <Para>
        Two dozen inputs, no defaults and no persistence. Export before you leave the page.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default WellSpacingHelpGuide;
