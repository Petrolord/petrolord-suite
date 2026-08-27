// Perforation & Sand Control in-app help guide (D8/PS2).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, Crosshair, Target, Filter, Waves,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Designer?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'interval', icon: Crosshair, title: 'Interval & sieve data' },
  { id: 'perforating', icon: Target, title: 'Guns, skin & underbalance' },
  { id: 'sandcontrol', icon: Filter, title: 'Gravel, screens & advisor' },
  { id: 'sanding', icon: Waves, title: 'Sanding onset (CDP)' },
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

const PerforationSandControlHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Perforation & Sand Control Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Perforation & Sand Control Designer: guns and skin, underbalance, sieve statistics, gravel and screens, and sanding onset." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/perforation-sand-control">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Perforation &amp; Sand Control
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <Target className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Perforation &amp; Sand Control Help Guide</h1>
              <p className="text-lime-200 text-lg">Shoot it clean, keep the sand out, know your drawdown room</p>
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
                The Perforation &amp; Sand Control Designer sizes the sandface completion on your
                planned wellbores: which gun to run and what it does to productivity, how much
                underbalance to shoot with, whether the formation needs sand control at all, what
                gravel and screen to use if it does, and how much drawdown the rock takes before it
                starts producing sand. It reads the same wp data spine as the rest of the Drilling
                module: the definitive trajectory from Well Design Studio, the casing program from
                Casing &amp; Tubing Design Studio, the completion string from Completion Design
                Studio, and the published stress and strength curves from Geomechanics Studio and
                Pore Pressure Studio.
              </Para>
              <Callout tone="warn" title="Planning level, honestly labeled">
                Gun rows are nominal planning data from API-style concrete target tables. Real
                charge performance in rock differs, and the vendor data sheet governs the actual
                gun and charge selection. The same goes for gravel: the catalog carries nominal
                mesh ranges, and the vendor sieve certificate governs the delivered sand.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore and create a case">
                Choose a site and wellbore with a definitive design. The designer loads the
                trajectory plus any published curves and linked casing or completion cases.
              </Step>
              <Step n={2} title="Set the interval and paste the sieve">
                On Interval &amp; Sand, set the perforated interval in MD and paste the laboratory
                sieve rows as size in microns against cumulative percent retained. The D-values,
                uniformity and fines update live.
              </Step>
              <Step n={3} title="Pick a gun and check it runs">
                On Perforating, pick a gun. Through-tubing guns are checked against the linked
                completion bore; casing guns against the casing drift. The Karakas-Tariq skin,
                productivity ratio and underbalance band update with every edit.
              </Step>
              <Step n={4} title="Read the sand control indication">
                Sand Control walks the screening thresholds, sizes gravel by the Saucier rule and
                recommends a screen gauge below the smallest gravel grain.
              </Step>
              <Step n={5} title="Check the drawdown room and save a run">
                Sanding maps the critical flowing pressure over the interval from the published
                curves. Save a run to keep an immutable snapshot of inputs and results.
              </Step>
            </Section>

            <Section id="interval">
              <SectionHeading icon={Crosshair}>Interval &amp; sieve data</SectionHeading>
              <Para>
                The sieve table uses the sand control convention: cumulative weight percent
                RETAINED against grain size, so D10 is a coarse size and D90 a fine one. D-values
                interpolate log-linearly between your measured points and are never extrapolated
                beyond them: a percentile the curve does not reach reads as missing rather than
                invented. Uniformity is C_u = D40/D90, and fines are the fraction finer than 44
                microns (325 mesh).
              </Para>
              <Callout tone="info" title="At least 4 points">
                The statistics need at least four sieve points, monotone in both size and percent.
                Pasting the laboratory CSV is the intended path; a header line is tolerated.
              </Callout>
            </Section>

            <Section id="perforating">
              <SectionHeading icon={Target}>Guns, skin &amp; underbalance</SectionHeading>
              <SubHeading>Karakas-Tariq skin</SubHeading>
              <Para>
                Perforation skin follows Karakas and Tariq (SPE 18247) with the published phasing
                constant tables: a plane-flow term from the effective wellbore radius, a vertical
                converging-flow term from shot density and anisotropy, a wellbore blockage term,
                and a crushed-zone term when you enable it. A deep-penetrating high-shot-density
                gun can produce a negative total skin, meaning the perforated completion beats the
                ideal openhole; the seeded golden case shows a 12 spf 45 degree gun doing exactly
                that. The tunnel length is taken as the API-target penetration and the tunnel
                radius as half the entrance hole; both are nominal planning inputs.
              </Para>
              <SubHeading>Clearance</SubHeading>
              <Para>
                A through-tubing gun must pass the completion's tightest bore, and the card names
                the controlling component, an XN nipple more often than not. A casing gun runs
                before the completion, so it is checked against the smallest casing drift on its
                way to the interval bottom, with the controlling string named. In the golden 9-5/8
                inch program with the 7 inch liner, the 2-1/8 inch through-tubing gun passes while
                the 2-7/8 inch gun fails the nipple bore.
              </Para>
              <SubHeading>Underbalance</SubHeading>
              <Para>
                The underbalance card gives a planning BAND by permeability class and fluid, from
                the published field guidance family. It is deliberately a range, not a point: the
                exact published correlations activate when the owner supplies the papers, and the
                sanding tab caps how much underbalance the rock takes.
              </Para>
            </Section>

            <Section id="sandcontrol">
              <SectionHeading icon={Filter}>Gravel, screens &amp; advisor</SectionHeading>
              <Para>
                The advisor walks screening thresholds on uniformity and fines in order, from
                standalone wire-wrap screens for clean uniform sands to gravel packs and a
                frac-pack evaluation flag for the dirtiest cases. The thresholds are printed on
                the card so you can argue with them.
              </Para>
              <Para>
                Gravel sizing is the Saucier rule: gravel D50 between 5 and 6 times the formation
                D50. The card matches the band against the standard dual-mesh catalog; the golden
                sieve (formation D50 near 113 microns) lands on 20/40 gravel, and the gravel-pack
                screen gauge drops below the smallest gravel grain, 16 thou for 20/40. Standalone
                screens get a Coberly-type slot window on D10.
              </Para>
            </Section>

            <Section id="sanding">
              <SectionHeading icon={Waves}>Sanding onset (CDP)</SectionHeading>
              <Para>
                The sanding screen evaluates the Kirsch hoop stress at the cavity wall against an
                effective strength, with the near-wall pore pressure at the flowing pressure. The
                critical flowing pressure at each depth is pwf,crit = (3 S1 - S2 - U) / 2, and the
                drawdown margin is the reservoir pressure minus that. The stress pair follows the
                cavity geometry: a perforation tunnel at its worst-case azimuth uses the larger of
                overburden and SHmax, an openhole or standalone screen uses the horizontal pair.
              </Para>
              <Callout tone="warn" title="A screen, not a sand-rate model">
                This is screening grade by construction. The strength boost factor defaults to 1
                and is the knob a thick-walled-cylinder calibration adjusts; transient effects,
                water breakthrough and depletion trajectories are out of scope. A negative margin
                means sanding is indicated at any drawdown: plan sand control, not avoidance.
              </Callout>
              <Para>
                The curves come from the published gm-1.0.0 SHMIN/SHMAX/UCS logs and the pp-1.0.0
                PP/OBG logs on the wellbore's geo well. If a curve is missing the card says which
                studio to publish it from; nothing is silently assumed.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                Every number in the designer is recomputed by an independent Python oracle before
                it ships: the Karakas-Tariq constant tables against hand arithmetic, sieve
                statistics against a synthetic distribution with exact closed-form percentiles,
                the Saucier band and screen gauge against published spot cases, and the sanding
                sweep against the Kirsch closed form. The runner gates A26 and A27 hold the app to
                the oracle goldens on every validation pass, and the Playwright suite asserts the
                oracle's numbers off the rendered UI.
              </Para>
              <Table
                headers={['Check', 'Anchor']}
                rows={[
                  ['Skin tables', 'SPE 18247 phasing constants, hand-computed 90 degree case'],
                  ['Sieve statistics', 'log-linear synthetic PSD with exact D-values'],
                  ['Gravel sizing', 'Saucier 5-6 x D50; 20/40 spot case'],
                  ['Screen gauge', 'opening below the smallest gravel grain'],
                  ['Sanding onset', 'Kirsch closed form pwf,crit = (3 S1 - S2 - U) / 2'],
                ]}
              />
              <Para>
                Vendor catalog dimensions arm a literature gate (L15) and the sand control and
                underbalance criteria another (L16); both activate when the owner supplies the
                published references.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls &amp; FAQ</SectionHeading>
              <SubHeading>My skin looks too good</SubHeading>
              <Para>
                Check the crushed zone. Fresh perforating in overbalance without cleanup leaves a
                damaged annulus around every tunnel; enabling the crushed zone with k/kc of 5 to
                10 is the realistic planning stance.
              </Para>
              <SubHeading>The advisor and my experience disagree</SubHeading>
              <Para>
                The thresholds are screening rules on two numbers. Fines mineralogy, produced
                water and rate history all move real decisions; the card prints its thresholds
                precisely so you can overrule them with reasons.
              </Para>
              <SubHeading>Why does the sanding card say missing curves?</SubHeading>
              <Para>
                The screen needs five published curves: SHMIN, SHMAX and UCS from Geomechanics
                Studio and PP and OBG from Pore Pressure Studio, all on the wellbore's geo well.
                Publish them there and reselect the wellbore.
              </Para>
              <SubHeading>Where are rates and nodal matching?</SubHeading>
              <Para>
                In the Nodal Analysis Studio in Production. This designer reports the
                productivity RATIO of the perforated completion against the openhole ideal, which
                is the perforating decision; operating points belong to the nodal system model.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['spf', 'shots per foot, the perforating shot density'],
                  ['Phasing', 'angular spacing between successive shots around the wellbore'],
                  ['Entrance hole', 'hole diameter in the casing wall, API target value'],
                  ['Penetration', 'tunnel length beyond the casing in the API concrete target'],
                  ['C_u', 'uniformity coefficient, D40/D90 on the retained curve'],
                  ['Fines', 'weight fraction finer than 44 microns (325 mesh)'],
                  ['Saucier rule', 'gravel D50 equal to 5 to 6 times the formation D50'],
                  ['Gauge', 'wire-wrap screen slot width, quoted in thousandths of an inch'],
                  ['CDP', 'critical drawdown pressure, the drawdown margin before sanding onset'],
                  ['TWC', 'thick-walled cylinder strength test used to calibrate the boost factor'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default PerforationSandControlHelpGuide;
