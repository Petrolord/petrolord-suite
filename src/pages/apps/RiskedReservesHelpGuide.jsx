// In-app help guide for Risked Reserves Valuation (rewritten for the T1
// rebuild, 2026-09-26). The app values prospects risked in ReservoirCalc
// Pro: commercial chance against the MEFS, EMV after the exploration well,
// break-even Pg and the risked expectation curve, closed form from a
// lognormal fitted to P90 and P10.
//
// Step 2 (2026-10-02): economics and the derived MEFS, the Petroleum
// Economics Studio handoff, sensitivity, re-run, ranking.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, Calculator, LineChart, Layers, AlertTriangle, Save, GitBranch, FileText,
  Coins, BarChart3, RotateCcw, ListOrdered,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'convention', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'saving', icon: Save, title: 'Saving and sharing' },
  { id: 'handoff', icon: GitBranch, title: 'From ReservoirCalc Pro' },
  { id: 'inputs', icon: Sliders, title: 'The inputs' },
  { id: 'economics', icon: Coins, title: 'Economics and the MEFS' },
  { id: 'epe', icon: Coins, title: 'From Petroleum Economics Studio' },
  { id: 'sensitivity', icon: BarChart3, title: 'Sensitivity' },
  { id: 'rerun', icon: RotateCcw, title: 'Re-run a prospect' },
  { id: 'ranking', icon: ListOrdered, title: 'Ranking' },
  { id: 'engine', icon: Calculator, title: 'How it is valued' },
  { id: 'results', icon: LineChart, title: 'Reading the results' },
  { id: 'report', icon: FileText, title: 'The report and the CSV' },
  { id: 'portfolio', icon: Layers, title: 'The portfolio' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const RiskedReservesHelpGuideContent = () => (
  <HelpGuideShell
    title="Risked Reserves Valuation Help Guide"
    subtitle="Commercial chance, EMV and the expectation curve for risked prospects"
    metaDescription="How to use Risked Reserves Valuation: importing risked prospects from ReservoirCalc Pro, the MEFS, EMV after the exploration well, break-even Pg and the portfolio."
    backTo="/dashboard/apps/reservoir/risked-reserves-valuation"
    backLabel="Back to Risked Reserves Valuation"
    sections={sections}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        Risked Reserves Valuation answers the questions an exploration committee asks once a
        prospect has been risked. The geologist sets the geological chance of success (Pg) and
        the success-case volumes in ReservoirCalc Pro. This app takes those prospects and adds
        the economics: how likely the well is to find a field worth developing, what the
        prospect is worth before you drill, and the Pg at which drilling breaks even.
      </Para>
      <Para>
        Every number is closed form, so the same inputs always give the same answer, and it is
        validated against an independent Python oracle in the engines repository.
      </Para>
      <Callout tone="info" title="What is saved">
        Each valuation is saved to your Petrolord account, one per prospect, when you press
        Save. Until you do, your edits are kept in this browser. The prospects themselves stay
        in ReservoirCalc Pro. See Saving and sharing below.
      </Callout>
    </GuideSection>

    <GuideSection id="convention">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warning" title="P90 is the low case">
        Volumes use the petroleum convention: P90 is the low case, exceeded with 90 percent
        probability, and P10 is the high case. P90 must be smaller than P10, and the app will
        not value a prospect until it is.
      </Callout>
      <Para>
        The volumes are the success case: what you find if the well works. The dry hole enters
        through Pg. The risked mean, Pg times the success-case mean, averages the dry hole in and
        is never a volume anyone will find.
      </Para>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Import from ReservoirCalc Pro">
        Import from ReservoirCalc Pro brings in every prospect you risked there, with its Pg
        and success-case P90, P50 and P10. Or add a prospect and type the values here.
      </Step>
      <Step n={2} title="Check the economics of each prospect">
        On the Economics tab, the minimum economic field size and the value of a discovery come
        from one economic model, or from a Petroleum Economics Studio run you pick. Set the
        exploration well cost in the table. The starting model is a screening default; replace
        it with the prospect's own assumptions.
      </Step>
      <Step n={3} title="Read Pc and EMV in the table">
        Pick a row to see its expectation curve and the full readout beside it.
      </Step>
      <Step n={4} title="Save, then print the report">
        Save writes each valuation to your account. The Report tab shows what the PDF prints
        for the selected prospect; fill in the company, licence, play and analyst there. CSV
        writes every input and output, one row per prospect, with its units and sources at
        the top of the file.
      </Step>
    </GuideSection>

    <GuideSection id="saving">
      <SectionHeading icon={Save}>Saving and sharing</SectionHeading>
      <Para>
        The words beside the Save button say where your work is. "Saved to your account" means
        every valuation on the screen is on your Petrolord account and opens on any device.
        A count of valuations "not saved to your account" means those edits are in this browser
        only until you press Save. Each row says the same for itself, with the time it was saved.
      </Para>
      <Callout tone="warning" title="Kept in this browser only">
        If the page says valuations are kept in this browser only, saving to accounts is not
        switched on for the database yet. Your work stays in this browser, it is not on your
        other devices, and a colleague cannot open it. Once saving is switched on, the next
        Save moves every valuation to your account.
      </Callout>
      <Para>
        A saved valuation can be shared with your organisation for viewing: select it, press
        Share and switch sharing on. Colleagues see it under "Shared with me", read-only and
        outside their own portfolio, and can save a copy to work on. Removing a prospect takes
        its saved valuation off your account; Undo in the status bar brings it back as unsaved.
      </Para>
    </GuideSection>

    <GuideSection id="handoff">
      <SectionHeading icon={GitBranch}>From ReservoirCalc Pro</SectionHeading>
      <Para>
        An imported prospect remembers what ReservoirCalc Pro handed over: the record and when
        it was saved, the unit and basis of the volumes, the chance factors behind Pg and, when
        the prospect came from a Monte Carlo run, the project, the reservoir, the run and its
        in-place volumes and recovery factor. All of it is printed in the report.
      </Para>
      <Para>
        If you change Pg or a volume here, the field is outlined and its row says "edited here"
        with the value that was sent. Typing the sent value back clears the mark.
      </Para>
      <Para>
        If the prospect is risked again in ReservoirCalc Pro after you valued it, its row says
        what changed there and offers Refresh from ReservoirCalc Pro. Refresh takes Pg, the
        volumes and the chance factors as they are now. Your MEFS, your costs and a value per
        barrel you typed are kept. Import reads the inventory again each time you press it, so
        a prospect added in another tab is found without reloading the page.
      </Para>
    </GuideSection>

    <GuideSection id="inputs">
      <SectionHeading icon={Sliders}>The inputs</SectionHeading>
      <Table
        headers={['Input', 'Unit', 'Where it comes from']}
        rows={[
          ['Pg', '0 to 1', 'Geological chance of success from the risking in ReservoirCalc Pro'],
          ['P90, P50, P10', 'MMboe', 'Success-case recoverable volumes in oil equivalent; P50 is optional and used for the Swanson check'],
          ['MEFS', 'MMboe', 'Minimum economic field size: the smallest discovery worth developing. Derived from the value of a discovery unless you type it'],
          ['Value per barrel', '$/boe', 'Slope u of the value of a discovery, value = u x volume - D. From the economic model, a Petroleum Economics Studio run, a prospect valued in ReservoirCalc Pro, or typed here'],
          ['Development cost', '$MM', 'Offset D of the same line; spent only when the discovery is commercial'],
          ['Well cost', '$MM', 'The exploration well, spent in every outcome'],
        ]}
      />
      <Para>
        Volumes follow your Suite unit profile: million barrels of oil equivalent, or million
        cubic metres of oil equivalent with the value per cubic metre. The Volumes in selector
        changes the view for this session. Switching converts every number; no result moves.
      </Para>
      <Para>
        A field left empty is never read as zero. The row shows "check inputs" and the line
        under the table names what is missing. Zero is allowed for the MEFS and the costs when
        you type it.
      </Para>
    </GuideSection>

    <GuideSection id="economics">
      <SectionHeading icon={Coins}>Economics and the MEFS</SectionHeading>
      <Para>
        The minimum economic field size and the value of a discovery follow from one stated
        economic model, so they cannot contradict each other. The model has ten assumptions:
        price, variable and fixed operating cost, development capex as a fixed part and a part
        per barrel, producing life, decline, royalty, tax and discount rate. It starts from the
        ReservoirCalc Pro screening model, and every net present value is the Suite screening
        engine.
      </Para>
      <Formula>MEFS = the smallest size whose net present value is zero or more</Formula>
      <Para>
        The valuation reads the value of a discovery as a straight line, value = u x volume - D,
        drawn through the model's net present value at the MEFS (zero) and at the mean
        commercial size. The Economics tab shows the line beside the model's own curve, and the
        table "Value by field size" prints both at the MEFS, P90, P50, the mean and P10. The
        report adds a cross-check: the EMV with the curve itself, which says how much the line
        costs.
      </Para>
      <Para>
        Typing over a derived value takes it over: a typed MEFS stops following the economics,
        and a typed value per barrel or development cost leaves the model for entered values.
        The Economics tab switches back. With entered values the derived MEFS is D / u, the
        size at which the line is zero.
      </Para>
    </GuideSection>

    <GuideSection id="epe">
      <SectionHeading icon={Coins}>From Petroleum Economics Studio</SectionHeading>
      <Para>
        On the Economics tab, Pick a Petroleum Economics Studio run lists your saved runs with
        their case, date, price deck, discount rate, NPV per barrel, value before capex and
        capex. Use takes one: its NPV before development capex per barrel becomes u and the
        present value of its capex becomes D, so at the run's own size the line gives the run's
        NPV. A run's results page in Petroleum Economics Studio has a link that opens this app
        with the run offered to the selected prospect.
      </Para>
      <Para>
        The run, its case, price deck, discount rate, dates and builds stay with the valuation
        and are printed in the report. Each time the page opens the run is read again: if it
        changed, the tab says what moved and offers Refresh; if it is gone, that is said too. If
        you type over the value, the run is kept on record as no longer in use.
      </Para>
    </GuideSection>

    <GuideSection id="sensitivity">
      <SectionHeading icon={BarChart3}>Sensitivity</SectionHeading>
      <Para>
        The Sensitivity tab moves one input at a time to a low and a high case and values the
        prospect again: Pg, each chance factor, the volumes, the value per barrel, the costs and
        the MEFS. The bars show the change in EMV, largest first. You set the ranges (25 percent
        either way, and 0.1 for a chance factor, to start); they are printed with the figure.
        They are stated ranges and not probabilities, and the bars do not add.
      </Para>
    </GuideSection>

    <GuideSection id="rerun">
      <SectionHeading icon={RotateCcw}>Re-run a prospect</SectionHeading>
      <Para>
        When a prospect changed in ReservoirCalc Pro, or its volumes are flagged, its row offers
        Re-run in ReservoirCalc Pro. That opens the prospect's project and reservoir with the
        seed and realizations of its run set, and Prospect Risking filled in. Adding the re-run
        there replaces the old record, and Return to the valuation brings you back: the
        valuation takes the new record, says what moved and keeps your economics. A colleague's
        shared prospect opens read-only, with the reason.
      </Para>
    </GuideSection>

    <GuideSection id="ranking">
      <SectionHeading icon={ListOrdered}>Ranking</SectionHeading>
      <Para>
        The Ranking tab orders your valuations, and those colleagues shared with you, by EMV, by
        risked volume or by commercial chance. Each row says what it rests on: where its volumes
        came from, where the value of a discovery came from, and whether its MEFS is derived or
        typed. CSV writes the ranking with the same provenance at the top of the file.
      </Para>
    </GuideSection>

    <GuideSection id="engine">
      <SectionHeading icon={Calculator}>How it is valued</SectionHeading>
      <SubHeading>The success-case distribution</SubHeading>
      <Para>
        A lognormal is fitted through P90 and P10. Its mean is shown next to Swanson's mean
        (0.3 P90 + 0.4 P50 + 0.3 P10) as a field check; a large gap means the P50 you entered
        is not lognormal with your P90 and P10.
      </Para>
      <Formula>sigma = (ln P10 - ln P90) / (2 x 1.2816),  mu = (ln P10 + ln P90) / 2</Formula>
      <SubHeading>Commercial chance</SubHeading>
      <Formula>Pc = Pg x P(V &gt;= MEFS)</Formula>
      <SubHeading>Expected monetary value after the well</SubHeading>
      <Formula>EMV = Pg x [ u x E[V ; V &gt;= MEFS] - D x P(V &gt;= MEFS) ] - W</Formula>
      <Para>
        Small discoveries below the MEFS are left undeveloped and earn nothing; the well cost is
        paid in every outcome. The break-even Pg is the Pg at which EMV is zero.
      </Para>
    </GuideSection>

    <GuideSection id="results">
      <SectionHeading icon={LineChart}>Reading the results</SectionHeading>
      <Para>
        The expectation curve shows the chance of finding at least each volume. It starts at Pg
        on the left, since that is the chance of finding anything, and falls to zero. The MEFS
        and the success-case percentiles are marked on it.
      </Para>
      <Para>
        A positive EMV says the prospect is worth drilling on these inputs. When the break-even
        Pg sits close to the Pg, the decision rests on the risking; when it reads not reachable,
        even a certain discovery would not pay back the well.
      </Para>
    </GuideSection>

    <GuideSection id="report">
      <SectionHeading icon={FileText}>The report and the CSV</SectionHeading>
      <Para>
        The Report tab and the PDF print the same rows. The header identifies the company, the
        prospect, the licence or block, the play, the analyst, the units and the software
        build. The inputs table lists every input with its unit and where it came from; an
        economic input you never changed is printed as an assumption with its starting value.
        Use the selectors on the Report tab to state the source of your own inputs.
      </Para>
      <Para>
        The results are split: the chance of success as the product of its factors, unrisked
        and risked volumes, the expected monetary value in its three terms with the formula,
        and the three outcomes of the well with their chances and values. The plots are the
        expectation curve of volume, the expectation curve of value, the value of a discovery
        against its size, the chance factors and the sensitivity of the EMV. A plot that does
        not apply is replaced by one line that says why.
      </Para>
      <Callout tone="info" title="Limits and flags">
        The last page of text lists what the method assumes: one prospect at a time,
        independent chance factors, a lognormal success case, a straight-line value of a
        discovery. Under it are the flags on this prospect, for example in-place volumes, a
        typed MEFS that would lose money, a starting economic model never replaced, or a source
        prospect or economics run that changed after it was valued. Clear the flags before the
        report is signed.
      </Callout>
    </GuideSection>

    <GuideSection id="portfolio">
      <SectionHeading icon={Layers}>The portfolio</SectionHeading>
      <Para>
        The footer sums the prospects as independent chances: total risked mean and EMV, the
        expected number of commercial discoveries, and the chance of at least one. Prospects
        sharing a charge or seal risk are not independent, and the chance of at least one is
        then overstated.
      </Para>
    </GuideSection>

    <GuideSection id="pitfalls">
      <SectionHeading icon={AlertTriangle}>Pitfalls</SectionHeading>
      <Para>
        A Petroleum Economics Studio run values one development at one size. Taken here, its
        capex is held fixed and the rest scales with volume, which is exact only at the run's
        own size; for a prospect far larger or smaller, run a case nearer its size. The readout
        under the chart says where the current value per barrel came from.
      </Para>
      <Para>
        The starting economic model expenses the development capex in the year before first
        production, where it earns no tax relief, so its MEFS is on the cautious side.
      </Para>
      <Para>
        Volumes are oil equivalent. A gas prospect handed over in gas units is converted at
        6 Mscf per boe and its row says so; for a gas prospect typed here, enter barrels of oil
        equivalent with the value per boe.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

// Design system rollout batch 3E: the guide follows the same per-user theme
// as Risked Reserves Valuation itself, so the look does not flip between the two pages.
const RiskedReservesHelpGuide = () => (
  <div className="min-h-screen" data-testid="rrv-help-theme-scope">
    <RiskedReservesHelpGuideContent />
  </div>
);

export default RiskedReservesHelpGuide;
