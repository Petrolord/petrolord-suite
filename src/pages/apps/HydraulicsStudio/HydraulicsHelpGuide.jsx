// Drilling Fluids & Hydraulics Studio in-app help guide (D2/H3). EPE/WDS
// help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, FlaskConical, Waves, Gauge, LineChart,
  Droplets, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'rheology', icon: FlaskConical, title: 'Mud and rheology' },
  { id: 'hydraulics', icon: Waves, title: 'Losses, pump pressure, ECD' },
  { id: 'surge', icon: Gauge, title: 'Surge and swab' },
  { id: 'cleaning', icon: Droplets, title: 'Hole cleaning' },
  { id: 'charts', icon: LineChart, title: 'Reading the charts' },
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

const HydraulicsHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Drilling Fluids & Hydraulics Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Hydraulics Studio: mud rheology, circulating losses, ECD, surge and swab, hole cleaning." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/drilling-fluids-hydraulics">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Hydraulics Studio
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <Waves className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Drilling Fluids & Hydraulics Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Fit the mud, size the pumps, hold the window</p>
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
                The Hydraulics Studio answers four planning questions for a well you designed
                in Well Design Studio: what pump pressure does the circulating system need,
                what equivalent circulating density does the annulus see, how fast can you
                trip without fracturing or swabbing in the well, and does the flow rate clean
                the hole. It shares the hole and casing sections you defined in Torque & Drag
                Studio; the drillstring can be imported from a T&D case with one click.
              </Para>
              <Callout tone="info" title="One geometry, many apps">
                Hole and casing sections live on the wellbore, not in this app. Edit them in
                either studio; both read the same rows.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore">Select the site and wellbore; the status bar confirms the definitive design.</Step>
              <Step n={2} title="Create a case">Use the plus next to Hydraulics cases. Defaults give you a sensible mud and string.</Step>
              <Step n={3} title="Enter the mud">Type the Fann dial readings on the Mud & Rheology tab and check the fitted models on the rheogram.</Step>
              <Step n={4} title="Run hydraulics">On the Hydraulics tab set flow rate and nozzles, then Run. Read pump pressure, the loss table and the ECD track.</Step>
              <Step n={5} title="Check tripping and cleaning">Sweep trip speeds on Surge & Swab; verify transport ratios on Hole Cleaning.</Step>
              <Step n={6} title="Save">Save the case, save the run, export CSV or PDF.</Step>
            </Section>

            <Section id="rheology">
              <SectionHeading icon={FlaskConical}>Mud and rheology</SectionHeading>
              <Para>
                Enter the 600 and 300 rpm readings (plus 6 and 3 rpm if you have them). The
                Studio fits three models at once: Bingham plastic (PV/YP), power law (n, K)
                and Herschel-Bulkley (yield plus power law, the RP 13D default used for the
                pressure-loss chain). The rheogram shows all three against your readings so
                you can judge the fit at both ends of the shear range.
              </Para>
              <Callout tone="info" title="Which model is used?">
                Auto uses Herschel-Bulkley. Pick another model explicitly if your mud report
                standardizes on it; every loss calculation follows your choice.
              </Callout>
            </Section>

            <Section id="hydraulics">
              <SectionHeading icon={Waves}>Losses, pump pressure, ECD</SectionHeading>
              <Para>
                The circulating path is walked element by element: down the string bore,
                through the nozzles, up the annulus. Each element gets a flow regime
                (laminar, transitional, turbulent) from the generalized Reynolds number and
                a friction-factor correlation of the API type. Pump pressure is the sum of
                surface, pipe, bit and annular losses. ECD at any depth adds the annular
                losses above that depth to the static mud head.
              </Para>
              <Table
                headers={['Output', 'Use it for']}
                rows={[
                  ['Pump pressure', 'Rig pump and liner selection at the planned rate'],
                  ['Bit pressure share', 'Nozzle sizing; 50 to 65 percent at the bit is a common optimization target'],
                  ['ECD at shoe and TD', 'Compare against the fracture gradient; the chart overlays PP/FP when the wellbore is bridged to a pore-pressure prognosis'],
                  ['Min annular velocity', 'First-pass hole cleaning screen'],
                ]}
              />
            </Section>

            <Section id="surge">
              <SectionHeading icon={Gauge}>Surge and swab</SectionHeading>
              <Para>
                Tripping pipe displaces mud and drags it along the pipe wall. The Studio uses
                the steady-state Burkhardt approach: pipe movement creates an effective
                annular velocity (with a clinging constant of 0.45) and the same loss chain
                turns it into a pressure at the bit. Surge adds to the static head while
                running in; swab subtracts while pulling out. When a pore-pressure prognosis
                is available the max safe trip speed is solved automatically.
              </Para>
              <Callout tone="warn" title="Closed vs open ended">
                Closed ended (plugged bit, float in the string) displaces the full pipe
                cross-section and is the conservative planning case. Open ended credits the
                bore area.
              </Callout>
            </Section>

            <Section id="cleaning">
              <SectionHeading icon={Droplets}>Hole cleaning</SectionHeading>
              <Para>
                Cuttings fall through the mud at a slip velocity computed from a force
                balance with a standard drag-coefficient law. The transport ratio compares
                slip to annular velocity; below 0.5 the section is at risk. The Studio also
                estimates the annular cuttings concentration from your ROP and solves the
                minimum flow rate that keeps every section above the target ratio.
              </Para>
              <Callout tone="danger" title="High-angle wells">
                The slip-velocity basis is a vertical-well correlation. Above 35 degrees the
                Studio flags results as optimistic: cuttings beds form on the low side and
                need rotation and sweeps that this screening model does not capture.
              </Callout>
            </Section>

            <Section id="charts">
              <SectionHeading icon={LineChart}>Reading the charts</SectionHeading>
              <Para>
                The ECD track plots static mud and circulating ECD against TVD, with the
                PP/FP window shaded when published curves exist for the bridged well. Keep
                the purple ECD line inside the window at every depth. The surge/swab chart
                plots EMW at the bit against trip speed; the intersection with the PP or FP
                reference line is your speed limit.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                The engines are gated against closed forms and an independent oracle before
                any release:
              </Para>
              <Table
                headers={['Gate', 'What it proves']}
                rows={[
                  ['Newtonian limit', 'The laminar pipe loss reproduces Hagen-Poiseuille exactly'],
                  ['Power-law laminar', 'Pipe and slot-annulus losses match the exact closed forms'],
                  ['Bit algebra', 'Nozzle pressure drop, jet velocity, power and impact identities'],
                  ['ECD algebra', 'ECD equals density plus annular losses over g times TVD, exactly'],
                  ['Oracle cases', 'Two wells, two muds, three rates, surge/swab sweeps and slip velocities agree with an independent implementation to 0.0001 percent'],
                ]}
              />
              <Para>
                Literature gates for the ADE chapter 4 hydraulics example and an API RP 13D
                worked example are armed and activate when the source documents are supplied.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>Pump pressure looks low</SubHeading>
              <Para>
                Check the surface loss allowance (default zero) and the nozzle TFA: no
                nozzles means no bit loss and the run carries a warning. Motor and MWD
                pressure drops are not modelled; add them to the surface allowance.
              </Para>
              <SubHeading>ECD barely moves</SubHeading>
              <Para>
                In large casing the annular velocity is low and friction is small; most ECD
                comes from the open-hole section. Check the loss table per element.
              </Para>
              <SubHeading>Why Herschel-Bulkley by default?</SubHeading>
              <Para>
                It captures both the low-shear yield that controls swab and hole cleaning and
                the high-shear behaviour that controls pipe losses. Bingham overpredicts
                low-shear stress; pure power law has no yield.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['PV / YP', 'Bingham plastic viscosity and yield point from the 600/300 readings'],
                  ['n / K', 'Power-law index and consistency'],
                  ['ECD', 'Equivalent circulating density: static mud plus annular friction as a density'],
                  ['EMW', 'Equivalent mud weight: any pressure expressed as a density at a depth'],
                  ['TFA', 'Total flow area of the bit nozzles'],
                  ['HSI', 'Hydraulic horsepower per square inch of bit area'],
                  ['Surge / swab', 'Pressure change from running in / pulling out of the hole'],
                  ['Transport ratio', 'One minus slip velocity over annular velocity'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default HydraulicsHelpGuide;
