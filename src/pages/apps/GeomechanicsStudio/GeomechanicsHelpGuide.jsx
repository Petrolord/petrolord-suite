// Geomechanics & Wellbore Stability Studio in-app help guide (D5/G3).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, Database, Layers, Mountain, LineChart,
  UploadCloud, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'inputs', icon: Database, title: 'Logs and pore pressure' },
  { id: 'mem', icon: Layers, title: 'Building the 1D MEM' },
  { id: 'stability', icon: Mountain, title: 'Wellbore stability' },
  { id: 'window', icon: LineChart, title: 'The mud weight window' },
  { id: 'publish', icon: UploadCloud, title: 'Publishing gm-1.0.0' },
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

const GeomechanicsHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Geomechanics Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Geomechanics & Wellbore Stability Studio: 1D MEM, stability, mud windows." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/geomechanics-studio">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Geomechanics Studio
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <Mountain className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Geomechanics & Wellbore Stability Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Model the stresses, hold the wall, pick the mud</p>
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
                The Geomechanics Studio builds a one-dimensional mechanical earth model from
                registry well logs and the published pore-pressure prognosis, then turns it
                into the number drillers actually need: the mud weight window along your
                planned trajectory, with collapse (breakout) and fracture-initiation limits
                that honor the well's inclination and azimuth through a full stress-tensor
                rotation. It replaces both the legacy Mechanical Earth Model app and the old
                Wellbore Stability Analyzer, whose physics ignored inclination entirely.
              </Para>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore and create a case">The bridged registry well is preselected when the wellbore is linked.</Step>
              <Step n={2} title="Load curves">The Studio maps DEPT/DT/RHOB by mnemonic aliases and finds published pp-1.0.0 PP/OBG curves.</Step>
              <Step n={3} title="Choose the pore pressure source">Published curves when they exist; otherwise compute Eaton over DT or fall back to hydrostatic.</Step>
              <Step n={4} title="Set the parameters">Poisson, Biot, friction angle, tectonic strains, SHmax azimuth, regime and the UCS correlation. Lithology seeds fill sensible defaults.</Step>
              <Step n={5} title="Build the MEM and check quality">Stress and UCS tracks plus the quality score and warnings.</Step>
              <Step n={6} title="Compute the mud window and publish">The window runs along the definitive design; publish SHMIN/SHMAX/UCS back to the registry.</Step>
            </Section>

            <Section id="inputs">
              <SectionHeading icon={Database}>Logs and pore pressure</SectionHeading>
              <Para>
                Curves come from the shared wells registry (the same store Pore Pressure
                Studio and the geoscience apps use). Sonic and density are matched through
                the standard mnemonic aliases; published pore pressure and overburden are
                recognized by their pp-1.0.0 provenance and are the preferred source, since
                they were built with fitted compaction trends rather than assumptions.
              </Para>
              <Callout tone="info" title="Order of preference">
                Published pp-1.0.0 curves, then an in-app Eaton computation over DT, then a
                plain hydrostatic assumption. The source used is always shown on the results
                card and stored with the run.
              </Callout>
            </Section>

            <Section id="mem">
              <SectionHeading icon={Layers}>Building the 1D MEM</SectionHeading>
              <Para>
                Horizontal stresses come from the uniaxial poroelastic relation with optional
                tectonic strain terms, and are then clamped to the Andersonian frictional
                limits set by the friction angle: the limits are treated as bounds on what
                the crust can sustain, not as estimates. Clamped samples are counted and
                reported. UCS comes from published sonic correlations (Horsrud for shale,
                McNally for sandstone) or a constant.
              </Para>
              <Callout tone="warn" title="Correlations are lithology-specific">
                Horsrud was fitted on North Sea shale, McNally on coal-measure sandstone.
                They are screening tools; calibrate to core tests when you have them.
              </Callout>
            </Section>

            <Section id="stability">
              <SectionHeading icon={Mountain}>Wellbore stability</SectionHeading>
              <Para>
                At each depth the far-field stress tensor is rotated into the borehole frame
                for the local inclination and azimuth, and the Kirsch equations give the
                stresses around the wall. The collapse limit is the lowest mud pressure that
                keeps every point on the wall inside the Mohr-Coulomb envelope; the fracture
                initiation limit is the highest mud pressure before the wall goes into
                effective tension.
              </Para>
              <Callout tone="warn" title="Zero-breakout-width criterion">
                Collapse is declared at the FIRST point of shear failure anywhere on the
                wall. Operationally small breakouts are often tolerable, so this bound is
                conservative. A breakout-width-tolerant criterion is on the roadmap.
              </Callout>
            </Section>

            <Section id="window">
              <SectionHeading icon={LineChart}>The mud weight window</SectionHeading>
              <Para>
                The window chart walks the definitive trajectory: pore pressure, collapse and
                fracture-initiation limits as equivalent mud weights against measured depth.
                The safe band is shaded; the tightest spot and any full closure are called
                out. Because the stability math honors inclination, the window narrows
                through build sections and laterals exactly where real wells get in trouble.
              </Para>
            </Section>

            <Section id="publish">
              <SectionHeading icon={UploadCloud}>Publishing gm-1.0.0</SectionHeading>
              <Para>
                Publish writes SHMIN, SHMAX and UCS as MPa curves to the registry well with
                full provenance, replacing only this case's own previously published curves.
                Imported logs and other apps' curves are never touched. Published Shmin is
                the input the Stimulation Designer needs for fracture design later.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Table
                headers={['Gate', 'What it proves']}
                rows={[
                  ['Vertical closed forms', 'Collapse and fracture initiation match the exact Kirsch algebra'],
                  ['Rotation checks', 'Orthonormal frames; a well drilled along SHmax sees the expected principal stresses'],
                  ['Poroelastic and UCS algebra', 'Formulas reproduce their published forms exactly'],
                  ['Azimuth symmetry', 'Isotropic horizontal stress gives an azimuth-independent window'],
                  ['Oracle wells', 'Two deviated trajectories over a synthetic profile agree with an independent implementation to 0.0001 percent'],
                ]}
              />
              <Para>
                A literature gate against a published Reservoir Geomechanics worked example
                is armed and activates when the source document is supplied.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>My collapse limit looks high</SubHeading>
              <Para>
                Check the UCS correlation against the actual lithology and the friction
                angle. The zero-breakout-width criterion is conservative by design; weak
                shale plus a horizontal well should genuinely demand heavy mud.
              </Para>
              <SubHeading>What does the frictional clamp warning mean?</SubHeading>
              <Para>
                Your strain or Poisson inputs implied horizontal stresses the crust cannot
                sustain at the given friction angle, so they were pulled back to the
                faulting limits. Revisit the strains or the regime.
              </Para>
              <SubHeading>Is this a 3D model?</SubHeading>
              <Para>
                No. It is a 1D MEM evaluated along a 3D trajectory: one stress profile in
                depth, applied at every point of the well. Lateral stress variation and
                salt or fault effects need a numerical 3D model.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['MEM', 'Mechanical earth model: stress, pressure and strength vs depth'],
                  ['Sv / SHmax / Shmin', 'Vertical and horizontal principal stresses'],
                  ['UCS', 'Unconfined compressive strength of the rock'],
                  ['Breakout', 'Shear failure of the wall on opposite sides of the hole'],
                  ['Fracture initiation', 'Mud pressure that puts the wall into tension'],
                  ['EMW', 'Any pressure expressed as an equivalent mud weight at depth'],
                  ['Biot alpha', 'Effective stress coefficient scaling the pore pressure'],
                  ['Kick-off from the window', 'A closed window means the trajectory cannot be drilled with a single mud weight'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default GeomechanicsHelpGuide;
