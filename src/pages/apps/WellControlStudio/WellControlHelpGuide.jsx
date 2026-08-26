// Well Control Studio in-app help guide (D3/W3). EPE/WDS help pattern;
// owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, Database, ClipboardList, ShieldAlert,
  LineChart, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'volumes', icon: Database, title: 'Volumes and strokes' },
  { id: 'killsheet', icon: ClipboardList, title: 'The kill sheet' },
  { id: 'methods', icon: LineChart, title: 'Wait and weight vs driller' },
  { id: 'kicktol', icon: ShieldAlert, title: 'MAASP and kick tolerance' },
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

const WellControlHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Well Control Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to Well Control Studio: volumes, kill sheets, MAASP and kick tolerance." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/well-control-studio">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Well Control Studio
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Well Control Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Know your volumes, plan the kill, protect the shoe</p>
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
                Well Control Studio turns a planned well into well-control numbers: hole and
                string volumes, pump strokes, a complete kill sheet (kill mud weight, ICP,
                FCP, the step-down schedule), MAASP and kick tolerance. It reads the
                definitive trajectory and the shared hole/casing geometry that the other
                drilling studios use, so the numbers always describe the same well.
              </Para>
              <Callout tone="danger" title="Planning tool, not certification">
                This is a PLANNING tool in the kill-sheet tradition, built for a surface BOP
                stack. It is not a substitute for the rig's official kill sheet, for
                transient kill simulation, or for well control training and certification.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore and create a case">The defaults seed a sensible string, pump and kick scenario.</Step>
              <Step n={2} title="Set pump, shoe and mud">Pump output per stroke, SCR pressure, shoe MD and the LOT fracture EMW, current mud weight. Compute volumes.</Step>
              <Step n={3} title="Enter the shut-in readings">SIDPP, SICP and pit gain on the Kill Sheet tab, then Compute kill sheet.</Step>
              <Step n={4} title="Read the schedule">KMW, ICP, FCP and the step-down table; toggle between wait-and-weight and driller's method.</Step>
              <Step n={5} title="Check the shoe">Kick Tolerance tab: MAASP and the kick volume the shoe can stand.</Step>
              <Step n={6} title="Export">Save the run and export the kill sheet PDF.</Step>
            </Section>

            <Section id="volumes">
              <SectionHeading icon={Database}>Volumes and strokes</SectionHeading>
              <Para>
                Drillstring volume comes from each component's bore; annulus volumes come
                from the hole/casing sections against the component outer diameters, section
                by section. With the pump output per stroke the Studio converts volumes to
                strokes: surface to bit, bottoms up, and full cycle. TVDs are taken from the
                trajectory with exact minimum-curvature interpolation.
              </Para>
            </Section>

            <Section id="killsheet">
              <SectionHeading icon={ClipboardList}>The kill sheet</SectionHeading>
              <Table
                headers={['Quantity', 'Formula (IWCF convention)']}
                rows={[
                  ['Formation pressure', 'mud hydrostatic at hole TVD plus SIDPP'],
                  ['Kill mud weight', 'mud weight plus SIDPP converted to density at hole TVD'],
                  ['ICP', 'SCR pressure plus SIDPP'],
                  ['FCP', 'SCR pressure times KMW over original mud weight'],
                  ['Step-down', 'linear from ICP to FCP over surface-to-bit strokes'],
                ]}
              />
              <Para>
                The influx line on the results card estimates the influx gradient from the
                SIDPP/SICP difference over the influx height (pit gain over near-bit annular
                capacity) and labels it gas, mixed or liquid. It is informational; the kill
                schedule does not depend on it.
              </Para>
            </Section>

            <Section id="methods">
              <SectionHeading icon={LineChart}>Wait and weight vs driller</SectionHeading>
              <Para>
                Wait and weight kills in one circulation: kill mud goes in immediately and
                the standpipe walks from ICP to FCP while it travels to the bit. The
                driller's method uses two circulations: the first circulates the influx out
                with original mud at constant ICP, the second displaces kill mud exactly like
                the wait-and-weight schedule. The chart redraws for whichever method you
                pick; driller's pumps roughly twice the strokes but starts sooner and keeps
                the procedure simpler.
              </Para>
            </Section>

            <Section id="kicktol">
              <SectionHeading icon={ShieldAlert}>MAASP and kick tolerance</SectionHeading>
              <Para>
                MAASP is the annulus surface pressure that brings the shoe to its fracture
                pressure with the current mud. Kick tolerance is the largest influx volume
                that can be taken and circulated out without breaking down the shoe; the
                Studio evaluates the influx standing at bottom at shut-in AND the single
                bubble circulated to just below the shoe (Boyle expansion, constant bottom
                hole pressure) and reports the smaller volume. The sweep chart shows how the
                tolerance shrinks as mud weight rises toward the fracture gradient.
              </Para>
              <Callout tone="warn" title="Single-bubble assumption">
                Real gas kicks disperse and migrate; the single-bubble isothermal model is
                the standard conservative planning convention, not a transient simulation.
              </Callout>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                Every number is closed-form algebra gated against an independent oracle
                implementation and a hand-constructed IWCF-style example whose identities are
                asserted before the reference values are committed. Volumes are cross-checked
                against exact cylinder geometry; Boyle conversions round-trip exactly.
                Literature gates for a published IWCF/IADC kill sheet example and an ADE
                worked kick example are armed and activate when the documents are supplied.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>My SICP is lower than SIDPP</SubHeading>
              <Para>
                Unusual (the influx is lighter than mud, so casing pressure normally reads
                higher). The Studio warns but still computes; check the gauges and the
                shut-in procedure.
              </Para>
              <SubHeading>Which SCR pressure should I use?</SubHeading>
              <Para>
                The recorded slow-circulating-rate pressure at the rate you intend to kill
                at, taken with the current mud and bit. Re-record it after mud weight or BHA
                changes.
              </Para>
              <SubHeading>Why is kick tolerance so small in the deviated well?</SubHeading>
              <Para>
                Kick tolerance depends on TRUE VERTICAL depths. A long tangent or lateral
                adds measured depth and volume but little TVD separation between shoe and
                TD, so the hydrostatic headroom at the shoe is small.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['SIDPP / SICP', 'Shut-in drillpipe / casing pressure'],
                  ['KMW', 'Kill mud weight: the density that balances the formation'],
                  ['ICP / FCP', 'Initial / final circulating pressure on the kill schedule'],
                  ['SCR', 'Slow circulating rate: the pre-recorded kill-rate pump pressure'],
                  ['MAASP', 'Maximum allowable annulus surface pressure (shoe limited)'],
                  ['Kick tolerance', 'Largest influx volume the shoe can stand'],
                  ['LOT', 'Leak-off test: the measured fracture EMW at the shoe'],
                  ['Bottoms up', 'Annulus volume from bit to surface, in strokes or time'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default WellControlHelpGuide;
