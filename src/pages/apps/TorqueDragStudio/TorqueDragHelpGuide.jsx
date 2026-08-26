// Torque & Drag Studio in-app help guide (D1/TD3). Sectioned single-page
// component with sticky left navigation, on the EPE/WDS help guide pattern
// (dark glass cards, slate/lime/cyan tokens). Owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, Cable, Layers, Gauge, LineChart, Disc3,
  SlidersHorizontal, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'string', icon: Cable, title: 'Building the drillstring' },
  { id: 'geometry', icon: Layers, title: 'Hole and casing sections' },
  { id: 'operations', icon: Gauge, title: 'Operations and friction' },
  { id: 'analysis', icon: LineChart, title: 'Reading the results' },
  { id: 'wear', icon: Disc3, title: 'Casing wear' },
  { id: 'sensitivity', icon: SlidersHorizontal, title: 'Friction sensitivity' },
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
const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-900/70 text-cyan-200 text-sm font-mono">{children}</code>
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

const TorqueDragHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Torque & Drag Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to Torque & Drag Studio: drillstring building, soft-string loads, buckling, casing wear and friction sensitivity." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/torque-drag-studio">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Torque & Drag Studio
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <Cable className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Torque & Drag Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Load the string, check the limits, protect the casing</p>
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
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activeSection === s.id ? 'bg-lime-500/20 text-lime-200' : 'text-slate-300 hover:bg-white/10'}`}
                    >
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
                Torque & Drag Studio predicts the axial loads (hookload), surface torque and
                side forces on a drillstring as it moves through a planned wellbore. It reads
                the definitive trajectory you built in Well Design Studio, runs a validated
                soft-string model (the industry standard Johancsik formulation), flags
                buckling, and estimates casing wear from the same contact forces.
              </Para>
              <Para>
                Everything computes in your browser against the trajectory stations saved on
                the definitive design. Cases and run history save to your organization's
                shared well planning workspace with the same privacy model as Well Design
                Studio: private by default, read-only for org members when the site is shared.
              </Para>
              <Callout tone="info" title="Where the trajectory comes from">
                The Studio uses the station cache saved on the wellbore's definitive design.
                If the explorer says there is no definitive design, open Well Design Studio,
                solve and save a design, and mark it definitive.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore">Choose a site and wellbore in the explorer. The status line confirms the definitive design and station count.</Step>
              <Step n={2} title="Create a case">Click the plus next to T&D cases. A default string (drill collars, HWDP, 5 inch drill pipe filled toward TD) is seeded for you.</Step>
              <Step n={3} title="Describe the hole">In String & Geometry, add hole sections: the cased interval (pick a casing from the catalog) and the open hole below it.</Step>
              <Step n={4} title="Set mud, friction and operations">Enter mud density, cased and open hole friction factors, WOB and RPM, and tick the operations you want.</Step>
              <Step n={5} title="Run">Save the case, switch to Analysis and click Run analysis. Read the KPI band, the broomstick plot and the warnings.</Step>
              <Step n={6} title="Save the run">Click Save run to add the result to the immutable history, or export CSV and PDF.</Step>
            </Section>

            <Section id="string">
              <SectionHeading icon={Cable}>Building the drillstring</SectionHeading>
              <Para>
                The string is listed from the bit up. Each row is a component type (drill
                collar, HWDP or drill pipe) picked from a catalog of published API sizes:
                outer and inner diameter, adjusted weight and tool joint OD fill in
                automatically. Lengths are edited in the wellbore's depth unit.
              </Para>
              <SubHeading>Analysis depth</SubHeading>
              <Para>
                The bit sits at the total string length, clamped to the trajectory TD. Use
                <Code>Fill last to TD</Code> to stretch the last drill pipe section so the bit
                reaches TD. A shorter string is analysed exactly as entered, hanging with the
                bit off bottom at the string length.
              </Para>
              <Callout tone="warn" title="Grades matter for utilization">
                Pick the drill pipe grade (E-75 to S-135). Tension and torsion utilization and
                their warnings use the grade's yield strength.
              </Callout>
            </Section>

            <Section id="geometry">
              <SectionHeading icon={Layers}>Hole and casing sections</SectionHeading>
              <Para>
                Hole sections describe what the string rubs against: a cased interval uses the
                casing inner diameter, an open hole interval uses the bit or hole size. The
                sections belong to the wellbore, not the case, and are shared with future
                drilling apps (hydraulics reads the same geometry).
              </Para>
              <Table
                headers={['Field', 'Meaning']}
                rows={[
                  ['From / To', 'Measured depth interval of the section'],
                  ['Cased', 'Ticked: the string runs inside casing; pick the size from the catalog'],
                  ['Hole/Csg ID', 'Inner diameter the string sees, in inches'],
                ]}
              />
              <Callout tone="info" title="Cover the whole string">
                Sections should cover from surface to TD. Uncovered spans compute with zero
                friction and the run carries a warning.
              </Callout>
            </Section>

            <Section id="operations">
              <SectionHeading icon={Gauge}>Operations and friction</SectionHeading>
              <Para>
                Six operations are available: trip out, trip in, rotate off bottom, rotate on
                bottom, slide drill and backream. On-bottom modes apply your WOB and bit
                torque at the bit. Friction splits by the sliding velocity, so pure rotation
                carries no axial drag and combined modes such as backreaming share the
                friction budget between axial and rotary components.
              </Para>
              <SubHeading>Friction factors</SubHeading>
              <Para>
                Two factors describe the well: cased hole and open hole. Typical planning
                values are 0.20 to 0.25 in casing and 0.30 to 0.40 in open hole with
                water-based mud. Calibrate against offset well data when you have it, and use
                the Sensitivity tab to see how much the answer depends on the choice.
              </Para>
            </Section>

            <Section id="analysis">
              <SectionHeading icon={LineChart}>Reading the results</SectionHeading>
              <Para>
                The KPI band shows pickup hookload, surface torque, the shallowest buckling
                onset and the maximum casing wall loss. The broomstick plot draws axial load
                against measured depth for every operation, with depth increasing downward.
                Negative axial load is compression.
              </Para>
              <Para>
                The side force track shows the contact force per metre for the governing
                operation, with buckled intervals highlighted in red. Warnings list buckling
                onsets, utilization above 80 percent of pipe capacity, and geometry gaps.
              </Para>
              <Callout tone="danger" title="Buckling flags">
                A sinusoidal flag means compression exceeds the Paslay-Dawson limit; helical
                means it exceeds the Chen-Cheatham limit and lockup risk is real. Reduce WOB,
                add HWDP, or revisit the trajectory.
              </Callout>
            </Section>

            <Section id="wear">
              <SectionHeading icon={Disc3}>Casing wear</SectionHeading>
              <Para>
                Casing wear uses the energy model: wear volume equals wear factor times tool
                joint side force times sliding distance. Side forces come from the rotating
                T&D profile; sliding distance comes from the rotating hours and RPM you enter
                in the wear schedule. The groove is modelled with the true crescent geometry
                of a tool joint biting into the casing wall, and the remaining wall derates
                the burst rating linearly (Barlow).
              </Para>
              <Callout tone="warn" title="Wear factor">
                The wear factor depends on mud, casing grade and tool joint hardbanding.
                Field values commonly range from 0.5 to 5 mm3 per kN-m. Treat the default as
                a screening value and calibrate when wear logs exist. Collapse derating is
                deliberately not shown; it needs the full API 5C3 regime logic that ships
                with the casing design upgrade.
              </Callout>
            </Section>

            <Section id="sensitivity">
              <SectionHeading icon={SlidersHorizontal}>Friction sensitivity</SectionHeading>
              <Para>
                The Sensitivity tab sweeps cased and open hole friction factors from 0.15 to
                0.40 and tabulates hookload (or torque for rotating modes). Use it to bound
                the plan: if the rig's hookload limit sits inside the sweep range, the well
                depends on friction you have not proven.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                The engine implements the soft-string model of Johancsik et al. (SPE 11380)
                in the standard differential form (Sheppard, SPE 15463). It is gated in the
                engines repository against an independent numerical oracle and closed-form
                anchors before any release:
              </Para>
              <Table
                headers={['Gate', 'What it proves']}
                rows={[
                  ['Vertical well', 'Trip hookload equals buoyed string weight exactly; torque is zero'],
                  ['Straight slant', 'Tension matches wL(cos i plus or minus mu sin i) exactly'],
                  ['Horizontal string', 'Pickup mu w L and torque mu w L r exactly'],
                  ['Capstan limit', 'A weightless arc reproduces the e to the mu beta belt relation'],
                  ['Oracle wells', 'Five synthetic wells times five operations agree with an independent RK4 integration to 0.01 percent'],
                  ['Crescent geometry', 'Wear depth and groove area round-trip against an independent lens formula'],
                ]}
              />
              <Para>
                Literature gates against published worked examples (Mitchell & Miska; the
                SPE 11380 field cases) are armed and activate when the source documents are
                available in the validation library.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>The Run button says there is no trajectory</SubHeading>
              <Para>
                The wellbore has no definitive design with saved stations. Open Well Design
                Studio, save the design (saving writes the station cache) and set it
                definitive.
              </Para>
              <SubHeading>Hookload looks the same for trip in and trip out</SubHeading>
              <Para>
                In a vertical well friction has nothing to grab: both trips equal the buoyed
                weight. Differences grow with inclination and dogleg.
              </Para>
              <SubHeading>Why is my slack-off hookload negative?</SubHeading>
              <Para>
                The model says you must push to get the string down: the well cannot be
                slid to TD with this string and friction. Expect the buckling flags to fire
                too. Rotate the string in, lighten the BHA or reduce friction.
              </Para>
              <SubHeading>Soft-string vs stiff-string</SubHeading>
              <Para>
                Soft-string ignores pipe bending stiffness and slightly overpredicts side
                force in high doglegs. It is the standard planning model; a stiff-string
                option is on the roadmap for wells with severe tortuosity.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['Hookload', 'Axial load at surface, excluding block weight'],
                  ['Broomstick plot', 'Axial load vs depth for several operations on one chart'],
                  ['Buoyancy factor', 'One minus mud density over steel density'],
                  ['Side force', 'Contact force per unit length between string and wellbore'],
                  ['WOB', 'Weight on bit, applied as compression at the bit for on-bottom modes'],
                  ['Sinusoidal buckling', 'Pipe snakes along the low side; onset per Paslay-Dawson'],
                  ['Helical buckling', 'Pipe corkscrews and can lock up; onset per Chen-Cheatham'],
                  ['Wear factor', 'Worn volume per unit friction work, mm3 per kN-m'],
                  ['MOP', 'Margin of overpull, tension capacity minus expected hookload'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default TorqueDragHelpGuide;
