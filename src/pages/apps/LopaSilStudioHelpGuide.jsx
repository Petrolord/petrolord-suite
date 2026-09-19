// In-app help guide for the LOPA & SIL Studio (Process Safety PS1).
//
// Sourced from the engine itself (the basis strings engines/hse/lopa.js
// returns with every result) and from its validation record,
// packages/engines/tools/validation/hse/FINDINGS-lopa.md. Where this guide
// states an equation, a band edge or a scope limit, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BookOpen, Calculator, CheckCircle2, Clock, Layers, ShieldHalf, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { LOPA_STUDIO_ROUTE } from '@/utils/processSafety/lopaStudy';

export const LOPA_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'lopa', icon: Layers, title: 'The LOPA worksheet' },
  { id: 'bands', icon: ShieldHalf, title: 'SIL bands and exact decades' },
  { id: 'verification', icon: Calculator, title: 'SIF verification' },
  { id: 'proof', icon: Clock, title: 'Proof test interval' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const LopaSilStudioHelpGuide = () => (
  <HelpGuideShell
    title="LOPA & SIL Studio Help Guide"
    subtitle="Layers of protection analysis, SIL determination and SIF verification, low demand mode"
    metaDescription="How to use the LOPA & SIL Studio: the LOPA worksheet, the SIL band convention, IEC 61508-6 Annex B PFDavg verification and proof test interval sensitivity."
    backTo={LOPA_STUDIO_ROUTE}
    backLabel="Back to LOPA & SIL Studio"
    icon={ShieldHalf}
    sections={LOPA_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The studio answers three questions about a hazardous scenario. How often does it get
        through the protection layers you have? How much risk reduction is still missing against
        your tolerable target, and what safety integrity level (SIL) does that demand of a safety
        instrumented function (SIF)? And does the SIF you propose, with its architecture, failure
        rates and proof testing, actually supply it?
      </Para>
      <Para>
        Studies are saved to your organization, so a colleague revalidating a study opens the same
        record. Only the inputs are stored. Every result is recomputed when a study opens.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="danger" title="Low demand mode only, and no architectural constraint check">
        Every band here is the low demand band (PFDavg). There is no high demand or continuous mode
        (PFH). There is no architectural constraint check: the minimum hardware fault tolerance
        requirement is a normative table in IEC 61511-1:2016 clause 11.4 and IEC 61508-2 (Route
        2H, 7.4.4.3), and the engine does not restate a licensed table it could not check against a
        public primary source. A full SIL claim needs both, done elsewhere.
      </Callout>
      <Callout tone="warn" title="Every number is yours">
        Initiating event frequencies, probabilities, IPL PFDs, the TMEL and every failure rate are
        inputs. The studio ships no failure rate data. The example scenario it opens on is
        illustrative, written to show each part of the method; none of its values is published or
        vendor data.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Describe the scenario">
        Name it, give the initiating event frequency (IEF) per year and your organization&apos;s
        tolerable mitigated event likelihood (TMEL) per year for this consequence.
      </Step>
      <Step n={2} title="Add enabling conditions, conditional modifiers and IPLs">
        Each is a probability or PFD between 0 and 1. Tick Independent only for a layer that is
        independent of the initiating event and of every other credited layer.
      </Step>
      <Step n={3} title="Read the outcome">
        The worksheet reports the required RRF, the required SIF PFDavg and the outcome state.
      </Step>
      <Step n={4} title="Verify the SIF">
        On SIF verification, attach a SIF and enter its sensors, logic solver and final elements.
        The SIF PFDavg feeds back into the worksheet to close the loop against the TMEL.
      </Step>
      <Step n={5} title="Check the proof test interval">
        On Proof test interval, see how PFDavg moves with one subsystem&apos;s interval and find the
        longest interval that still meets a target.
      </Step>
      <Step n={6} title="Save">
        Create a study from the Saved study selector. It auto-saves about ten seconds after each
        change. Only the author or an organization owner or admin can delete a study.
      </Step>
    </GuideSection>

    <GuideSection id="lopa">
      <SectionHeading icon={Layers}>The LOPA worksheet</SectionHeading>
      <Para>The engine&apos;s method string: CCPS (2001) Layer of Protection Analysis.</Para>
      <Formula>
        f = IEF x prod(enabling) x prod(conditional modifiers) x prod(PFD of credited IPLs)   [per year]
        <br />
        RRF = f / TMEL;  required PFDavg = TMEL / f
      </Formula>
      <SubHeading>The credit rule</SubHeading>
      <Para>
        An IPL is credited once, and only when it is flagged independent and is not flagged
        unauditable. Every other layer is listed as not credited with the engine&apos;s reason. Two
        layers with the same name are refused, because one credit per IPL is the rule. A PFD of 0
        is refused (no layer is perfect), and so is a probability of 0 (a scenario that cannot
        happen is not a LOPA scenario).
      </Para>
      <SubHeading>Outcome states</SubHeading>
      <Table
        headers={['Engine state', 'Required RRF', 'Meaning']}
        rows={[
          [<Code key="a">NO_SIF_REQUIRED</Code>, 'at most 1', 'The credited layers already meet the TMEL.'],
          [<Code key="b">RISK_REDUCTION_BELOW_SIL1</Code>, 'above 1, at most 10', 'Risk reduction is needed, but less than a SIL 1 SIF provides by definition. The required PFDavg is still reported.'],
          [<Code key="c">SIL1</Code>, 'above 10, at most 100', 'A SIL 1 SIF is required.'],
          [<Code key="d">SIL2</Code>, 'above 100, at most 1,000', 'A SIL 2 SIF is required.'],
          [<Code key="e">SIL3</Code>, 'above 1,000, at most 10,000', 'A SIL 3 SIF is required.'],
          [<Code key="f">BEYOND_SIL3_REDESIGN</Code>, 'above 10,000', 'The process sector treats this as a redesign. The required PFDavg is kept intact and never clipped to SIL 3, and the engine notes whether it lies in the SIL 4 band.'],
        ]}
      />
      <Callout tone="info" title="Required SIL and required PFDavg go together">
        The engine&apos;s binding target: the SIF must achieve the required PFDavg itself; the SIL
        band alone does not guarantee it. A SIL 2 SIF at 5e-3 against a required 3.33e-3 is in the
        right band and still misses the TMEL. The studio&apos;s verdict is taken on the PFDavg.
      </Callout>
    </GuideSection>

    <GuideSection id="bands">
      <SectionHeading icon={ShieldHalf}>SIL bands and exact decades</SectionHeading>
      <Para>
        IEC 61508-1 Table 2 and IEC 61511-1, low demand: SIL n holds 10^-(n+1) &lt;= PFDavg &lt;
        10^-n, which is 10^n &lt; RRF &lt;= 10^(n+1).
      </Para>
      <Callout tone="warn" title="An exact decade falls in the lower SIL band">
        A PFDavg of exactly 1e-2 is SIL 1, and 1e-1 is not SIL rated. A required RRF of exactly 100
        is SIL 1, exactly 10 is below SIL 1, exactly 1 needs no SIF, and exactly 10,000 is SIL 3.
      </Callout>
      <Para>
        Floating point makes this matter. In double precision, 0.1 x 0.1 x 0.1 / 1e-5 is
        100.00000000000001, which would band as SIL 2 without care. The engine treats any value
        within 1e-9 relative of a decade as that decade (<Code>DECADE_SNAP</Code>), and the same snap
        decides whether f equals the TMEL. An achieved PFDavg below 1e-5 is reported as
        <Code>BELOW_SIL4_TABLE_FLOOR</Code>, with the claim limited to SIL 4.
      </Para>
    </GuideSection>

    <GuideSection id="verification">
      <SectionHeading icon={Calculator}>SIF verification</SectionHeading>
      <Para>
        The engine implements the full IEC 61508-6:2010 Annex B.3.2.2 reliability block diagram
        simplified equations, low demand, with the channel and group equivalent mean down times.
      </Para>
      <Formula>
        tCE = lDU/lD (T1/2 + MRT) + lDD/lD MTTR
        <br />
        tGE = lDU/lD (T1/3 + MRT) + lDD/lD MTTR   (1oo2, 2oo3)
        <br />
        1oo1: PFD = lD tCE
        <br />
        2oo2: PFD = 2 lD tCE   (Annex B carries no beta term for 2oo2)
        <br />
        1oo2: PFD = 2((1-bD) lDD + (1-b) lDU)^2 tCE tGE + bD lDD MTTR + b lDU (T1/2 + MRT)
        <br />
        2oo3: PFD = 6((1-bD) lDD + (1-b) lDU)^2 tCE tGE + bD lDD MTTR + b lDU (T1/2 + MRT)
        <br />
        1oo3: PFD = 6((1-bD) lDD + (1-b) lDU)^3 tCE tG2E tGE + bD lDD MTTR + b lDU (T1/2 + MRT)
      </Formula>
      <Para>
        With lambda DD = 0 and MRT = 0 these reduce exactly to the ISA-TR84.00.02 simplified forms
        (1oo1 = lDU T/2, 1oo2 = ((1-b) lDU)^2 T^2/3 + b lDU T/2, and so on), so one implementation
        covers both. The SIF PFDavg is the series sum of its subsystems (Annex B.3.2.1:
        PFD_SYS = PFD_S + PFD_L + PFD_FE).
      </Para>
      <Table
        headers={['Input', 'Unit', 'Notes']}
        rows={[
          ['lambda DU, lambda DD', 'per hour, per channel', 'Dangerous undetected and dangerous detected failure rates. Blank lambda DD is 0.'],
          ['MTTR', 'hours', 'Restoration time for a detected failure. Required when lambda DD is above 0.'],
          ['MRT', 'hours', 'Repair time after a proof test reveals a DU failure. Blank is 0.'],
          ['beta, beta D', 'fraction', 'Common cause fractions. beta is required for 1oo2, 2oo3 and 1oo3 (typing 0 is a claim of no common cause), beta D when lambda DD is above 0. Ignored, with a warning, for 1oo1 and 2oo2.'],
          ['T1', 'hours', 'Proof test interval. 8760 h is one year.'],
          ['Proof test coverage', 'fraction', 'Below 1, the uncovered part of lambda DU stays until the item is restored as new at the lifetime T2 (Annex B.3.2.5 as the 61508 Association states it).'],
          ['Lifetime T2', 'hours', 'Required when coverage is below 1, and at least T1.'],
        ]}
      />
      <Callout tone="warn" title="The lambda x T warning">
        When lambda DU x T exceeds 0.1 the engine warns that the linearised (rare event) equations
        overstate PFDavg noticeably. At lambda T = 0.438 on a 1oo1 the overstatement measured 15.1
        percent. Where the linearised value reaches 1 the engine refuses and asks for an exact
        (Markov) model.
      </Callout>
    </GuideSection>

    <GuideSection id="proof">
      <SectionHeading icon={Clock}>Proof test interval</SectionHeading>
      <Para>
        The chart varies one subsystem&apos;s T1 and holds every other input. It plots that
        subsystem&apos;s PFDavg and the whole SIF&apos;s on a log axis, with the required SIF PFDavg
        and the decade band edges drawn in. Every point is an engine value.
      </Para>
      <Para>
        The longest interval search bisects on T1, because PFDavg is non-decreasing in T1. The
        target is either this subsystem&apos;s share of the required SIF PFDavg (the required value
        less the other subsystems&apos; PFDavg as they stand, which is the studio&apos;s own
        subtraction) or a PFDavg you type. The engine answers with a state:
      </Para>
      <Table
        headers={['Engine state', 'Meaning']}
        rows={[
          [<Code key="a">FOUND</Code>, 'The longest T1 that still meets the target, to 1e-12 relative.'],
          [<Code key="b">UNACHIEVABLE</Code>, 'The part of PFDavg that does not depend on T1 (detected failures and MTTR, MRT, and the uncovered part under imperfect proof testing) already reaches the target.'],
          [<Code key="c">INTERVAL_INDEPENDENT</Code>, 'lambda DU is zero, so T1 does not enter.'],
          [<Code key="d">CAPPED_AT_LIFETIME</Code>, 'With coverage below 1, the target is met at every T1 up to the lifetime T2, so the interval is capped there.'],
        ]}
      />
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine is <Code>engines/hse/lopa.js</Code> in petrolord-engines, vendored into the Suite.
        Its gate runs 91 tests. An independent Python oracle (standard library only, never calling
        the JavaScript) checks every coefficient in exact rationals to 1e-12 relative and decides
        every SIL boundary exactly. A second route averages the time dependent unavailability by
        quadrature, and the Annex B result is never below it (it is the conservative first order
        form).
      </Para>
      <Para>
        The published check is the 61508 Association worked SIF (I. Dolan, 2024, SIL Calculations:
        Practical Guidance in the use of IEC 61508-6:2010). The engine reproduces its ten subsystem
        rows and the SIF total of 1.29e-3 (RRF 777) to every printed digit. The equations were also
        checked against Lundteigen and Rausand, Chapter 8, PFD formulas in IEC 61508 (Reliability of
        Safety-Critical Systems, Wiley 2014).
      </Para>
      <Callout tone="info" title="What was not reproduced">
        The CCPS (2001) continuing example was not reproduced, and no golden claims to be it. The
        LOPA goldens are oracle-derived scenarios with illustrative numbers. The IPL credit rules
        (independent, auditable, one credit per IPL) are the engine&apos;s specification; no
        independent route validates them. The SIF sum ignores a small overlap term.
      </Callout>
    </GuideSection>
  </HelpGuideShell>
);

export default LopaSilStudioHelpGuide;
