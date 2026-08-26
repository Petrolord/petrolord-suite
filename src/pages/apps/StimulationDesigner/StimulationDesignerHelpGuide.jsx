// Stimulation Designer in-app help guide (D9/ST3).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, Ruler, Timer, TrendingUp, FlaskConical,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Designer?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'design', icon: Ruler, title: 'Frac geometry (PKN/KGD)' },
  { id: 'schedule', icon: Timer, title: 'Balance & pump schedule' },
  { id: 'productivity', icon: TrendingUp, title: 'Conductivity & FOI' },
  { id: 'acidizing', icon: FlaskConical, title: 'Matrix acidizing' },
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

const StimulationDesignerHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Stimulation Designer Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Stimulation Designer: PKN/KGD frac geometry, Nolte pump schedule, proppant conductivity, Cinco-Ley productivity, and matrix acidizing." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/stimulation-designer">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stimulation Designer
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <Ruler className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Stimulation Designer Help Guide</h1>
              <p className="text-lime-200 text-lg">Size the frac, schedule the sand, know what it buys you</p>
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
              <SectionHeading icon={BookOpen}>What is the Designer?</SectionHeading>
              <Para>
                The Stimulation Designer sizes hydraulic fracture treatments and matrix acid jobs
                on your planned wellbores: the 2D frac geometry a pump rate buys, the pump time
                and pad against leakoff, the proppant schedule that places the design, what the
                propped fracture does to well productivity, and the acid volumes that remove
                near-wellbore damage. Closure stress comes from the published SHMIN curve
                (Geomechanics Studio) and reservoir pressure from the published PP curve (Pore
                Pressure Studio), both read at the treatment mid-point depth on the definitive
                trajectory.
              </Para>
              <Callout tone="warn" title="Planning level, honestly labeled">
                The frac models are the classical 2D PKN and KGD width equations with a Newtonian
                fluid: the right tool for sizing and screening, not a pseudo-3D simulator. Proppant
                pack permeabilities are nominal published-typical values and the vendor conductivity
                cells govern a real job. The acidizing cards are volumetric planning models with
                the chemistry left to the lab.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore and create a case">
                Choose a site and wellbore with a definitive design. The closure and reservoir
                pressure cards fill from the published curves; missing curves are named, never
                guessed.
              </Step>
              <Step n={2} title="Set the geometry target">
                Enter rock (E, nu), fluid viscosity, pump rate, fracture height and the target
                half-length; toggle PKN or KGD and read width, net pressure and bottomhole
                treating pressure.
              </Step>
              <Step n={3} title="Design the schedule">
                Set the leakoff coefficient and end-of-job concentration. The Nolte balance gives
                pump time and efficiency; the pad fraction and ramp follow, with the proppant
                mass in closed form.
              </Step>
              <Step n={4} title="Read what it buys">
                Pick a proppant; the pack permeability at closure gives dimensionless conductivity
                against the 1.6 optimum, the Cinco-Ley pseudo-skin, and folds of increase.
              </Step>
              <Step n={5} title="Check the acid option and save a run">
                The Acidizing tab prices damage removal against the frac: sometimes a skin of
                zero is all the well needed. Save a run for the immutable history.
              </Step>
            </Section>

            <Section id="design">
              <SectionHeading icon={Ruler}>Frac geometry (PKN/KGD)</SectionHeading>
              <Para>
                Both models are the classical Newtonian no-leakoff width equations on the plane
                strain modulus E' = E/(1 - nu squared). PKN grows width with the fourth root of
                rate, viscosity and length against E', with an elliptical vertical section and
                net pressure from the height compliance; it fits long confined fractures. KGD
                keeps a constant-height slit with compliance on the half-length and fits short
                fractures with free height. The chart draws the width profile along the wing; the
                bottomhole treating pressure card adds net pressure to closure and deliberately
                excludes hydrostatic and friction, which belong to the pumping hydraulics.
              </Para>
            </Section>

            <Section id="schedule">
              <SectionHeading icon={Timer}>Balance &amp; pump schedule</SectionHeading>
              <Para>
                The material balance is Nolte's: injected volume equals fracture volume plus
                Carter leakoff through both faces, with the opening-time factor interpolating
                between the low- and high-efficiency limits. The pad fraction and the proppant
                ramp exponent are both (1 - eta)/(1 + eta), so an efficient job pumps a small pad
                and ramps hard, and a leaky one spends most of the job protecting the tip. The
                stepped table is what the blender operator gets; the proppant mass is the exact
                integral of the ramp, and the golden design places about 29 tonnes.
              </Para>
            </Section>

            <Section id="productivity">
              <SectionHeading icon={TrendingUp}>Conductivity &amp; FOI</SectionHeading>
              <Para>
                Dimensionless conductivity C_fD compares the propped path with the formation's
                ability to feed it. The unified design optimum is C_fD near 1.6: below it your
                proppant is spread too thin along too much length, above it added length pays
                more than added width. The Cinco-Ley and Samaniego correlation turns C_fD into a
                pseudo-skin and an effective wellbore radius, and the folds-of-increase card uses
                the same steady-state radial identity as the Perforation designer, so the two
                apps' numbers are directly comparable.
              </Para>
            </Section>

            <Section id="acidizing">
              <SectionHeading icon={FlaskConical}>Matrix acidizing</SectionHeading>
              <Para>
                The sandstone card is Hawkins' formula run in reverse: the damage skin from k/ks
                and the damaged radius, the planning acid volume as pore volumes of the treated
                annulus, and the skin left when the front stops short of the damage. The
                carbonate card converts pumped volume to a wormholed radius through a
                lab-calibrated pore-volumes-to-breakthrough number and reports the resulting
                negative skin. The matrix ceiling card is the steady-state Darcy rate that keeps
                the flowing pressure below closure: pump faster and you are fracturing.
              </Para>
              <Callout tone="warn" title="The lab owns the chemistry">
                Acid systems, preflushes, additive packages and PV_bt come from core testing.
                These cards size volumes and skins around those lab numbers; they do not replace
                them.
              </Callout>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                Every number is recomputed by an independent Python oracle before it ships: the
                PKN width against hand arithmetic, the material balance solved by bisection
                against the app's fixed point, the schedule mass against the exact integral, the
                Cinco-Ley correlation against its hand value of 1.384 at the 1.6 optimum and the
                ln 2 infinite-conductivity limit, and every acidizing closed form. Runner gates
                A28 and A29 hold the app to the oracle goldens, and the Playwright suite asserts
                the oracle's numbers off the rendered UI.
              </Para>
              <Table
                headers={['Check', 'Anchor']}
                rows={[
                  ['PKN/KGD widths', 'PPS formula set, hand-computed 6.39 mm case'],
                  ['Material balance', 'Nolte KL approximation; residual vanishes at the solution'],
                  ['Schedule', 'pad = ramp exponent = (1-eta)/(1+eta); exact mass integral'],
                  ['Productivity', 'Cinco-Ley f(1.6) = 1.384; infinite-conductivity ln 2 limit'],
                  ['Acidizing', 'Hawkins closed form; Darcy matrix ceiling'],
                ]}
              />
              <Para>
                Worked-example gates arm on the owner's literature (L17) and the proppant catalog
                on vendor conductivity data (L18).
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls &amp; FAQ</SectionHeading>
              <SubHeading>PKN and KGD disagree. Which is right?</SubHeading>
              <Para>
                Neither is a simulator; they bracket the answer. PKN when the fracture is long
                compared to its height and confined; KGD when it is short and height-free. If the
                decision hangs on the difference, it is a pseudo-3D question and out of this
                tool's honest range.
              </Para>
              <SubHeading>My efficiency is tiny and the pad huge</SubHeading>
              <Para>
                That is what a high Carter coefficient does. Check the leakoff number against a
                calibration injection; designing on an uncalibrated CL is the classic way to
                screen out early or pump a pad you did not need.
              </Para>
              <SubHeading>Why will the productivity card not light up?</SubHeading>
              <Para>
                It needs closure stress to price the pack permeability. Publish SHMIN from
                Geomechanics Studio for the wellbore's geo well, or set a manual override.
              </Para>
              <SubHeading>Frac or acid?</SubHeading>
              <Para>
                If the damage skin dominates and the formation flows fine underneath, the acid
                cards give the cheaper answer. The frac pays when the reservoir itself is the
                restriction. Run both tabs on the same case and compare the skins.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ["E'", 'plane strain modulus, E/(1 - nu squared)'],
                  ['xf', 'fracture half-length, wellbore to tip of one wing'],
                  ['Net pressure', 'fluid pressure in the fracture above closure stress'],
                  ['Closure stress', 'minimum horizontal stress; the published SHMIN curve'],
                  ['CL', 'Carter leakoff coefficient, m per square root second'],
                  ['Efficiency (eta)', 'fracture volume over injected volume at shut-in'],
                  ['Pad', 'proppant-free fluid pumped ahead of the ramp'],
                  ['EOJ concentration', 'proppant concentration of the final stage'],
                  ['C_fD', 'dimensionless fracture conductivity, kf w / (k xf)'],
                  ['FOI', 'folds of increase over the unstimulated radial well'],
                  ['PV_bt', 'pore volumes to breakthrough from carbonate core tests'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default StimulationDesignerHelpGuide;
