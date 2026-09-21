// In-app help guide for the QRA Studio (Process Safety PS3).
//
// Sourced from the engine itself (the basis strings engines/hse/qra.js
// returns with every result) and from its validation record,
// packages/engines/tools/validation/hse/FINDINGS-qra.md. Where this guide
// states an equation, a threshold, a refusal or a judgement call, it is the
// engine's or the record's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle2, GitBranch, Library, ListChecks, PoundSterling, Scale, Scale3d, User, Users, Zap,
} from 'lucide-react';
import {
  Callout, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { QRA_STUDIO_ROUTE } from '@/utils/processSafety/qraStudy';

export const QRA_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'register', icon: ListChecks, title: 'The register' },
  { id: 'eventtree', icon: GitBranch, title: 'Event tree' },
  { id: 'individual', icon: User, title: 'Individual risk' },
  { id: 'societal', icon: Users, title: 'Societal risk' },
  { id: 'alarp', icon: Scale, title: 'ALARP bands' },
  { id: 'cba', icon: PoundSterling, title: 'Cost-benefit and ICAF' },
  { id: 'judgements', icon: Scale3d, title: 'Judgement calls' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
  { id: 'sources', icon: Library, title: 'Sources' },
];

const QraStudioHelpGuide = () => (
  <HelpGuideShell
    title="QRA Studio Help Guide"
    subtitle="Individual risk, PLL, F-N curves, ALARP and the cost-benefit test"
    metaDescription="How to use the QRA Studio: the scenario register, event trees, LSIR and IRPA, PLL and FAR, F-N curves against criterion lines, ALARP banding and the gross disproportion test with the implied cost of averting a fatality."
    backTo={QRA_STUDIO_ROUTE}
    backLabel="Back to QRA Studio"
    icon={Scale}
    sections={QRA_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        A quantitative risk assessment adds up many outcomes, each with a frequency and a chance of killing someone, into
        numbers a decision can rest on. How likely is a person standing at a given place to die in a year? How likely is
        the person most exposed to the plant? How many deaths does the site cause each year on average, and how often does
        it cause ten, or fifty, at once? Is each of those tolerable, and is a proposed measure worth what it costs?
      </Para>
      <Para>
        The studio answers each from a register you fill in. Every number comes from the Petrolord engine
        (engines/hse/qra.js). Studies are saved to your organization; only the inputs are stored, and every result is
        recomputed when a study opens.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="danger" title="What is not done here">
        An aversion-weighted risk integral (sum f N^alpha): no source read defines one. A slope for the R2P2 societal
        criterion: R2P2 gives one point and defers the line to its reference 32, so the point is drawn and a line through
        it needs your alpha. Grid and wind-rose bookkeeping of a full QRA: the scenario frequencies (fS PM Pphi Pi) are
        yours. Uncertainty sampling on the frequencies. Delayed ignition over time and BLEVE probabilities as tree presets.
      </Callout>
      <Callout tone="warn" title="The consequences are the Consequence Modelling Studio's">
        This studio recomputes no source term, plume, flame or probit coefficient. It takes a dose you computed there (a
        heat flux, an overpressure, a toxic probit probability) and turns it into a probability of death by the Purple Book
        rules, or takes the probability you type. Along a transect, heat fluxes pass through the same thermal probit
        function the Consequence Modelling Studio uses, unchanged.
      </Callout>
      <Callout tone="warn" title="Criteria are guidelines, and one is repealed">
        R2P2 calls its limits &quot;guidelines ... not intended to be rigid benchmarks&quot; (para 129). The Purple Book F-N
        line is an orientation value for establishments, and Bevi, which set the same values in law, was repealed on 1
        January 2024; its successor under the Omgevingswet was not read. The HSE money values are 2003 figures and none is
        a default: VPF and the disproportion factor are always yours.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Register">
        List the scenarios (one outcome of one release in one weather and direction), each with a frequency and the
        expected deaths N when it happens. List the locations, who stands there and for how long. Give a probability of
        death for each scenario at each location.
      </Step>
      <Step n={2} title="Event tree">
        Optional. Split a flammable release into immediate ignition, flash fire, explosion and no ignition, and let
        scenarios take their frequency from an outcome.
      </Step>
      <Step n={3} title="Individual risk">
        Read the LSIR of each location, the IRPA of the most exposed person, their ALARP bands, and the contours along a
        transect.
      </Step>
      <Step n={4} title="Societal risk">
        Read PLL and FAR, and the F-N curve against the criterion you choose.
      </Step>
      <Step n={5} title="ALARP and cost-benefit">
        See every band in one table, then test a measure: is its cost grossly disproportionate to the risk it removes?
      </Step>
    </GuideSection>

    <GuideSection id="register">
      <SectionHeading icon={ListChecks}>The register</SectionHeading>
      <Para>
        A probability of death Pd is for an unprotected person outdoors at the location all the time (Purple Book 5.1). In
        each cell choose the Purple Book rule or type Pd. The rule depends on the scenario&apos;s effect (Figures 5.2 to 5.5):
      </Para>
      <Table
        headers={['Effect', 'Pd (for individual risk)', 'Dose you give']}
        rows={[
          ['Fire (pool, jet, BLEVE)', '1 in the flame or at 35 kW/m2 and above; otherwise the Purple Book heat probit at the fire duration, capped at 20 s', 'Heat flux in kW/m2, the fire duration on the scenario'],
          ['Flash fire', '1 inside the flame envelope (the LFL contour at ignition), 0 outside', 'Inside or outside'],
          ['Vapour cloud explosion', '1 above 30 kPa (0.3 barg); 0 below (indoors 0.025 above 10 kPa counts for societal risk only)', 'Peak side-on overpressure in kPa'],
          ['Toxic', 'The toxic probit probability as given', 'The probability from the Consequence Modelling Studio'],
        ]}
      />
      <Para>
        The period (day or night) sets the fraction indoors of Purple Book Table 5.3 (0.93 by day, 0.99 by night) that the
        rule needs. N need not be a whole number, and a scenario frequency of 0 is allowed.
      </Para>
    </GuideSection>

    <GuideSection id="eventtree">
      <SectionHeading icon={GitBranch}>Event tree</SectionHeading>
      <Formula>leaf frequency = f0 x product of the branch probabilities on its path; each branch set sums to 1</Formula>
      <Para>
        Immediate ignition leads to a jet or pool fire. Without it, delayed ignition leads to a flash fire or an explosion,
        split 0.6 and 0.4 by the Purple Book (section 4.8) unless you give the split; without either, no ignition. The
        immediate ignition probability can come from Purple Book Table 4.5 for stationary installations, by substance
        reactivity and by the rate (below 10, 10 to 100, above 100 kg/s) or mass (below 1,000, 1,000 to 10,000, above
        10,000 kg). The middle band is read as closed at both ends. A branch set that does not sum to 1 within 1e-9 is
        refused.
      </Para>
    </GuideSection>

    <GuideSection id="individual">
      <SectionHeading icon={User}>Individual risk</SectionHeading>
      <Formula>LSIR = sum over scenarios of f x Pd (Purple Book 6.1, 6.2)</Formula>
      <Formula>IRPA = sum over locations of LSIR x occupancy x vulnerability, occupancy = hours / 8,760</Formula>
      <Para>
        The LSIR is the risk at a place; the IRPA is the risk to a person, who is at one place at a time, so the occupancy
        fractions may not total more than 1. A blank vulnerability factor is 1 (no protection credited): no source read
        gives one for individual risk.
      </Para>
      <Para>
        The contour column names the smallest Purple Book level (1e-4, 1e-5, 1e-6, 1e-7 or 1e-8 per year) the LSIR reaches,
        so a location reading &quot;inside 1e-5&quot; lies within the 1e-5 contour. Along a transect the engine sums f x
        P(x) at each distance and interpolates each crossing in log10(IR) between the distances either side of it, linearly
        in IR where one side is 0.
      </Para>
    </GuideSection>

    <GuideSection id="societal">
      <SectionHeading icon={Users}>Societal risk</SectionHeading>
      <Formula>PLL = sum f x N; FAR = PLL x 100,000,000 / exposed hours per year</Formula>
      <Formula>F(N) = sum of f over the scenarios with N_i of N or more (Purple Book 6.6)</Formula>
      <Para>
        The F-N curve is a step at each distinct N above 0; scenarios with N = 0 stay off it and their frequency is shown.
        The area under it is the expected deaths per year. Against a line F = C / N^alpha the engine checks every corner
        of the curve inside the line&apos;s range of N: the curve is flat on each step and the line falls, so the largest
        ratio on a step is at its corner, and the check is exact. For every step above the line it gives the range of N
        over which it is above.
      </Para>
      <Table
        headers={['Criterion', 'What it says']}
        rows={[
          ['Purple Book Figure 6.8 and Bevi', 'F below 1e-3 / N^2 for N of 10 or more: 1e-5 at 10, 1e-7 at 100, 1e-9 at 1,000 deaths per year'],
          ['R2P2 para 136', '50 or more deaths more often than 1 in 5,000 a year is intolerable. One point, no slope'],
          ['Your own', 'C, alpha (1 is risk neutral, 2 risk averse), and the range of N it applies over'],
        ]}
      />
    </GuideSection>

    <GuideSection id="alarp">
      <SectionHeading icon={Scale}>ALARP bands</SectionHeading>
      <Table
        headers={['Band', 'When', 'R2P2 workers', 'R2P2 public']}
        rows={[
          ['UNACCEPTABLE', 'above the upper limit', 'above 1e-3 per year', 'above 1e-4 per year'],
          ['TOLERABLE', 'between: reduce as low as reasonably practicable', '1e-6 to 1e-3', '1e-6 to 1e-4'],
          ['BROADLY_ACCEPTABLE', 'at or below the lower limit', '1e-6 or less', '1e-6 or less'],
        ]}
      />
      <Para>
        A risk exactly at a limit belongs to the lower band: 1e-3 for a worker is TOLERABLE and 1e-6 is BROADLY_ACCEPTABLE.
        Each location is judged against its own criterion, the IRPA against the one you choose, and the chart draws the
        bands of one criterion with the risks judged against it.
      </Para>
    </GuideSection>

    <GuideSection id="cba">
      <SectionHeading icon={PoundSterling}>Cost-benefit and ICAF</SectionHeading>
      <Formula>benefit per year = PLL reduction x VPF + sum of cases prevented x value per case</Formula>
      <Formula>grossly disproportionate when cost / benefit &gt; DF; ICAF = cost / (PLL reduction x years)</Formula>
      <Para>
        Capital falls at year 0, and costs and benefits at the end of years 1 to n; each present value is taken by the
        canonical economics npv (the EPE cash flow engine), with the rates you give, which default to 0 as in the HSE
        checklist example. A benefit growth rate uprates the benefit each year. The ICAF (cost per fatality prevented)
        divides the present value of the cost by the fatalities prevented, counted undiscounted (R2P2 Appendix 3 para 15).
        A cost exactly DF times the benefit is not grossly disproportionate.
      </Para>
      <Para>
        The opening measure is the HSE checklist&apos;s worked example: a PLL reduction of 2e-4 a year for 25 years with
        three injury classes, benefit 9,283 GBP (6,684 + 2,072 + 512 + 15), so up to about 93,000 at a DF of 10. At a cost of
        93,000 the engine reads 92,835 as the most the measure can reasonably cost, and the measure GROSSLY_DISPROPORTIONATE
        by a margin of 165.
      </Para>
    </GuideSection>

    <GuideSection id="judgements">
      <SectionHeading icon={Scale3d}>Judgement calls</SectionHeading>
      <Table
        headers={['Question', 'What the engine does', 'Why']}
        rows={[
          ['A value exactly at a limit', 'It belongs to the lower band; at the F-N line the curve TOUCHES it', 'R2P2 says "more than", Bevi "at most", the checklist "cost / benefit > DF"'],
          ['Floating point at a limit', 'Within 1e-9 relative of a limit counts as on it and is flagged', '1e-4 x 10 is 0.0010000000000000002 in binary'],
          ['Fire exposure', 'Capped at 20 s for the Purple Book rule, and the time used is shown', 'Purple Book 5.2.3 note 3'],
          ['A preset name the engine does not know', 'Refused by name', 'A lookup that walked the prototype chain once read a risk of 1 in 100 as broadly acceptable'],
        ]}
      />
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine lives in the Petrolord engines repository (engines/hse/qra.js) and was built validation first: an
        independent Python oracle that never calls the engine writes the goldens, and the engine&apos;s gate calls every
        golden through the engine. Published values it reproduces include:
      </Para>
      <Table
        headers={['Published case', 'Printed', 'Engine']}
        rows={[
          ['Purple Book Appendix 6.B toxic grid point, Pd', '0.381', '0.38029'],
          ['Purple Book Appendix 6.B contribution to IR', '7.0e-9 per year', '6.9974e-9 per year'],
          ['R2P2 para 128 box, four worker risks', 'well below the upper limit', 'TOLERABLE (workers)'],
          ['R2P2 para 128 box, public gas risk 1 in 1,510,000', 'below broadly acceptable', 'BROADLY_ACCEPTABLE'],
          ['HSE CBA checklist worked example', '9,283; up to about 93,000 at DF 10', '9,283.5; 92,835'],
          ['Bevi art. 13(1)(b)', '1e-5, 1e-7, 1e-9', '1e-3 / N^2 at 10, 100, 1,000'],
        ]}
      />
      <Para>
        Negative controls plant defects one at a time and each turns the gate red, including six that restore the
        prototype chain lookups found and closed before merge. The engine also asserts it reuses the consequence functions
        bit for bit and exports none of the Facilities point-source radiation.
      </Para>
    </GuideSection>

    <GuideSection id="sources">
      <SectionHeading icon={Library}>Sources</SectionHeading>
      <Table
        headers={['Key', 'Document']}
        rows={[
          ['PB', 'TNO Purple Book, Guidelines for quantitative risk assessment, CPR 18E (1999)'],
          ['R2P2', 'UK HSE, Reducing risks, protecting people (2001)'],
          ['CBA', 'UK HSE, Cost Benefit Analysis (CBA) checklist (2003 values)'],
          ['Bevi', 'Besluit externe veiligheid inrichtingen (2004, repealed 1 January 2024) art. 13(1)(b)'],
        ]}
      />
      <Para>
        No HSE or CCPS F-N worked example was available, so none is claimed; the F-N and criterion cases are checked
        against the oracle and a second route on a 200,001 point grid.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default QraStudioHelpGuide;
