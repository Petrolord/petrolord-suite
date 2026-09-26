// In-app help guide for Risked Reserves Valuation (rewritten for the T1
// rebuild, 2026-09-26). The app values prospects risked in ReservoirCalc
// Pro: commercial chance against the MEFS, EMV after the exploration well,
// break-even Pg and the risked expectation curve, closed form from a
// lognormal fitted to P90 and P10.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.

import React from 'react';
import {
  BookOpen, Zap, Sliders, Calculator, LineChart, Layers, AlertTriangle,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para,
  Formula, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'convention', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'inputs', icon: Sliders, title: 'The inputs' },
  { id: 'engine', icon: Calculator, title: 'How it is valued' },
  { id: 'results', icon: LineChart, title: 'Reading the results' },
  { id: 'portfolio', icon: Layers, title: 'The portfolio' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls' },
];

const RiskedReservesHelpGuide = () => (
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
        The prospect list and your economic inputs are kept in this browser. The prospects
        themselves stay in ReservoirCalc Pro; import again to pick up new ones. Export the
        valuation table as CSV for a record.
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
      <Step n={4} title="Export the table">
        CSV writes every input and output, one row per prospect.
      </Step>
    </GuideSection>

    <GuideSection id="inputs">
      <SectionHeading icon={Sliders}>The inputs</SectionHeading>
      <Table
        headers={['Input', 'Unit', 'Where it comes from']}
        rows={[
          ['Pg', '0 to 1', 'Geological chance of success from the risking in ReservoirCalc Pro'],
          ['P90, P50, P10', 'MMbbl', 'Success-case volumes; P50 is optional and used for the Swanson check'],
          ['MEFS', 'MMbbl', 'Minimum economic field size: the smallest discovery worth developing'],
          ['Value per barrel', '$/bbl', 'NPV per barrel of a developed discovery, from the Petroleum Economics Studio'],
          ['Development cost', '$MM', 'Spent only when the discovery is commercial'],
          ['Well cost', '$MM', 'The exploration well, spent in every outcome'],
        ]}
      />
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
        Value per barrel is a single number per prospect. Run the development case in the
        Petroleum Economics Studio to set it; it changes with field size, so revisit it for
        prospects far larger or smaller than the case you ran.
      </Para>
      <Para>
        Volumes are in MMbbl of oil. For a gas prospect enter barrels of oil equivalent with the
        value per boe.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default RiskedReservesHelpGuide;
