// Cementing Studio in-app help guide (D4/C3). EPE/WDS help pattern; owner
// copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  ArrowLeft, BookOpen, Zap, Layers, Waves, AlignVerticalSpaceAround,
  ClipboardCheck, BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'volumes', icon: Layers, title: 'Volumes and the program' },
  { id: 'placement', icon: Waves, title: 'Placement, U-tube, ECD' },
  { id: 'centralization', icon: AlignVerticalSpaceAround, title: 'Centralization' },
  { id: 'checklist', icon: ClipboardCheck, title: 'The quality checklist' },
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

const CementingHelpGuideContent = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Cementing Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to Cementing Studio: job volumes, placement simulation, ECD, centralization." />
      </Helmet>
      <div className="p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link to="/dashboard/apps/drilling/cementing-studio">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cementing Studio
              </Button>
            </Link>
            <ThemeToggle />
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-pl-primary p-3 rounded-xl shrink-0">
              <Layers className="w-8 h-8 text-pl-primary-fg" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-pl-text">Cementing Studio Help Guide</h1>
              <p className="text-pl-muted text-lg">Right volumes, safe placement, centralized pipe</p>
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
              <SectionHeading icon={BookOpen}>What is the Studio?</SectionHeading>
              <Para>
                Cementing Studio designs a primary cement job for a casing string on a well
                you planned in Well Design Studio: slurry and displacement volumes, sacks and
                job time, a placement simulation that tracks every fluid interface from the
                pumps to the annulus, ECD at the previous shoe, and API 10D centralization.
                The hole and previous casing come from the shared geometry the other
                drilling studios use.
              </Para>
              <Callout tone="info" title="Scope">
                Version one covers a full casing string cemented from surface. Liner jobs
                with a running string and stage tools are on the roadmap.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore and create a job">Defaults seed a 7 inch string to TD with a standard program.</Step>
              <Step n={2} title="Set the casing and depths">Pick the casing size, set shoe and float collar MDs, target TOC and open-hole excess.</Step>
              <Step n={3} title="Build the pump program">Spacer, lead, tail, displacement with densities and Fann readings. Leave volumes at 0 to auto-fill from the TOC.</Step>
              <Step n={4} title="Compute volumes">Check slurry, sacks, displacement and job time on the summary cards.</Step>
              <Step n={5} title="Simulate placement">Watch pump pressure and ECD against pumped volume; check free fall, the final TOC and the float differential.</Step>
              <Step n={6} title="Centralize and report">Compute standoff, adjust spacing to hold 67 percent, export the job report PDF.</Step>
            </Section>

            <Section id="volumes">
              <SectionHeading icon={Layers}>Volumes and the program</SectionHeading>
              <Para>
                Slurry volume is the annulus from the shoe up to the target TOC plus the shoe
                track between float collar and shoe. Open-hole intervals get your excess
                factor (a washout allowance that also enlarges the effective hole in the
                placement model). The lead/tail split converts a depth boundary into lead and
                tail volumes; displacement is the casing bore down to the float collar, where
                the top plug lands.
              </Para>
            </Section>

            <Section id="placement">
              <SectionHeading icon={Waves}>Placement, U-tube, ECD</SectionHeading>
              <Para>
                The simulation moves the pumped fluids as PLUGS with no intermixing, tracking
                each interface down the casing and up the annulus by volume. At every step it
                balances the heavier annulus column against the lighter inside column:
                surface pump pressure is what the pumps must add on top of friction. When the
                inside column outweighs the annulus the job free-falls: surface pressure
                reads zero and the deficit is shaded on the chart. The transient free-fall
                rate itself is not modeled.
              </Para>
              <Callout tone="warn" title="Watch the ECD">
                ECD at the previous shoe peaks late in the job as heavy slurry rounds the
                shoe. The chart draws your fracture EMW line; losses during cementing are the
                classic failure mode.
              </Callout>
              <Para>
                The end state shows the achieved TOC, the final annulus column and the float
                differential (a positive value means the annulus is heavier and the floats
                must hold once pumps stop).
              </Para>
            </Section>

            <Section id="centralization">
              <SectionHeading icon={AlignVerticalSpaceAround}>Centralization</SectionHeading>
              <Para>
                Standoff follows the API 10D convention: the lateral load on each bow-spring
                centralizer comes from the buoyed casing weight, the spacing and the local
                inclination; the spring deflects per its quoted restoring force at 67 percent
                standoff; between centralizers the casing sags as a fixed-end beam. The
                profile shows the worst of the two per interval, and the Studio solves the
                widest spacing that still holds 67 percent everywhere.
              </Para>
            </Section>

            <Section id="checklist">
              <SectionHeading icon={ClipboardCheck}>The quality checklist</SectionHeading>
              <Para>
                There is no single displacement-efficiency percentage in this Studio, because
                no planning model can honestly compute one. Instead you get the industry
                checklist: density hierarchy between fluids, standoff at or above 67 percent,
                no free fall, floats holding at the end, and adequate annular velocity. Each
                item shows pass or review with the reason.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Table
                headers={['Gate', 'What it proves']}
                rows={[
                  ['Cylinder volumes', 'Slurry, shoe track and displacement match exact geometry, excess included'],
                  ['Vertical fixture', 'Achieved TOC and the U-tube differential match the closed-form density integrals exactly'],
                  ['Equal-density program', 'Zero U-tube pressure at every step'],
                  ['Beam and spring algebra', 'Bow deflection and mid-span sag match hand formulas'],
                  ['Oracle wells', 'Two deviated wells, two programs: volumes, pressure/ECD series, TOC, standoff and required spacing agree with an independent implementation to 0.0001 percent'],
                ]}
              />
              <Para>
                Literature gates for an API RP 10B-2/10D worked example and a published Well
                Cementing textbook example are armed and activate when the documents are
                supplied.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>Why does my pump pressure go to zero mid-job?</SubHeading>
              <Para>
                Free fall: the heavy slurry inside the casing outruns the pumps. It is normal
                on big jobs; keep the hole full and expect returns to speed up. The Studio
                flags the interval and reports the deficit.
              </Para>
              <SubHeading>The achieved TOC misses my target</SubHeading>
              <Para>
                Volumes were edited after computing, or excess changed. Set lead/tail volumes
                back to auto so they refill from the TOC, and re-simulate.
              </Para>
              <SubHeading>Where do temperatures and thickening time come in?</SubHeading>
              <Para>
                They do not, yet. Slurry lab data (thickening time, UCA) belongs to the
                service company lab; this Studio covers volumes, hydraulics and mechanics.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['TOC', 'Top of cement in the annulus'],
                  ['Shoe track', 'Casing bore between float collar and shoe, left full of tail slurry'],
                  ['Lead / tail', 'Lighter filler slurry above, heavier high-strength slurry around the shoe'],
                  ['Excess', 'Extra open-hole volume allowance for washout'],
                  ['U-tube', 'Flow driven by the density imbalance between annulus and casing'],
                  ['Free fall', 'The inside column falls faster than the pumps supply'],
                  ['Standoff', 'Casing-to-wall clearance ratio, 100% = perfectly centered'],
                  ['Float differential', 'Annulus minus inside head at job end; floats must hold it'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 3D: the guide follows the same per-user theme
// as the studio itself, so the look does not flip between the two pages.
const CementingHelpGuide = () => (
  <div className="min-h-screen" data-testid="cmt-help-theme-scope">
    <CementingHelpGuideContent />
  </div>
);

export default CementingHelpGuide;
