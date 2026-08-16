// src/pages/apps/epe/EpeHelpGuide.jsx
//
// Petroleum Economics Studio first-time user help guide. Sectioned
// single-page React component with a sticky left-side navigation. Mirrors
// the Suite's visual language (dark glass cards, slate/lime/cyan tokens,
// gradient accents).
//
// Created 2026-05-12 at end of B2.5. Refreshed 2026-08 for the
// Petroleum Economics Studio rebrand, the shipped Monte Carlo tab,
// the v3.3 forgiving CSV parser, and the Field Life additions.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, FolderOpen, Upload, Calculator, PlayCircle,
  LineChart, Activity, AlertTriangle, ChevronRight, Dices, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview',     icon: BookOpen,        title: 'What is the Studio?' },
  { id: 'quickstart',   icon: Zap,             title: 'Quick Start (5 min)' },
  { id: 'cases',        icon: FolderOpen,      title: 'Setting up a case' },
  { id: 'data',         icon: Upload,          title: 'Uploading data' },
  { id: 'fiscal',       icon: Calculator,      title: 'Fiscal regime' },
  { id: 'run',          icon: PlayCircle,      title: 'Running an analysis' },
  { id: 'results',      icon: LineChart,       title: 'Reading results' },
  { id: 'sensitivity',  icon: Activity,        title: 'Sensitivity (Tornado)' },
  { id: 'montecarlo',   icon: Dices,           title: 'Risk and Monte Carlo' },
  { id: 'pitfalls',     icon: AlertTriangle,   title: 'Pitfalls & FAQ' },
  { id: 'glossary',     icon: BookMarked,      title: 'Glossary' },
];

const SectionHeading = ({ icon: Icon, children }) => (
  <h2 className="flex items-center gap-3 text-3xl font-bold text-white mb-4 mt-0 pt-2">
    <Icon className="w-7 h-7 text-cyan-300" /> {children}
  </h2>
);

const SubHeading = ({ children }) => (
  <h3 className="text-xl font-semibold text-lime-200 mt-6 mb-2">{children}</h3>
);

const Para = ({ children }) => (
  <p className="text-slate-200 leading-relaxed mb-3">{children}</p>
);

const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-900/70 text-cyan-200 text-sm font-mono">{children}</code>
);

const Callout = ({ tone = 'info', title, children }) => {
  const tones = {
    info:    'bg-cyan-900/30 border-cyan-500/40 text-cyan-100',
    warn:    'bg-amber-900/30 border-amber-500/40 text-amber-100',
    danger:  'bg-red-900/30 border-red-500/40 text-red-100',
    success: 'bg-green-900/30 border-green-500/40 text-green-100',
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
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
      {n}
    </div>
    <div className="flex-1">
      <div className="font-semibold text-white mb-1">{title}</div>
      <div className="text-slate-200 text-sm leading-relaxed">{children}</div>
    </div>
  </div>
);

const Table = ({ headers, rows }) => (
  <div className="my-3 overflow-x-auto">
    <table className="min-w-full text-sm border border-white/10">
      <thead className="bg-slate-800/60">
        <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left text-cyan-200 font-semibold border-b border-white/10">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-slate-800/20' : ''}>
            {r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-200 border-b border-white/5 align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const EpeHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');

  // Scroll-to-section
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Petroleum Economics Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Comprehensive guide to using Petroleum Economics Studio." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/economics/epe/cases">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cases
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-3 rounded-xl">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Petroleum Economics Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Everything you need to run your first analysis</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          {/* Sticky left navigation */}
          <aside className="col-span-12 lg:col-span-3">
            <div className="sticky top-6 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-lime-300/70 mb-2 px-2">Contents</div>
              <nav className="space-y-1">
                {sections.map(s => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-green-500/20 to-cyan-500/20 text-white border-l-2 border-cyan-400'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{s.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="col-span-12 lg:col-span-9 space-y-10">

            {/* SECTION: OVERVIEW */}
            <section id="section-overview" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={BookOpen}>What is Petroleum Economics Studio?</SectionHeading>
              <Para>
                Petroleum Economics Studio is a cash-flow modeling tool for upstream oil and gas projects in Nigeria. It computes NPV, IRR, payback, and full annual cash flows under the three fiscal regimes that govern Nigerian upstream operations: Joint Venture (JV), Production Sharing Contract (PSC), and the Petroleum Industry Act 2021 (PIA), with full Nigeria Tax Act 2025 awareness.
              </Para>
              <Para>
                The Studio is built for petroleum engineers, asset managers, fiscal analysts, and investment evaluators who need defensible economic forecasts grounded in the current Nigerian regulatory landscape.
              </Para>

              <SubHeading>What the Studio does</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li>Computes deterministic year-by-year cash flow from production, capex, and opex inputs</li>
                <li>Applies the correct fiscal calculations for JV, PSC, or PIA regimes</li>
                <li>Auto-switches between PIA-only and NTA 2025 frameworks based on the assessment year</li>
                <li>Handles HCT, CIT, TET, Development Levy, HCDT, NDDC, production allowances, and royalty cascades</li>
                <li>Generates NPV at real or nominal discount rates, IRR, payback period, and full discounted cash flows</li>
                <li>Runs sensitivity (tornado) analysis across all major fiscal and price inputs</li>
                <li>Runs Monte Carlo risk simulation on any completed run, with per-input distributions and an NPV probability curve (see the Risk and Monte Carlo section)</li>
                <li>Models abandonment cost and an economic limit test via the Field Life section of the Run Console</li>
                <li>Produces presentation-grade visualizations: cash flow profile, waterfall, year-by-year table</li>
              </ul>

              <SubHeading>What the Studio does not do (yet)</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li>Generate the production forecast itself (use the Decline Curve Analysis module for that)</li>
                <li>Apply the minimum effective tax rate (NTA section 57), which is not implemented in the engine</li>
                <li>Support per-year price decks (pricing is a flat price plus per-stream escalators)</li>
                <li>Run incremental (with versus without) economics</li>
                <li>Model partner carry, promote, or back-in arrangements (planned)</li>
                <li>Provide legal or tax advice; outputs are best-interpretation forecasts that should be reviewed by your tax counsel</li>
              </ul>
              <Para>
                Abandonment costs and end-of-life handling are covered: the Run Console has a Field Life section where you can set an abandonment cost (applied as a post-tax outflow in a chosen year, not tax-deducted and not depreciated) and an economic limit toggle that trims trailing years whose revenue no longer covers opex.
              </Para>

              <Callout tone="info" title="Not a black box">
                Every fiscal calculation is documented in the engine code and validated against the published PIA 2021 worked example. NTA 2025 changes are implemented per the published statute and reflect the Olaniwun Ajayi and Fortrose interpretations of ambiguous provisions (e.g., deep offshore HCT).
              </Callout>
            </section>

            {/* SECTION: QUICKSTART */}
            <section id="section-quickstart" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={Zap}>Quick Start (5 minutes)</SectionHeading>
              <Para>
                The fastest path from a fresh login to your first NPV number. Use this as a checklist; details for each step are in the sections below.
              </Para>

              <Step n={1} title="Create a case">
                Click <Code>New Case</Code> on the Cases page. Give it a memorable name like "Akoma JV base scenario." A case is a container for everything related to one analysis: data files, configurations, and result runs.
              </Step>

              <Step n={2} title="Upload three CSV files">
                Inside the case, you'll need to upload <strong>production volumes</strong>, <strong>CAPEX schedule</strong>, and <strong>OPEX schedule</strong>. See the "Uploading data" section for the column conventions before preparing your files.
              </Step>

              <Step n={3} title="Configure the run">
                Open the Run Console. Select the fiscal regime (JV, PSC, or PIA). For PIA, the system will auto-detect whether to apply the NTA 2025 framework based on your base year. Set oil price, discount rate, and other commercial assumptions.
              </Step>

              <Step n={4} title="Run the engine">
                Click <Code>Run Economic Analysis</Code>. The engine processes typically in 1–3 seconds and writes results to the database.
              </Step>

              <Step n={5} title="Read the results">
                Open the Results viewer. You'll see KPI cards (NPV, IRR, payback, totals), a tabbed chart section (Annual Cash Flow, Cash Flow Profile, Waterfall, Sensitivity, Risk (Monte Carlo), Year-by-Year Detail), and a fiscal-framework badge confirming which regime was applied.
              </Step>

              <Step n={6} title="Run sensitivity">
                On the Results page, click the Sensitivity tab and hit <Code>Run Sensitivity Analysis</Code>. The tornado chart shows which inputs move NPV the most, typically oil price first, then tax rates and capex.
              </Step>
            </section>

            {/* SECTION: CASES */}
            <section id="section-cases" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={FolderOpen}>Setting up a case</SectionHeading>

              <Para>
                A <strong>case</strong> represents one specific analysis you want to run. Think of it as a workbook in Excel. It contains all the inputs (production, capex, opex), all the configurations you've tried, and all the results you've generated.
              </Para>

              <SubHeading>When to create a new case</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>One case per asset / field / development plan.</strong> Different fields with different production profiles or fiscal terms warrant separate cases.</li>
                <li><strong>Don't create cases for scenarios.</strong> Use multiple runs within one case for "low / base / high" scenarios. The case stays the same; only the run configuration varies.</li>
                <li><strong>One case can have many runs.</strong> Run different fiscal regimes, different oil prices, different discount rates, and compare them.</li>
              </ul>

              <SubHeading>Case naming convention</SubHeading>
              <Para>
                Suggested format: <Code>[Asset/Field name] [Regime] [Scenario tag]</Code>
              </Para>
              <Para>
                Examples: <Code>Akoma JV base</Code>, <Code>OML-127 PIA converted lease</Code>, <Code>Bonga PSC 2026 review</Code>
              </Para>
            </section>

            {/* SECTION: DATA */}
            <section id="section-data" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={Upload}>Uploading data</SectionHeading>

              <Para>
                The Studio requires three CSV files. Each file is uploaded separately from the case detail page. Since engine v3.3 the parser is forgiving about header spelling, so most sensible column names just work.
              </Para>

              <Callout tone="info" title="Header matching is forgiving">
                Headers are matched case-insensitively: each header is trimmed, lowercased, and spaces become underscores before matching. <Code>Well_A_Oil_BBL</Code>, <Code>well_a_oil_bbl</Code>, and <Code>Well A Oil BBL</Code> all resolve to the same column. If the engine cannot recognize the columns at all, it fails the run with a clear validation error naming the headers it saw, instead of returning a $0 result.
              </Callout>

              <SubHeading>Production volumes CSV</SubHeading>
              <Para>The CSV has one row per time period. Each well contributes columns following the pattern <Code>{'<wellname>_<stream>_<unit>'}</Code>.</Para>
              <Table
                headers={['Column', 'Type', 'Notes']}
                rows={[
                  [<Code key="1">year</Code>,              'integer',  'Or use month_index / date as alternative time column'],
                  [<Code key="2">{'<well>_oil_bbl'}</Code>,       'numeric',  'Per-well oil production in barrels'],
                  [<Code key="3">{'<well>_gas_mscf'}</Code>,      'numeric',  'Per-well gas production in thousand standard cubic feet'],
                  [<Code key="4">{'<well>_condensate_bbl'}</Code>,'numeric',  'Per-well condensate, if applicable'],
                  [<Code key="5">{'<well>_water_bbl'}</Code>,     'numeric',  'Per-well water production'],
                ]}
              />
              <Para>
                Multi-well fields: one CSV row per year, multiple per-well columns. The engine sums per-well columns into annual totals automatically. The engine accepts any per-well column ending in <Code>_oil_bbl</Code>, <Code>_gas_mscf</Code>, <Code>_condensate_bbl</Code>, or <Code>_water_bbl</Code>. Single-stream files can instead use bare columns named <Code>oil_bbl</Code>, <Code>gas_mscf</Code>, <Code>condensate_bbl</Code>, or <Code>water_bbl</Code>. Field-level rollup columns like <Code>total_oil_bbl</Code> are used when no per-well columns exist.
              </Para>

              <SubHeading>CAPEX schedule CSV</SubHeading>
              <Table
                headers={['Column', 'Type', 'Notes']}
                rows={[
                  [<Code key="1">year</Code>,        'integer',  'Year capex is incurred'],
                  [<Code key="2">amount_usd</Code>,  'numeric',  'USD nominal amount for that year'],
                  [<Code key="3">description</Code>, 'text',     'Optional: drilling, facilities, abandonment, etc.'],
                ]}
              />
              <Para>
                The amount column can be named <Code>amount_usd</Code>, <Code>cost_usd</Code>, <Code>capex_usd</Code>, <Code>total_capex_usd</Code>, or <Code>value_usd</Code>. Any other column ending in <Code>_usd</Code> is also accepted. Capex is depreciated over 5 years (or as configured in the run console under <Code>pia_capex_recovery_years</Code>). The engine handles the depreciation automatically.
              </Para>

              <SubHeading>OPEX schedule CSV</SubHeading>
              <Table
                headers={['Column', 'Type', 'Notes']}
                rows={[
                  [<Code key="1">year</Code>,             'integer', 'Year opex is incurred'],
                  [<Code key="2">total_opex_usd</Code>,   'numeric', 'Total opex for the year in USD (nominal)'],
                  [<Code key="3">fixed_opex_usd</Code>,   'numeric', 'Optional split: fixed component'],
                  [<Code key="4">variable_opex_usd</Code>,'numeric', 'Optional split: variable component'],
                ]}
              />
              <Para>
                The engine prefers <Code>total_opex_usd</Code>. If it is zero or missing, the engine sums all columns ending in <Code>_usd</Code> as a fallback.
              </Para>

              <Callout tone="info" title="Inflation handling">
                Costs in your CSVs should be entered in nominal (then-year) USD. The engine applies inflation escalators based on your run configuration. Don't pre-inflate your CSV costs.
              </Callout>

              <SubHeading>Common upload pitfalls</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Excel quirks:</strong> Save as CSV (not Excel CSV), use UTF-8 encoding. Avoid commas in numeric fields and use periods for decimals.</li>
                <li><strong>Date columns:</strong> If using a <Code>date</Code> column instead of <Code>year</Code>, format as <Code>YYYY-MM-DD</Code>.</li>
                <li><strong>Empty rows:</strong> Don't leave blank rows in the middle of your CSV. They'll be skipped but can confuse year inference.</li>
                <li><strong>Units:</strong> Oil in barrels (not stb), gas in Mscf (not BCF or m³), money in USD (not naira).</li>
              </ul>
            </section>

            {/* SECTION: FISCAL */}
            <section id="section-fiscal" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={Calculator}>Fiscal regime</SectionHeading>
              <Para>
                Nigerian upstream operations are governed by one of three fiscal regimes. Choosing the correct one is critical. Applying JV math to a PSC project will produce wrong NPVs by tens of millions of dollars.
              </Para>

              <SubHeading>How to choose</SubHeading>
              <Table
                headers={['Use this regime when…', 'Regime']}
                rows={[
                  ['You hold an OML or OPL granted before 2021 and have NOT converted to PML/PPL', 'JV (default for legacy assets)'],
                  ['You operate under a Production Sharing Contract, typical for deep offshore', 'PSC'],
                  ['You hold a PML or PPL, either a new grant or a voluntary conversion from OML/OPL', 'PIA 2021'],
                ]}
              />

              <SubHeading>JV (Joint Venture) configuration</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Working interest:</strong> Your share of the project (e.g., 40% for NNPC/Shell JV)</li>
                <li><strong>Royalty rate:</strong> Typically 15% onshore, 7.5% deep offshore</li>
                <li><strong>Tax rate:</strong> Petroleum Profits Tax at 85%, or 65.75% during pre-payout amortization</li>
              </ul>

              <SubHeading>PSC configuration</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Royalty rate:</strong> Per the contract, often 0% under the original DIBPSCA terms</li>
                <li><strong>Cost oil cap %:</strong> The annual cap on cost recovery (e.g., 80% of post-royalty revenue)</li>
                <li><strong>Contractor profit share:</strong> Your share of profit oil after cost recovery</li>
                <li><strong>Tax rate:</strong> 50% PPT for deep offshore PSC contract areas</li>
              </ul>

              <SubHeading>PIA 2021 configuration</SubHeading>
              <Para>
                The PIA regime is the most complex. It splits taxation into Hydrocarbon Tax (HCT), Companies Income Tax (CIT), and either TET (pre-NTA) or Development Levy (NTA-era). It also handles HCDT, NDDC, production allowance, and CPR (Cost Price Ratio) limits.
              </Para>

              <SubHeading>NTA 2025 framework</SubHeading>
              <Para>
                The Nigeria Tax Act 2025 (in force since January 2026) amends the PIA's fiscal provisions in three material ways:
              </Para>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>TET replaced by Development Levy:</strong> 2.5% TET → 4% Development Levy on assessable profit</li>
                <li><strong>HCT extends to deep offshore:</strong> No longer exempt (per NTA §65(4)), but the rate is legally ambiguous; your tax counsel's interpretation determines what to apply</li>
                <li><strong>Minimum 15% ETR:</strong> For large multinational groups, an effective tax rate floor applies</li>
              </ul>
              <Para>
                The Studio auto-detects which framework to apply based on the <Code>base_year</Code> of your case. For 2026 and later, it uses NTA rules. For 2025 and earlier, it uses pre-NTA PIA rules. You can override this with the "Framework Override" dropdown in the Run Console.
              </Para>

              <Callout tone="warn" title="Deep offshore HCT under NTA: a choice you have to make">
                NTA Section 65(4) removes the deep offshore exemption from HCT but specifies no rate. Top-tier counsel (Olaniwun Ajayi, Fortrose) interpret this differently. The Studio offers three positions:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><strong>Conservative (0%, effectively exempt):</strong> Until NUPRC issues clarification, treat as no HCT applies. Lowest tax forecast.</li>
                  <li><strong>Aggressive (30%, treat as PML):</strong> Most pessimistic. Highest tax forecast. Sometimes used for downside scenarios.</li>
                  <li><strong>Custom rate:</strong> Whatever your tax counsel advises.</li>
                </ul>
              </Callout>
            </section>

            {/* SECTION: RUN */}
            <section id="section-run" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={PlayCircle}>Running an analysis</SectionHeading>

              <Para>
                The Run Console is where you specify all the parameters for one execution of the engine. From a single case you can run dozens of variations.
              </Para>

              <SubHeading>Key fields</SubHeading>
              <Table
                headers={['Field', 'What it controls']}
                rows={[
                  [<Code key="1">base_year</Code>, 'The first year of your analysis. Also drives NTA auto-detection.'],
                  [<Code key="2">oil_price_usd_bbl</Code>, 'Flat-line oil price (use escalator separately if applicable)'],
                  [<Code key="3">discount_rate_pct</Code>, 'Annual discount rate as a nominal percentage'],
                  [<Code key="4">present_value_basis</Code>, '"real" or "nominal"; see below'],
                  [<Code key="5">inflation_rate_pct</Code>, 'Annual inflation; deflates nominal flows to real terms'],
                  [<Code key="6">capex_escalator_pct</Code>, 'Annual capex cost growth; usually 0 if CSV is in nominal terms'],
                  [<Code key="7">opex_escalator_pct</Code>, 'Annual opex cost growth; usually matches inflation if no specific OPEX inflation forecast'],
                ]}
              />

              <SubHeading>Real vs nominal NPV</SubHeading>
              <Para>
                "Real" NPV deflates each year's cash flow by inflation before discounting, then discounts at the real rate. "Nominal" NPV uses nominal cash flows and discounts at the nominal rate. The two should produce identical NPVs in theory; in practice, picking "real" is conventional for project economics because it makes years comparable.
              </Para>

              <Callout tone="info" title="The shorthand">
                If you don't know which to pick, start with <Code>present_value_basis = real</Code>. It's the industry default.
              </Callout>

              <SubHeading>Field Life</SubHeading>
              <Para>
                The Field Life section of the Run Console handles end-of-life economics. Set an <strong>abandonment cost</strong> to apply a post-tax outflow in a chosen year (it is not tax-deducted and not depreciated). Turn on the <strong>economic limit</strong> toggle to trim trailing years whose revenue no longer covers opex, so late-life losses stop dragging on NPV.
              </Para>

              <SubHeading>Save as scenario</SubHeading>
              <Para>
                Tick "Save as scenario" before running to give the run a memorable name. This makes the run easier to find later when comparing scenarios in the same case.
              </Para>
            </section>

            {/* SECTION: RESULTS */}
            <section id="section-results" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={LineChart}>Reading results</SectionHeading>

              <Para>
                The Results viewer surfaces the engine's output through six KPI cards and a six-tab visualization area.
              </Para>

              <SubHeading>The KPI cards</SubHeading>
              <Table
                headers={['KPI', 'What it means']}
                rows={[
                  ['NPV @ rate%',         'Present value of net cash flows. Positive = project creates value at this discount rate.'],
                  ['IRR',                 'Discount rate that makes NPV = 0. Compare to your hurdle rate.'],
                  ['Payback',             'Years until cumulative cash flow turns positive. Sensitive to early capex timing.'],
                  ['Total Revenue',       'Lifetime gross revenue (before any deductions).'],
                  ['Total CAPEX',         'Lifetime capex spent.'],
                  ['Total Tax',           'Lifetime tax burden across all applicable taxes for the regime.'],
                ]}
              />

              <SubHeading>The six tabs</SubHeading>
              <Table
                headers={['Tab', 'When to look at it']}
                rows={[
                  ['Annual Cash Flow',     'Quick view of net cash flow year by year. Use for first-pass sanity check.'],
                  ['Cash Flow Profile',    'Stacked area chart of inflows and outflows with cumulative line. Best for executive presentations.'],
                  ['Waterfall',            'Single-year cascade from gross revenue to ATCF. Use to explain the math to non-economists.'],
                  ['Sensitivity (Tornado)','Shows which inputs move NPV the most. Use before committing to a fiscal scenario.'],
                  ['Risk (Monte Carlo)',   'Runs the deterministic model many times with sampled inputs. Use to see the full NPV distribution and P(NPV>0) instead of a single number.'],
                  ['Year-by-Year Detail',  'Full numeric table. Use for QC, for sharing precise numbers, or when exporting to Excel.'],
                ]}
              />

              <SubHeading>The fiscal framework badge</SubHeading>
              <Para>
                For PIA-regime runs, a small badge appears under the case name showing either "Computed under PIA 2021 (pre-NTA)" (cyan) or "Computed under NTA 2025" (amber). Always confirm this matches your intent. Accidentally running the wrong framework can change NPV by tens of millions.
              </Para>
            </section>

            {/* SECTION: SENSITIVITY */}
            <section id="section-sensitivity" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={Activity}>Sensitivity (Tornado)</SectionHeading>

              <Para>
                The tornado chart answers: "If I'm wrong about input X by ±20%, how much does NPV change?" Each variable becomes one bar. Variables are sorted by impact magnitude, the biggest at the top, forming the tornado silhouette.
              </Para>

              <SubHeading>How to read it</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Red bar (left of zero):</strong> NPV at the lower value of that variable. If oil price falls 20%, red shows how much NPV drops.</li>
                <li><strong>Green bar (right of zero):</strong> NPV at the higher value. If oil price rises 20%, green shows how much NPV gains.</li>
                <li><strong>Bar length:</strong> Bigger = more sensitive. Focus your attention on the top 3–4 variables.</li>
              </ul>

              <SubHeading>What to do with the output</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Oil Price almost always #1.</strong> If something else (e.g., capex) is bigger, scrutinize your inputs.</li>
                <li><strong>If a tax variable is in the top 3,</strong> the fiscal regime materially affects your project and extra diligence on tax assumptions is warranted.</li>
                <li><strong>Variables showing ±$0:</strong> Either your project doesn't use that input (e.g., gas price for a pure oil project) or the project is short enough that the variable doesn't bind (e.g., discount rate on a 1-year project).</li>
              </ul>

              <SubHeading>Limitations of ±20% sweeps</SubHeading>
              <Para>
                Tornado sweeps are univariate: they change one variable at a time. They can't capture interaction effects (e.g., what if oil price AND opex both spike during a downturn?). For that, use the Risk (Monte Carlo) tab, which varies all uncertain inputs together across hundreds or thousands of iterations. See the next section.
              </Para>
            </section>

            {/* SECTION: MONTE CARLO */}
            <section id="section-montecarlo" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={Dices}>Risk and Monte Carlo</SectionHeading>

              <Para>
                Monte Carlo simulation turns a single deterministic NPV into a probability distribution. Instead of asking "what is the NPV?", it answers "how likely is the NPV to be above zero, and what is the realistic range?"
              </Para>

              <SubHeading>How to run it</SubHeading>
              <Step n={1} title="Open a run's results">
                Monte Carlo works per run, so open the Results viewer for the run you want to stress.
              </Step>
              <Step n={2} title="Go to the Risk (Monte Carlo) tab">
                It sits alongside the Sensitivity tab in the results viewer.
              </Step>
              <Step n={3} title="Choose distributions for uncertain inputs">
                You can set distributions for oil price, gas price, and capex, opex, and production scaling factors. Leave an input fixed if you're confident in it.
              </Step>
              <Step n={4} title="Run 100 to 5000 iterations">
                Start with a few hundred iterations for a quick look. Use several thousand for a smooth, presentable distribution.
              </Step>
              <Step n={5} title="Read the outputs">
                The tab shows the NPV cumulative distribution (CDF), P(NPV&gt;0), percentile bands (e.g., P10 / P50 / P90), and a tornado of which sampled inputs drove the spread.
              </Step>

              <SubHeading>How it works under the hood</SubHeading>
              <Para>
                The deterministic engine stays the single source of the cash-flow math. Monte Carlo samples the uncertain inputs from your chosen distributions and reruns that same engine once per iteration. There is no separate "stochastic model" that could drift from the deterministic results: with all distributions collapsed to their base values, the simulation reproduces the deterministic NPV.
              </Para>

              <Callout tone="info" title="Reading P(NPV&gt;0)">
                P(NPV&gt;0) is the fraction of iterations with positive NPV. A project with a healthy base-case NPV but a low P(NPV&gt;0) is fragile: its value depends on optimistic inputs holding.
              </Callout>
            </section>

            {/* SECTION: PITFALLS */}
            <section id="section-pitfalls" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>

              <SubHeading>"My NPV looks too high / too low"</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><strong>Check the fiscal framework badge first.</strong> Running PIA-only when you meant NTA (or vice versa) changes NPV by 1–10% typically.</li>
                <li><strong>Check the discount rate basis.</strong> Real vs nominal makes a big difference if inflation is high. Confirm <Code>discount_rate_pct</Code> matches the basis.</li>
                <li><strong>Check that capex/opex are in nominal not real terms.</strong> Pre-inflated costs get double-inflated by the engine, blowing up the cost side.</li>
                <li><strong>Look at the waterfall for the first production year.</strong> If royalties, HCT, CIT, etc. don't look proportionate, an input is likely off.</li>
              </ul>

              <SubHeading>"My CSV isn't uploading correctly"</SubHeading>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li>Open the CSV in a plain text editor. Confirm the headers follow the naming patterns in "Uploading data." Capitalization and spaces are forgiven, but the stream and unit suffixes (like <Code>_oil_bbl</Code> or <Code>_usd</Code>) must be present.</li>
                <li>Look for hidden BOM characters (UTF-8 with BOM). Save as plain UTF-8.</li>
                <li>Check that numeric columns don't contain text like "N/A" or thousand-separators like commas inside numbers.</li>
              </ul>

              <SubHeading>"The engine returned an error"</SubHeading>
              <Para>
                Most engine errors trace to missing or malformed data. Common cases:
              </Para>
              <ul className="list-disc list-inside space-y-1 text-slate-200 ml-2">
                <li><Code>No production data found</Code>: production CSV is empty or wasn't uploaded</li>
                <li><Code>Unrecognized columns</Code>: the engine couldn't map any header to a known pattern. The error lists the headers it saw so you can spot the mismatch. This replaced the old behavior of silently returning a $0 result.</li>
                <li><Code>Missing run_config_id</Code>: run was started without saving the config first</li>
                <li><Code>Run config lookup failed</Code>: database state is inconsistent; create a fresh run</li>
              </ul>

              <SubHeading>"I want to compare two scenarios side by side"</SubHeading>
              <Para>
                Use the Run Comparison view (accessible from the case detail page). It lets you select two or more runs and view their KPIs side by side. Useful for justifying a fiscal regime choice or showing the impact of a price-deck change.
              </Para>

              <SubHeading>"What is auto-validated, and what isn't?"</SubHeading>
              <Para>
                The PIA-only math is validated byte-for-byte against the published NUPRC worked example. The NTA-era math (Development Levy, deep offshore HCT) is "best interpretation": it follows the statute correctly but has not yet been validated against an NUPRC-published NTA worked example (none exists at time of writing). Treat NTA-era forecasts as defensible but expect minor adjustments when NUPRC issues clarifying guidance.
              </Para>

              <Callout tone="success" title="Need more help?">
                For specific case-by-case questions, contact the Petrolord team. Petroleum Economics Studio is under active development and feedback shapes priorities.
              </Callout>
            </section>

            {/* SECTION: GLOSSARY */}
            <section id="section-glossary" className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Para>
                Quick definitions of the terms used across the Studio and this guide.
              </Para>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {[
                  ['NPV', 'Net Present Value; the sum of all project cash flows discounted back to the base year.'],
                  ['IRR', 'Internal Rate of Return; the discount rate at which project NPV equals zero.'],
                  ['Payback Period', 'The number of years until cumulative net cash flow first turns positive.'],
                  ['Discounted Payback', 'The payback period computed on discounted cash flows, so later dollars count for less.'],
                  ['Breakeven Price', 'The oil price at which project NPV equals zero.'],
                  ['DPI', 'NPV divided by the present value of CAPEX, a capital efficiency measure.'],
                  ['Government Take', 'The share of pre-take project value captured by the state through royalties, taxes and levies.'],
                  ['Unit Technical Cost', 'Total CAPEX plus OPEX divided by total production, expressed in dollars per barrel.'],
                  ['CAPEX', 'Capital expenditure on wells, facilities and infrastructure.'],
                  ['OPEX', 'Operating expenditure required to keep the asset producing.'],
                  ['ABEX', 'Abandonment expenditure incurred to decommission wells and facilities at end of field life.'],
                  ['Royalty', 'A levy on gross production or revenue paid to the state before any profit calculation.'],
                  ['PSC', 'Production Sharing Contract; the contractor recovers costs from cost oil and shares the remaining profit oil with the state.'],
                  ['Cost Oil', 'The share of production allocated to the contractor to recover its costs under a PSC.'],
                  ['Profit Oil', 'The production remaining after royalty and cost oil, shared between contractor and state.'],
                  ['Ring Fencing', 'A fiscal rule that stops costs from one asset or licence being deducted against income from another.'],
                  ['Working Interest', 'Your percentage share of a project’s costs and revenues.'],
                  ['Economic Limit', 'The point in field life where revenue no longer covers operating costs.'],
                  ['Nominal', 'Money-of-the-day values that include inflation.'],
                  ['Real Terms', 'Values with inflation stripped out, expressed in constant base-year money.'],
                  ['Fiscal Regime', 'The set of royalties, taxes and contract terms that determine how project value is split with the state.'],
                  ['Gross Revenue', 'Production multiplied by price, before royalties, costs or taxes.'],
                ].map(([term, def]) => (
                  <div key={term} className="text-sm leading-relaxed">
                    <span className="font-semibold text-cyan-200">{term}:</span>{' '}
                    <span className="text-slate-200">{def}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer nav */}
            <div className="text-center pt-6 pb-12">
              <Link to="/dashboard/apps/economics/epe/cases">
                <Button className="bg-gradient-to-r from-green-600 to-cyan-600 hover:opacity-90">
                  Got it, take me to my Cases <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

export default EpeHelpGuide;
