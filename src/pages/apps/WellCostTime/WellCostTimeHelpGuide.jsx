// Well Cost & Time Estimator in-app help guide (D11/WC4).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  ArrowLeft, BookOpen, Zap, Clock, Receipt, Dice5, Landmark,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Estimator?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'program', icon: Clock, title: 'Time program' },
  { id: 'afe', icon: Receipt, title: 'AFE cost model' },
  { id: 'risk', icon: Dice5, title: 'Monte Carlo risk' },
  { id: 'benchmarks', icon: Landmark, title: 'Benchmarks' },
  { id: 'validation', icon: BadgeCheck, title: 'Validation basis' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls & FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

const SectionHeading = ({ icon: Icon, children }) => (
  <h2 className="flex items-center gap-3 text-2xl sm:text-3xl font-bold text-pl-text mb-4 mt-0 pt-2">
    <Icon className="w-7 h-7 shrink-0 text-pl-primary-text" /> {children}
  </h2>
);
const SubHeading = ({ children }) => (
  <h3 className="text-xl font-semibold text-pl-text mt-6 mb-2">{children}</h3>
);
const Para = ({ children }) => (
  <p className="text-pl-text leading-relaxed mb-3">{children}</p>
);
const Callout = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-pl-info-bg border-pl-info text-pl-info-text',
    warn: 'bg-pl-warning-bg border-pl-warning text-pl-warning-text',
    danger: 'bg-pl-danger-bg border-pl-danger text-pl-danger-text',
    success: 'bg-pl-success-bg border-pl-success text-pl-success-text',
  };
  return (
    <div className={`border-l-4 rounded p-4 my-4 ${tones[tone]}`}>
      {title && <div className="font-semibold mb-1">{title}</div>}
      <div className="text-sm">{children}</div>
    </div>
  );
};
const Step = ({ n, title, children }) => (
  <div className="flex gap-3 mb-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pl-primary flex items-center justify-center text-pl-primary-fg font-bold text-sm">
      {n}
    </div>
    <div className="flex-1">
      <div className="font-semibold text-pl-text mb-1">{title}</div>
      <div className="text-pl-text text-sm leading-relaxed">{children}</div>
    </div>
  </div>
);
const Table = ({ headers, rows }) => (
  <div className="my-3 overflow-x-auto">
    <table className="min-w-full text-sm border border-pl-border">
      <thead className="bg-pl-sunken">
        <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-pl-text font-semibold border-b border-pl-border">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-pl-sunken/50' : ''}>
            {r.map((c, j) => <td key={j} className="px-3 py-2 text-pl-text border-b border-pl-border align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
const Section = ({ id, children }) => (
  <section id={`section-${id}`} className="bg-pl-surface border border-pl-border shadow-pl-sm rounded-xl p-4 sm:p-6 mb-6 scroll-mt-6">
    {children}
  </section>
);

const WellCostTimeHelpGuideContent = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Well Cost & Time Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Well Cost & Time Estimator: the activity time program, the AFE cost model, and the Monte Carlo risk run." />
      </Helmet>
      <div className="p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link to="/dashboard/apps/drilling/well-cost-time">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Well Cost & Time
              </Button>
            </Link>
            <ThemeToggle />
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-pl-primary p-3 rounded-xl shrink-0">
              <Receipt className="w-8 h-8 text-pl-primary-fg" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-pl-text">Well Cost & Time Help Guide</h1>
              <p className="text-pl-muted text-lg">A defensible schedule, an auditable AFE, and honest percentiles</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3">
            <div className="sticky top-6 bg-pl-surface border border-pl-border shadow-pl-sm rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-pl-accent-text mb-2 px-2">Contents</div>
              <nav className="space-y-1">
                {sections.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button key={s.id} type="button" onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activeSection === s.id ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}>
                      <Icon className="h-4 w-4 shrink-0" /> {s.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-9">
            <Section id="overview">
              <SectionHeading icon={BookOpen}>What is the Estimator?</SectionHeading>
              <Para>
                The Well Cost & Time Estimator turns a planned wellbore into a defensible schedule
                and an AFE-grade cost estimate. You describe the well as an ordered list of
                activities (drill, trip, run casing, flat time), price it with AFE items
                (dayrates, per-metre consumables, lump sums), and quantify the uncertainty with a
                seeded Monte Carlo run that reports P10, P50 and P90 for both cost and duration.
              </Para>
              <Para>
                It is a planning estimate built from your entered rates and durations, not a
                market quotation. The arithmetic is validated against an independent oracle; the
                numbers are only as good as the rates you feed them.
              </Para>
              <Callout tone="info" title="Where it sits in the module">
                The estimate keys to a wellbore on the well-planning spine. The starter program
                can prefill from the shared hole-section geometry, and the finished estimate
                hands off to the AFE Cost Control Manager for budget tracking and to Petroleum
                Economics Studio as a CAPEX line.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick a wellbore and create an estimate">
                Choose a site and wellbore in the explorer and press New. If the wellbore has
                hole sections in the shared geometry, the starter program drills, trips and
                cases each section; otherwise a generic three-section template appears.
              </Step>
              <Step n={2} title="Tune the time program">
                Set ROPs, trip speeds, casing running speeds and flat times on the Time Program
                tab. Watch the time-depth curve and the total days update as you type. Set an
                NPT allowance (a fraction that stretches every duration).
              </Step>
              <Step n={3} title="Price the AFE">
                On the AFE Cost tab set the dayrates, per-metre consumables and lump sums, mark
                each item tangible or intangible, link lump sums to the activity where they
                accrue, and set the contingency fraction.
              </Step>
              <Step n={4} title="Run the risk model">
                On the Risk tab add uncertainties (an ROP, a dayrate, a lump sum), give each a
                distribution, and run the Monte Carlo. Read P10/P50/P90, the S-curve and the
                tornado of cost drivers.
              </Step>
              <Step n={5} title="Report and hand off">
                Export the AFE PDF from the Report tab, save a run into the immutable history,
                and follow the cross-links to budget control and economics.
              </Step>
            </Section>

            <Section id="program">
              <SectionHeading icon={Clock}>Time program</SectionHeading>
              <Para>
                Four activity kinds cover a drilling schedule. Durations are closed forms, so
                every number in the schedule is reproducible by hand:
              </Para>
              <Table
                headers={['Kind', 'Duration', 'Depth effect']}
                rows={[
                  ['drill', 'interval length / ROP', 'advances the hole'],
                  ['trip', '2 x MD / trip speed (round trip)', 'none'],
                  ['casing', 'MD / running speed + flat hours', 'none'],
                  ['flat', 'entered hours (rig move, logging, completion)', 'none'],
                ]}
              />
              <Para>
                The time-depth curve is piecewise linear: sloped while drilling, vertical while
                flat. Drill activities must be continuous (each starts where the hole is), and
                the app refuses a discontinuous program rather than guessing.
              </Para>
              <SubHeading>NPT</SubHeading>
              <Para>
                The NPT allowance stretches every duration by the same factor. That is the
                honest planning convention: a single fraction of total time, visible in the
                schedule totals. Discrete NPT events (a stuck pipe, weather) belong in the risk
                model as uncertain durations, not hidden in the base schedule.
              </Para>
            </Section>

            <Section id="afe">
              <SectionHeading icon={Receipt}>AFE cost model</SectionHeading>
              <Para>Each AFE item has a basis and a category:</Para>
              <Table
                headers={['Basis', 'Amount', 'Typical items']}
                rows={[
                  ['per-day', 'rate x total days', 'rig dayrate, services spread, rentals'],
                  ['per-meter', 'rate x drilled metres', 'bits, mud, consumables'],
                  ['lump', 'entered value', 'wellhead, casing, cement jobs, completion'],
                ]}
              />
              <Para>
                The rollup splits tangible from intangible (the AFE convention that drives tax
                treatment), adds the contingency as its own line on the base subtotal, and the
                cumulative cost curve accrues per-day items with time, per-metre items with
                drilled length, and lump sums at the end of their linked activity. The final
                point of the curve equals the base subtotal exactly; contingency is a provision,
                not an accrual.
              </Para>
              <SubHeading>Cost per metre</SubHeading>
              <Para>
                The bit-economics calculator uses the classic drilling cost-per-depth formula
                from Applied Drilling Engineering chapter 1: bit cost plus rig time (drilling,
                connections, tripping) divided by the interval drilled. The oracle hand case
                works out to 770 USD/m.
              </Para>
            </Section>

            <Section id="risk">
              <SectionHeading icon={Dice5}>Monte Carlo risk</SectionHeading>
              <Para>
                Any activity rate or duration and any cost rate or lump sum can carry a
                distribution (triangular, uniform, normal or lognormal). The sampler is the
                Suite's canonical Monte Carlo module, the same code behind ReservoirCalc Pro,
                with a seed stored in the case so a run is exactly reproducible.
              </Para>
              <Callout tone="warn" title="Percentile convention">
                For cost and duration this app uses the AFE convention: P10 is the LOW outcome
                (10 percent of realizations cheaper or faster) and P90 the HIGH one. Volumetric
                apps use the opposite exceedance labeling; read the axis, not the habit.
              </Callout>
              <Callout tone="warn" title="Contingency vs risk model">
                The probabilistic total is the BASE cost. The risk model replaces the
                deterministic contingency line; stacking percentiles on top of a contingency
                would count the same risk twice.
              </Callout>
              <Para>
                The tornado ranks drivers by Spearman rank correlation against total cost, with
                the share of rank variance each driver explains. An invalid realization (say a
                sampled rate at or below zero) is skipped and counted, never silently clamped.
              </Para>
            </Section>

            <Section id="benchmarks">
              <SectionHeading icon={Landmark}>Benchmarks</SectionHeading>
              <Para>
                The benchmark card carries the regional table salvaged from the retired
                WellCostIQ app: indicative rig and spread rates plus a days-per-metre factor by
                region and well type. They are order-of-magnitude planning prefill numbers, and
                they never enter the estimate unless you apply them; the AFE always carries your
                entered rates. The old app's fake percentile spread was discarded, and this app
                does not pretend the table is market data.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                An independent Python oracle recomputes every closed form with exact fractions
                and self-asserts hand fixtures before emitting the golden test set. The
                deterministic hand well runs 384 productive hours, stretches to exactly 18.0
                days with 12.5 percent NPT, and rolls up to an AFE total of 5,918,000 USD. The
                cost accrual endpoint equals the base subtotal identically.
              </Para>
              <Para>
                The Monte Carlo path is gated statistically: on a linear fixture the analytic
                mean and variance of the triangular sum are known exactly, and the canonical
                sampler must reproduce both within central-limit tolerance. Suite gates A32 and
                A33 replay all of this on every validation run; the published worked example
                from Applied Drilling Engineering arms a further literature gate once the owner
                supplies the text.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>Why did my activity turn the screen red?</SubHeading>
              <Para>
                A drill activity must start at the current hole depth, and rates must be
                positive. The error banner names the offending activity; fix it and the
                schedule recomputes.
              </Para>
              <SubHeading>Why is the Monte Carlo total below my AFE total?</SubHeading>
              <Para>
                The risk model reports base cost without the contingency line. Compare it to the
                base subtotal, or read the P90 as your risked contingency level.
              </Para>
              <SubHeading>Are the benchmark rates current market rates?</SubHeading>
              <Para>
                No. They are indicative planning figures for a first pass. Replace them with
                quoted rates before an AFE goes anywhere near a partner.
              </Para>
              <SubHeading>Where do casing tangible costs come from?</SubHeading>
              <Para>
                You enter them as lump sums (or per-metre items). The Casing & Tubing Design
                Studio holds the string design this estimate prices; a link on the case keeps
                the context.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['AFE', 'Authorization for Expenditure: the itemized well budget document'],
                  ['NPT', 'Non-productive time, carried here as a uniform stretch factor'],
                  ['Tangible / intangible', 'AFE cost categories (equipment vs services), split for tax treatment'],
                  ['P10 / P50 / P90', 'Low / median / high outcomes for cost and time (AFE convention)'],
                  ['S-curve', 'Cumulative probability of the total cost distribution'],
                  ['Tornado', 'Ranked cost drivers by Spearman rank correlation'],
                  ['Time-depth curve', 'The classic drilling curve: days along the bottom, depth downward'],
                  ['Cost per metre', 'Bit-run economics formula from Applied Drilling Engineering ch. 1'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 3C: the guide follows the same per-user theme
// as the Well Cost & Time Estimator itself, so the look does not flip between the two pages.
const WellCostTimeHelpGuide = () => (
  <ThemedApp className="min-h-screen" data-testid="wct-help-theme-scope">
    <WellCostTimeHelpGuideContent />
  </ThemedApp>
);

export default WellCostTimeHelpGuide;
