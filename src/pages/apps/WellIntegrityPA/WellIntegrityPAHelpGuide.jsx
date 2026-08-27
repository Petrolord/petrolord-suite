// Well Integrity & P&A Studio in-app help guide (D10/WI3).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, ShieldCheck, Gauge, Layers, ListChecks,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'barriers', icon: ShieldCheck, title: 'Barrier envelopes' },
  { id: 'annulus', icon: Gauge, title: 'MAASP & MAWOP' },
  { id: 'plugs', icon: Layers, title: 'Balanced plugs' },
  { id: 'program', icon: ListChecks, title: 'Abandonment program' },
  { id: 'validation', icon: BadgeCheck, title: 'Validation basis' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls & FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
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
const Callout = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-cyan-900/30 border-cyan-500/40 text-cyan-100',
    warn: 'bg-amber-900/30 border-amber-500/40 text-amber-100',
    danger: 'bg-red-900/30 border-red-500/40 text-red-100',
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
        <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-cyan-200 font-semibold border-b border-white/10">{h}</th>)}</tr>
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
const Section = ({ id, children }) => (
  <section id={`section-${id}`} className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6 mb-6 scroll-mt-6">
    {children}
  </section>
);

const WellIntegrityPAHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Well Integrity & P&A Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Well Integrity & P&A Studio: barrier envelopes, MAASP and MAWOP, balanced cement plugs, and the abandonment program." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/well-integrity-pa">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Well Integrity & P&A
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Well Integrity & P&A Help Guide</h1>
              <p className="text-lime-200 text-lg">Two barriers, defensible limits, a plan to leave the well safe forever</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3">
            <div className="sticky top-6 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-lime-300/70 mb-2 px-2">Contents</div>
              <nav className="space-y-1">
                {sections.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button key={s.id} type="button" onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activeSection === s.id ? 'bg-lime-500/20 text-lime-200' : 'text-slate-300 hover:bg-white/10'}`}>
                      <Icon className="h-4 w-4 shrink-0" /> {s.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-9">
            <Section id="overview">
              <SectionHeading icon={BookOpen}>What is the Studio?</SectionHeading>
              <Para>
                The Well Integrity & P&A Studio keeps the life-of-well safety case honest. It
                verifies your well barrier envelopes in the NORSOK D-010 two-barrier convention,
                sets annulus operating limits (MAASP and MAWOP), sizes balanced cement plugs with
                the classic placement arithmetic, and assembles the plug and abandonment program
                as a phased, rule-checked planning checklist.
              </Para>
              <Para>
                It rides the same wp data spine as the other Drilling studios: cases key to a
                wellbore, annulus element depths convert from MD to TVD on the definitive
                trajectory, and every saved run lands in an immutable history.
              </Para>
              <Callout tone="warn" title="What it is not">
                It is a planning and verification tool, not an operational procedure or a
                regulatory submission. The envelope drawing, slurry design, and the verification
                records (tags, pressure tests, bond logs) stay with the responsible engineer.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore">
                Choose a site and wellbore with a definitive design. Create an integrity case; a
                sensible production well barrier set and one reservoir zone are seeded.
              </Step>
              <Step n={2} title="Set the barrier statuses">
                On the Barriers tab, mark each element verified, degraded, failed, or not
                verified. The traffic light and the rule checks update on every edit.
              </Step>
              <Step n={3} title="Set the annulus limits">
                On the Annulus Pressure tab, enter the limiting elements for each annulus with
                their pressure limits, depths, and backup fluid gradients. The governing element
                and MAWOP appear on the card and the chart.
              </Step>
              <Step n={4} title="Design the plugs">
                On the P&A Plugs tab, set each plug interval and foundation, add the balanced
                plug geometry, and read the slurry, spacer, and displacement volumes.
              </Step>
              <Step n={5} title="Check the program and save a run">
                The Program tab shows two-barrier compliance per zone, the phased step list, and
                the slurry takeoff. Save the run to the immutable history and cost it in the
                Economics Studio decommissioning template.
              </Step>
            </Section>

            <Section id="barriers">
              <SectionHeading icon={ShieldCheck}>Barrier envelopes</SectionHeading>
              <Para>
                A well barrier is an envelope of elements (formation, cement, casing, packer,
                tubing, DHSV, wellhead, tree) that together seal the flow path. A well with flow
                potential toward surface needs two independent envelopes: primary and secondary.
                The studio rolls each envelope up from its element statuses: any failed element
                fails the envelope; a degraded or unverified element degrades it.
              </Para>
              <SubHeading>The traffic light</SubHeading>
              <Table
                headers={['Category', 'Meaning']}
                rows={[
                  ['Green', 'Both envelopes verified intact.'],
                  ['Yellow', 'Degradation or unverified elements, no failure.'],
                  ['Orange', 'One envelope failed with the other intact, or a single-envelope well where two are required.'],
                  ['Red', 'One envelope failed and the other is degraded, failed, or missing.'],
                ]}
              />
              <Para>
                An element serving both envelopes is a common well barrier element. It is flagged
                as a warning: sharing is acceptable only by deliberate, documented acceptance.
              </Para>
              <Callout tone="info" title="Status only, not geometry">
                The studio checks statuses and rules. It does not verify that your elements
                geometrically close around the source; that is the envelope drawing, and it stays
                with you.
              </Callout>
            </Section>

            <Section id="annulus">
              <SectionHeading icon={Gauge}>MAASP & MAWOP</SectionHeading>
              <Para>
                Every limiting element in an annulus allows a surface pressure given by the
                differential hydrostatic form: the factored element limit at its depth, minus the
                difference between the annulus fluid head and the backup fluid head at that depth.
                The governing element is the minimum, and that minimum is the MAASP.
              </Para>
              <Para>
                MAWOP for sustained casing pressure follows the API RP 90 convention factors: 50
                percent of the outer casing burst rating, 80 percent of the inner casing burst
                rating, and 75 percent of the inner tubing collapse rating. A hand fixture pins
                the arithmetic: a 30 MPa limit factored at 0.8 at 2000 m TVD with 1200 kg/m3
                annulus fluid against a 1030 kg/m3 backup allows 20.67 MPa at surface.
              </Para>
              <Callout tone="warn" title="The document governs">
                The factors are the published convention and stay overridable. Wear, corrosion,
                and temperature derating are yours to apply on the entered limits; the RP 90 and
                D-010 documents govern the final numbers.
              </Callout>
            </Section>

            <Section id="plugs">
              <SectionHeading icon={Layers}>Balanced plugs</SectionHeading>
              <Para>
                The balanced plug arithmetic is exact and classic: slurry volume is the hole
                capacity times the plug length plus excess; the balanced height divides that
                volume by the annulus plus stinger capacities; the spacer behind equals the
                spacer ahead scaled by the capacity ratio so both columns stand level; and the
                displacement stops when the columns balance.
              </Para>
              <Para>
                The hand case in the validation set: a 150 m plug from 1850 to 2000 m in a 0.216 m
                bore with a 0.127 by 0.1086 m stinger and 20 percent excess settles to a plug top
                of 1820 m after pulling the stinger. With zero excess the settled top equals the
                design top exactly, which is the identity the oracle asserts.
              </Para>
              <SubHeading>Rule checks</SubHeading>
              <Para>
                Plug length and position checks follow the commonly cited NORSOK D-010 rev 4
                conventions: 100 m MD minimum for a cement plug, 50 m when set on a verified
                mechanical foundation, at least 50 m above the source of inflow, 50 m for the
                surface plug, and 30 m of verified annular cement (100 m unverified) as the
                external barrier.
              </Para>
            </Section>

            <Section id="program">
              <SectionHeading icon={ListChecks}>Abandonment program</SectionHeading>
              <Para>
                Every zone with flow potential needs two independent permanent barriers: a
                primary plug that covers the source and extends at least 50 m above it, and a
                secondary that backs it up from above. The Program tab scores each zone, checks
                the surface plug, orders the steps into three phases (zone barriers deepest
                first, then intermediate cut and retrieve, then the surface plug and wellhead
                removal), and totals the designed slurry.
              </Para>
              <Callout tone="info" title="Costing the program">
                The Economics cross-link opens Petroleum Economics Studio, where the
                decommissioning template turns the program into rig days and money.
              </Callout>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                Every verdict in the studio is recomputed by an independent Python oracle before
                the engines ship: the full 16-row categorization truth table, the MAASP and MAWOP
                hand fixtures, the balanced plug hand case with its zero-excess identity, the
                rule tables, and the two-zone program fixture. Suite gates A30 and A31 replay the
                oracle goldens against the vendored engines on every validation run.
              </Para>
              <Para>
                Literature gates for the NORSOK D-010 tables and an API RP 90 worked example are
                armed and waiting on the owner documents.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>My MAWOP is zero or negative</SubHeading>
              <Para>
                A heavy annulus fluid against a light backup can consume the whole factored
                limit at depth. That is the arithmetic telling you the element allows no
                sustained surface pressure; fix the fluid or the element, not the number.
              </Para>
              <SubHeading>The secondary plug fails a zone even though it is long enough</SubHeading>
              <Para>
                A secondary must sit entirely above the source top. A plug that straddles the
                source competes for the primary role and is checked against the coverage rules
                instead.
              </Para>
              <SubHeading>Why does an unverified element degrade my envelope?</SubHeading>
              <Para>
                An untested element is not a qualified barrier. Initial and periodic verification
                is what turns hardware into a barrier element.
              </Para>
              <SubHeading>No definitive trajectory</SubHeading>
              <Para>
                Without a definitive design the studio takes element TVDs as their MDs and warns.
                Promote a design in Well Design Studio for real TVDs on a deviated well.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['WBE', 'Well barrier element: one component of a barrier envelope.'],
                  ['Common WBE', 'An element shared by both envelopes; flagged, needs acceptance.'],
                  ['MAASP', 'Maximum allowable annulus surface pressure, governed by the weakest element.'],
                  ['MAWOP', 'Maximum allowable wellhead operating pressure for sustained casing pressure, API RP 90 convention.'],
                  ['Balanced plug', 'Cement plug placed so inside and annulus columns stand level before pulling the stinger.'],
                  ['Foundation', 'Mechanical plug or tagged base a cement plug sits on; halves the required length.'],
                  ['Flow potential', 'A pressure differential toward surface that demands two barrier envelopes.'],
                  ['Traffic light', 'Green, yellow, orange, red well categorization from the two envelope statuses.'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default WellIntegrityPAHelpGuide;
