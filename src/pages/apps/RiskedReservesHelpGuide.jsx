// In-app help guide for Risked Reserves Valuation (rewritten for the T1
// rebuild, 2026-09-26). The app values prospects risked in ReservoirCalc
// Pro: commercial chance against the MEFS, EMV after the exploration well,
// break-even Pg and the risked expectation curve, closed form from a
// lognormal fitted to P90 and P10.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, Calculator, LineChart, Layers, AlertTriangle, Save, GitBranch, FileText,
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
      <Step n={2} title="Set the economics for each prospect">
        The minimum economic field size, the value of a developed barrel, the development cost
        and the exploration well cost. Defaults are placeholders; replace them.
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
          ['MEFS', 'MMboe', 'Minimum economic field size: the smallest discovery worth developing'],
          ['Value per barrel', '$/boe', 'NPV per barrel of a developed discovery. Typed here (a new prospect starts at 8 $/bbl, an assumption), or sent with a prospect valued in ReservoirCalc Pro'],
          ['Development cost', '$MM', 'Spent only when the discovery is commercial'],
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
        expectation curve of volume, the expectation curve of value and the chance factors. A
        plot that does not apply is replaced by one line that says why.
      </Para>
      <Callout tone="info" title="Limits and flags">
        The last page of text lists what the method assumes: one prospect at a time,
        independent chance factors, a lognormal success case, one value per barrel for every
        field size. Under it are the flags on this prospect, for example in-place volumes, an
        MEFS that would lose money, defaults never replaced, or a source prospect that changed
        after it was valued. Clear the flags before the report is signed.
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
        Value per barrel is a single number per prospect. No app sends it here except ReservoirCalc
        Pro, for a prospect valued there. To base it on a full development case, run that case in the
        Petroleum Economics Studio and type its NPV per barrel into this screen; the readout under
        the chart says where the current number came from. It changes with field size, so revisit it
        for prospects far larger or smaller than the case you ran.
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
