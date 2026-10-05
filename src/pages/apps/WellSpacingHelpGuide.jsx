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
  BookOpen, Zap, Sliders, Calculator, LineChart, AlertTriangle, Share2, Gauge, Link2, FileText,
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
  { id: 'drainage', icon: Gauge, title: 'Drainage, timing and deliverability' },
  { id: 'intakes', icon: Link2, title: 'Values from other apps' },
  { id: 'report', icon: FileText, title: 'Saving, sharing and the report' },
  { id: 'choosing', icon: Share2, title: 'Choosing a spacing' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const WellSpacingHelpGuideContent = () => (
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
        arithmetic with no engineering in it: it was whichever spacing happened to divide the
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
      <Step n={1} title="Start from the example field, or a saved project">
        Load example field fills every input with an illustrative case (it is labelled as a sample
        until you change it), or open a saved project from the picker. A new project opens in the
        unit system of your Suite unit profile; Oilfield or SI is switched in the header.
      </Step>
      <Step n={2} title="Fill in the field, rock and fluid basics">
        Reservoir area, average net pay, porosity, initial water saturation and recovery factor.
        Watch the units: porosity and recovery factor are percentages while water saturation is a
        fraction. Give a Bo if you have one from the lab or from Fluid Systems Studio; blank, the
        app uses Standing&apos;s correlation and says so.
      </Step>
      <Step n={3} title="Give the well and economic parameters">
        Well cost, annual opex per well, economic limit rate, decline rate (effective, per year),
        prices, discount rate, project duration and the royalty on gross revenue.
      </Step>
      <Step n={4} title="Set the spacing range and the layout">
        Smallest, largest and step, in acres or hectares per well. The layout (square or staggered
        grid) sets the distance between neighbouring wells for a spacing.
      </Step>
      <Step n={5} title="Read the table as you type">
        The cases recompute on every edit; there is no Calculate button and no stale table. When an
        input is missing or out of range the panel lists what needs attention instead of numbers.
      </Step>
      <Step n={6} title="Add the drainage inputs">
        Average and flowing pressure, permeability, skin, oil viscosity, total compressibility and
        wellbore radius give each case its interference time, pseudosteady time and deliverable
        rate. Take them from Well Test and Fluid Systems Studio where you can.
      </Step>
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
        Entering water saturation as 25 when you mean 0.25 is now rejected with a message naming the
        field. It used to be accepted, which made the mobile pore volume negative and produced
        nonsense throughout the table with no warning at all.
      </Para>
      <SubHeading>Inputs that are recorded and not used in any equation</SubHeading>
      <Para>
        Only the field name and the map coordinates. They are printed in the report for the
        record. Every other input enters either the case (EUR, NPV and every number of the case
        table) or the drainage diagnostics, and the inputs table of the report says which.
      </Para>
      <Table
        headers={['Input', 'Enters']}
        rows={[
          ['Area, net pay, porosity, Swi, RF, Bo or the fluid that gives it, costs, prices, decline, economic limit, duration, royalty, spacing range', 'The case: EUR, NPV, capex, cost per barrel'],
          ['Average reservoir pressure', 'The deliverable rate, and the pressure at which Bo and viscosity are read from a Fluid Systems Studio table'],
          ['Flowing pressure, permeability, skin, viscosity, total compressibility, wellbore radius, layout', 'The drainage diagnostics only'],
          ['Field name, map coordinates', 'The record only'],
        ]}
        widths={[3.6, 3]}
      />
      <Para>
        Earlier builds asked for a well pattern type (5-spot, 7-spot, line drive) that entered no
        equation; those are waterflood patterns. It is replaced by the layout, which sets the
        distance between wells. A saved 7-spot opens as a staggered grid, the rest as a square grid.
      </Para>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>How a case is computed</SectionHeading>
      <SubHeading>Wells and volume</SubHeading>
      <Formula>wells = floor(reservoir area / spacing)</Formula>
      <Formula>coverage = wells * spacing / reservoir area</Formula>
      <Formula>EUR per well = spacing * net pay * porosity * (1 - Sw) * 7758 * RF / Bo</Formula>
      <Formula>Bo = 0.9759 + 0.00012 * (GOR * sqrt(gas gravity / oil SG) + 1.25 * T)^1.2  (Standing)</Formula>
      <Formula>field recovery = coverage * RF</Formula>
      <Para>
        The well count is a whole number, so a spacing that does not divide the area evenly leaves a
        remainder undrained. That remainder is the entire reason the field recovery curve steps up
        and down and does not run smoothly, and it is why the Coverage column sits beside it in
        the table. Bo turns reservoir barrels into the stock-tank barrels that are sold; it comes
        from the GOR, oil gravity, gas gravity and temperature you enter.
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
      <Formula>NPV = sum over years of (net revenue - opex - well cost in year 1) / (1 + r)^(year - 0.5)</Formula>
      <Para>
        Associated gas comes from the solution GOR applied to the oil rate. NPV is computed by the
        Suite screening economics engine, the same one NPV Scenario Builder uses, with mid-year
        discounting: each year&apos;s cash flow is discounted to the middle of its year, and the well
        cost is spent in the year its well comes on stream and discounted with it. The royalty is one
        percentage of gross revenue. Under Fiscal terms you can add an income tax (with straight-line
        depreciation of the capex and, if you choose, losses carried forward) or a production sharing
        contract (a cost recovery cap and the contractor&apos;s share of profit oil): these are the
        economics engine&apos;s own terms, wired here, and the economics table then splits out the
        income tax and the government&apos;s profit oil. Until October 2026 this app ran its own loop with year-end
        discounting and the well cost undiscounted, so an NPV from an older export is lower than the
        one shown now for the same inputs (by about 6 to 17 percent on the example field).
      </Para>
      <Callout tone="warn" title="What the cash flow leaves out">
        There is no facilities or infrastructure capital, no abandonment cost, no price escalation or
        inflation, no signature bonus and no ring fence. Every well is on stream in year one unless
        you set a drilling schedule; a real development drills over several years, and that alone
        can move NPV more than many of the spacing differences you see here.
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
          ['Between wells', 'Distance from a well to its neighbour on the chosen layout.'],
          ['Capex (US$ MM)', 'Well cost times well count, in US$ million. Earlier builds headed this $M, which in oilfield usage means thousands.'],
          ['NPV (US$ MM)', 'Field NPV in US$ million, at your discount rate, mid-year discounting.'],
          ['Cost (US$/STB)', 'Capital plus opex divided by the volume actually produced.'],
          ['Initial rate', 'The day-one rate of the decline each well is given. It grows with the spacing because the EUR does; hold it against the deliverable rate.'],
        ]}
        widths={[1.9, 4.7]}
      />
      <SubHeading>The four charts</SubHeading>
      <Para>
        NPV, EUR and produced per well, and cost per barrel against spacing, and the plan initial
        rate beside the deliverable rate. All are plotted in spacing order. If you have used an older version and remember these curves zigzagging, that was a
        defect: the results array was being sorted by cost per barrel before it reached the chart,
        so the curves were drawn across an axis that was not in order.
      </Para>
      <SubHeading>Economics by part and the added wells</SubHeading>
      <Para>
        Under the table the economics of each case are split into revenue, royalty, opex and capex,
        which close on the undiscounted net cash; NPV is the same stream discounted. The
        incremental table holds each spacing against the next wider one: the added wells, the
        added capex, the added oil and the added NPV per added well. Under this model the added
        wells add almost no oil, which the table makes plain.
      </Para>
      <Para>
        Cost per barrel is the most useful of the three for a screening conversation, because it
        falls smoothly with spacing and is not distorted by the coverage steps in the way NPV is.
      </Para>
    </GuideSection>

    <GuideSection id="drainage">
      <SectionHeading icon={Gauge}>Drainage, timing and deliverability</SectionHeading>
      <Para>
        Beside each case the app prints what the spacing means for a well, in field units with t in
        hours inside the formulas. The timing never changes an EUR or an NPV. The deliverable rate
        does when the rate limit is on (below).
      </Para>
      <Formula>distance between wells = sqrt(A) on a square grid, sqrt(2 A / sqrt 3) on a staggered grid</Formula>
      <Formula>drainage radius re = sqrt(43,560 A / pi)   (40 acres: 745 ft)</Formula>
      <Formula>radius of investigation ri = sqrt(k t / (948 phi mu ct)), k in md, t in hours</Formula>
      <Formula>pseudosteady state from tDA = 0.0002637 k t / (phi mu ct A) = 0.1</Formula>
      <Formula>deliverable rate q = k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s))</Formula>
      <Para>
        Interference begins when each well&apos;s radius of investigation reaches half the distance
        to its neighbour. The deliverable rate is what a well on that drainage area gives at
        pseudosteady state; CA is 30.88 for a square and 31.6 for a hexagon (Earlougher). When the
        plan initial rate is above the deliverable rate, the unlimited decline starts at a rate the
        well cannot give, and the report flags it.
      </Para>
      <SubHeading>Recovery against spacing (your calibration)</SubHeading>
      <Para>
        By default every case takes the stated recovery factor. Choose Calibrated on your points under
        Reservoir to let recovery respond to spacing: add points of a recovery factor you know at a
        spacing, each with its source (an analog field, a decline type well at its spacing, a
        simulation run). The app fits RF = a + b ln(S) by least squares and gives each case the fit
        at its spacing; there is no built-in curve, and a point with no source is not used. The
        points, the fit and each case&apos;s RF are printed, and a case outside the points is
        flagged as extrapolated. The Monte Carlo range on the RF does not apply in this mode.
      </Para>
      <SubHeading>Sensitivity</SubHeading>
      <Para>
        The sensitivity table moves oil price, capex, opex and the oil volume 30 percent down and up,
        one at a time, for every case. It is the Suite screening engine&apos;s own sweep run on the
        same yearly arrays as the case table, so its base is the case NPV. The oil volume moves the
        oil only (the solution gas is held). The report draws the tornado of the case chosen to
        send, or of the middle case of the range when none is chosen.
      </Para>
      <SubHeading>Uncertainty (Monte Carlo)</SubHeading>
      <Para>
        Give a low and a high around the recovery factor, the reservoir area or the oil price
        (triangular, the value on the form the most likely) and press Run on the uncertainty table.
        The draws come from the Suite&apos;s canonical Monte Carlo sampler, seeded, and every
        realisation runs each case through the same economics engine as the case table, with the
        same draws for every spacing. The seed and the number of realisations are saved with the
        project and printed; the same seed and count give the same numbers. P90 is the low case: a
        90 percent probability that the NPV meets or exceeds it. The PDF export runs it when it is
        asked for, and a run made before an edit is never shown as current.
      </Para>
      <SubHeading>Measurable interference</SubHeading>
      <Para>
        Give an interference test time and a gauge resolution to see, for every case, the pressure
        drop at the neighbouring well when one well produces at its starting rate for that time and
        the neighbour is shut in as the observer. The drop is the line source of Ahmed and McKinney
        Eq. 1.2.134 at the distance between wells, the same function the Step 1 gates hold to their
        Example 1.21 and to the tabulated E1. A drop below the gauge resolution means a test of that
        length would not see the neighbour. On the example field, 7 days and a 0.01 psi gauge see
        the neighbour up to 50 acres a well and not from 60 acres.
      </Para>
      <SubHeading>Drilling schedule</SubHeading>
      <Para>
        All wells come on stream in year 1 unless you choose a schedule under Drilling schedule: so
        many wells a year, or rigs times the wells a rig drills in a year. Each year&apos;s wells
        carry their cost in that year and produce the same per-well profile from the start of it,
        cut at the end of the project duration. A tight spacing on a slow schedule brings wells on
        stream late, so its NPV falls; wells that would start after the project duration ends are
        flagged. On the example field, 2 rigs at 15 wells a rig a year drill the 40-acre case over 5
        years and its NPV falls from US$ 1,885.8 MM to US$ 1,627.7 MM.
      </Para>
      <SubHeading>The rate limit (on by default)</SubHeading>
      <Para>
        With the rate limit on, a well whose decline would start above its deliverable rate
        produces at the deliverable rate first (a plateau), then declines at the stated decline from
        it. The plateau lasts exactly long enough for the volume to the economic limit to stay the
        EUR, so the oil is the same and it arrives later; the NPV of the wide spacings falls, and the
        project duration can cut what is produced.
      </Para>
      <Formula>plateau tp = (qi - qd) / (Dn qd), then q = qd exp(-Dn (t - tp)) to the economic limit</Formula>
      <Para>
        Switch it off under Deliverability and drainage to see the unlimited decline of earlier
        releases. Either way the Rate limit table prints both NPVs for every spacing (each a run of
        the Suite screening economics engine) and the change between them. On the example field
        (5 md) the limit binds from 50 acres a well, and the NPV at 100 acres falls from US$ 2,316.6
        MM to US$ 1,892.6 MM. The deliverable rate is held at the stated average pressure for the
        whole plateau, so a long plateau is optimistic. A deliverable rate at or below the economic
        limit rate means the well never produces at an economic rate.
      </Para>
      <Callout tone="info" title="Checked against published worked examples">
        The deliverable rate reproduces Ahmed and McKinney (2005) Example 1.18, 416 STB/d; the
        drainage radius their 745 ft for 40 acres; the line-source interference their Example 1.21
        arguments. Every constant is pinned with a test that fails if k is typed in darcies or t in
        days.
      </Callout>
    </GuideSection>

    <GuideSection id="intakes">
      <SectionHeading icon={Link2}>Values from other apps</SectionHeading>
      <Para>
        From other apps reads a saved record by id and keeps it with the project, with its source,
        time and method, so the report can say where each value came from.
      </Para>
      <Table
        headers={['Source', 'What it gives']}
        rows={[
          ['Fluid Systems Studio (pvt-1)', 'Bo and oil viscosity read from the project table at your average pressure, the solution GOR, the gravities and the temperature'],
          ['Well Test Analysis Studio (wta-1)', 'Permeability, total skin and the average pressure'],
          ['Material Balance Studio (mbal-1)', 'OOIP, held against the volumetric OOIP of your case'],
          ['Recovery Factor Estimator (rf-1)', 'The oil recovery factor with its method and source; the reservoir estimate is given to each well over its drained area'],
          ['Decline Curve Analysis (dca-forecast-1)', 'One well\'s oil EUR, turned into the drainage area it implies at your rock and RF'],
          ['Wells registry', 'Well names and surface locations: the map in the report and the spacing the wells already have'],
        ]}
        widths={[2.4, 4.2]}
      />
      <Para>
        Each card says As received, Edited after intake when you change a value it gave, or Source
        changed since when the record has been saved again with different content.
      </Para>
      <SubHeading>Sending a case (ws-case-1)</SubHeading>
      <Para>
        Under Send a case, choose one spacing case and its first production date, with a project
        open. Forecast Scenario Hub takes the field oil profile of that case (every well, on its
        drilling schedule, with the rate limit as the case ran it) as a profile case from that date.
        Petroleum Economics Studio takes its oil and solution gas by calendar year as a production
        file; enter the drilling capex of the case there, from the schedule printed on the file
        card. Both read the saved project by id, keep where the numbers came from, and say when the
        case changes here later. Until saving is switched on for this app, nothing can be sent.
      </Para>
    </GuideSection>

    <GuideSection id="report">
      <SectionHeading icon={FileText}>Saving, sharing and the report</SectionHeading>
      <Para>
        A study is saved as a project and can be shared with your organisation, to view or to edit
        one person at a time with a check-out. Until the database table is switched on the page
        says so and keeps the study on screen; export the report or the CSV to keep a copy.
      </Para>
      <Para>
        The Report tab takes the identification (company, field, licence, reservoir, wells, data
        date, analyst) and exports a PDF: the cases, the economics by part, the incremental
        economics, every input with its unit and source, the drainage table, the cross-checks, the
        methods and references, the limits of the analysis, and four figures. The CSV prints in the
        display units of the project.
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
        If most rows are marked as truncated, your project duration is
        setting the volume, and your spacing is not. Extend it or accept that you are comparing
        acceleration more than recovery.
      </Step>
      <Step n={5} title="Hold the plan rate against the deliverable rate">
        Discard cases where the plan initial rate is above what a well can deliver, or lower the
        decline until it is not.
      </Step>
      <Step n={6} title="Re-run at a low and a high price">
        There is no built-in sensitivity analysis. Changing the price is the honest way to test
        robustness; the table follows as you type.
      </Step>
      <Callout tone="warn" title="On the sensitivity panel that used to be here">
        An earlier version displayed three sensitivity cards for oil price, well cost and recovery
        factor. Those numbers were hard-coded arithmetic on the chosen spacing with no re-run
        of the model, and the base row was labelled at a fixed 75 dollar oil price whatever you had
        entered. The panel has been removed. Re-running with different inputs is the replacement.
      </Callout>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <SubHeading>Treating the highest NPV row as a recommendation</SubHeading>
      <Para>
        It is the widest well-covering spacing in the range you happened to type. Widen the range
        and the answer moves. That is the clearest sign that the number is a property of your range.
        It says nothing about your reservoir.
      </Para>
      <SubHeading>Dollars are in US$ million on screen</SubHeading>
      <Para>
        The NPV and capex columns are US$ million (US$ MM). The well cost and opex you type are raw
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
      <SubHeading>A wider spacing gets a higher initial rate</SubHeading>
      <Para>
        The decline is the same at every spacing and is anchored on the EUR, so the initial rate
        grows in proportion to the area. A real well&apos;s rate is set by kh and drawdown and barely
        depends on its drainage area. Read the deliverable rate before trusting a wide case.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

// Design system rollout batch 2A: the guide follows the same per-user theme
// as Well Spacing Optimizer itself, so the look does not flip between the two pages.
const WellSpacingHelpGuide = () => (
  <div className="min-h-screen" data-testid="wso-help-root">
    <WellSpacingHelpGuideContent />
  </div>
);

export default WellSpacingHelpGuide;
