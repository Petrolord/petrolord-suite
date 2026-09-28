// Casing & Tubing Design Studio in-app help guide (D6/U2).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { AppHeader } from '@/components/ui/app-shell';
import {
  ArrowLeft, BookOpen, Zap, Database, Layers, Briefcase, Activity, Ruler,
  BadgeCheck, AlertTriangle, BookMarked, Cylinder,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'spine', icon: Database, title: 'Wellbore, trajectory, PPFG' },
  { id: 'catalog', icon: Cylinder, title: 'Catalog and ratings' },
  { id: 'loadcases', icon: Briefcase, title: 'Load cases' },
  { id: 'casing', icon: Layers, title: 'Casing results' },
  { id: 'tubing', icon: Ruler, title: 'Tubing and packer forces' },
  { id: 'validation', icon: BadgeCheck, title: 'Validation basis' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls & FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

const SectionHeading = ({ icon: Icon, children }) => (
  <h2 className="flex items-center gap-3 text-2xl sm:text-3xl font-bold text-pl-text mb-4 mt-0 pt-2">
    <Icon className="w-7 h-7 text-pl-muted" /> {children}
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
    info: 'bg-pl-info-bg border-pl-info/40 text-pl-info-text',
    warn: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
    danger: 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text',
    success: 'bg-pl-success-bg border-pl-success/40 text-pl-success-text',
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
        <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-pl-muted font-semibold border-b border-pl-border">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-pl-sunken' : ''}>
            {r.map((c, j) => <td key={j} className="px-3 py-2 text-pl-text border-b border-pl-border align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
const Section = ({ id, children }) => (
  <section id={`section-${id}`} className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 mb-6 scroll-mt-20">
    {children}
  </section>
);

const CasingTubingHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div data-testid="ct-help-theme-scope" className="min-h-screen">
      <Helmet>
        <title>Casing & Tubing Design Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Casing & Tubing Design Studio: API 5C3 ratings, load cases, tubing-packer forces." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/apps/drilling/casing-tubing-design-pro"
        backLabel="Back to Casing & Tubing Design Studio"
        icon={Layers}
        eyebrow="Drilling & Completions"
        title="Casing & Tubing Design Studio Help Guide"
        subtitle="Rate the pipe, load the well, hold the seal"
      />
      <div className="px-4 py-6 sm:px-8">
        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3">
            <div className="lg:sticky lg:top-20 bg-pl-surface border border-pl-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-pl-muted mb-2 px-2">Contents</div>
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
                The Casing & Tubing Design Studio sizes and verifies the tubulars in your
                well: burst, collapse, tension and triaxial checks for every casing string
                under canonical load cases, and the Lubinski force system for the tubing
                landed in a packer. Ratings come from the published API formulas, computed
                live from real API 5CT dimensional data, and every load case is evaluated
                over the full depth profile so the governing point is found wherever it is,
                not just at the shoe.
              </Para>
              <Para>
                The app runs on the shared well-planning spine: the trajectory is the
                definitive design saved in Well Design Studio, and pore and fracture
                gradients can sync from the curves Pore Pressure Studio publishes. Design
                cases save to the wellbore and reload with full fidelity.
              </Para>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick site, wellbore and case">
                Use the left panel. The wellbore needs a saved trajectory: its definitive
                design, else the actual survey composite, the latest draft design or the
                linked registry survey, and the panel says which is in use. Create and save
                a design in Well Design Studio if the panel says there is none.
                Create a new design case and it seeds sensible defaults.
              </Step>
              <Step n={2} title="Set the environment">
                On the Well & Loads tab enter mud, cement and packer fluid densities, the
                surface temperature and gradient, and the pore/frac EMWs at the shoe.
                If published pp-1.0.0 curves exist for this wellbore, press Sync.
              </Step>
              <Step n={3} title="Check the load cases">
                The seeded canonical cases cover gas kick, pressure test, full evacuation,
                cementing and running for casing, plus production, injection and
                stimulation for tubing. Adjust the type-specific parameters.
              </Step>
              <Step n={4} title="Build the strings">
                On the Casing Design tab add strings and sections; pick every tubular from
                the catalog so wall, ID and weight are the real API 5CT values. Set the
                tubing string and the packer on the Tubing Design tab.
              </Step>
              <Step n={5} title="Read the results and save">
                Worst-point safety factors, governing depths and the controlling load case
                update live. Save the design to keep the case and a run snapshot.
              </Step>
            </Section>

            <Section id="spine">
              <SectionHeading icon={Database}>Wellbore, trajectory, PPFG</SectionHeading>
              <Para>
                Section depths are measured depth along the wellbore. The engine converts
                them to true vertical depth through the exact minimum-curvature relation on
                the definitive stations before any pressure is computed, so a deviated well
                loads correctly.
              </Para>
              <Para>
                The gas-kick burst case anchors its shoe control pressure to the fracture
                EMW at the shoe (gas to surface from an influx that opened the formation),
                or to an explicit reservoir pressure override on the load case. The frac
                EMW comes from the published Pore Pressure Studio curves when the wellbore
                is bridged to a registry well, or from your manual entry.
              </Para>
              <Callout tone="info" title="Published badge">
                When the PPFG source shows the published badge, the numbers came from
                pp-1.0.0 curves. Editing either field switches the source to manual so the
                provenance is never ambiguous.
              </Callout>
            </Section>

            <Section id="catalog">
              <SectionHeading icon={Cylinder}>Catalog and ratings</SectionHeading>
              <Para>
                The catalog stores only real API 5CT dimensional rows: outside diameter,
                nominal weight, wall and drift-free ID per weight. Ratings are never stored
                or hand-typed; they are computed at load by the validated engine:
              </Para>
              <Table
                headers={['Rating', 'Formula', 'Source']}
                rows={[
                  ['Burst', 'P = 0.875 x 2 Yp t / D', 'API internal yield (Barlow) with the 12.5% wall tolerance'],
                  ['Collapse', 'Four regimes in D/t', 'API Bulletin 5C3: yield, plastic, transition, elastic with the published A, B, C, F, G polynomials'],
                  ['Collapse under tension', 'Ypa derate', 'Axial-adjusted yield Ypa feeding the same 5C3 formulas'],
                  ['Body yield', 'Yp x steel area', 'Pipe body; joint strength applies the connection efficiency'],
                  ['Triaxial', 'Lame + von Mises', 'Worst point of inner and outer wall, axial and bending included'],
                ]}
              />
              <Callout tone="warn" title="Connection efficiencies are nominal">
                The catalog carries customary planning-level joint efficiencies (BTC 1.00,
                LTC 0.85, STC 0.75 and so on). Real connection ratings are
                manufacturer-specific: verify the final string against the vendor data
                sheet before ordering pipe.
              </Callout>
            </Section>

            <Section id="loadcases">
              <SectionHeading icon={Briefcase}>Load cases</SectionHeading>
              <Para>
                Every case is a canonical scenario with type-specific parameters that feed
                the engine profile generator directly. Nothing on the card is decorative.
              </Para>
              <Table
                headers={['Case', 'Internal', 'External', 'Checks']}
                rows={[
                  ['Gas kick', 'Gas column from the shoe control pressure', 'Water backup', 'Burst, worst point often at surface'],
                  ['Pressure test', 'Test pressure on mud', 'Water backup', 'Burst near surface'],
                  ['Full evacuation', 'Empty', 'Mud', 'Collapse at the shoe'],
                  ['Partial evacuation', 'Gas over fluid level', 'Mud', 'Collapse at the fluid level'],
                  ['Cementing', 'Displacement water', 'Wet cement', 'Collapse during the job'],
                  ['Running', 'Mud both sides', 'Mud', 'Axial with overpull, collapse derate from tension'],
                  ['Custom gradients', 'Your fluid + surface pressure', 'Your fluid', 'Free-form check'],
                ]}
              />
              <Para>
                Tubing cases (production, injection, stimulation, shut-in) work at the
                packer datum: the landed condition is packer fluid balanced inside and
                out, and each case rebuilds the internal column to get the pressure
                changes the Lubinski equations need.
              </Para>
            </Section>

            <Section id="casing">
              <SectionHeading icon={Layers}>Casing results</SectionHeading>
              <Para>
                For each section and load case the engine scans the whole profile inside
                the section and reports the worst safety factor with the depth where it
                happens. Collapse applies the axial derate at each depth, and the triaxial
                check evaluates the von Mises stress at both walls with the optional
                bending term from the design dogleg severity.
              </Para>
              <Para>
                Status bands: FAIL when any factor is under its design factor, WARNING
                inside 10 percent of the limit, PASS otherwise. The right panel shows the
                governing minimum across every string and case, with the controlling load
                named.
              </Para>
            </Section>

            <Section id="tubing">
              <SectionHeading icon={Ruler}>Tubing and packer forces</SectionHeading>
              <Para>
                The tubing analysis is the classic Lubinski planning set: piston force from
                the seal bore and tubing areas, ballooning from the pressure changes,
                thermal force from the mean temperature change of the linear profile, and
                buckling onset from the Dawson-Paslay and helical limits with the real
                radial clearance inside the production casing. Length changes sum against
                the PBR stroke.
              </Para>
              <Para>
                Status semantics: exceeding the packer rating or the seal stroke FAILs the
                case. Buckling onset (sinusoidal or helical) raises a WARNING for the
                completion engineer; helical buckling is often tolerable when stresses stay
                elastic, and this version does not run the permanent-corkscrew check.
              </Para>
              <Callout tone="info" title="Flow lives in Nodal Analysis Studio">
                The one flow check kept here is the API RP 14E erosional velocity. Tubing
                flow capacity, IPR/VLP matching and pressure traverses belong to Nodal
                Analysis Studio, linked from the Erosional view.
              </Callout>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                The engine lives in the central Petrolord engines repository and is gated
                by an independent numpy oracle: the 5C3 coefficient polynomials are
                self-asserted for regime-boundary continuity on every grade, ratings for
                the full catalog match the oracle to six decimal places of relative
                tolerance, and the load-case profiles and Lubinski forces reproduce golden
                fixtures on a deviated trajectory. Spot values agree with the published
                API tables, for example 9-5/8 47 lb/ft L-80 at 6,870 psi burst and about
                4,760 psi collapse in the plastic regime.
              </Para>
              <Para>
                An ARMED literature gate is reserved for a published ratings-table
                cross-check once the reference document is supplied.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls & FAQ</SectionHeading>
              <SubHeading>I left the page and my casing design was gone</SubHeading>
              <p className="text-pl-text leading-relaxed">
                Not any more. While a design case has unsaved edits, the Studio mirrors them to
                this browser and restores them the next time the case opens, with an amber note
                under the Save button and a Discard link. A reload or a closed tab also asks
                before leaving. Saving still writes the case to the database, which is what other
                devices and teammates see; the mirror is only a safety net.
              </p>
              <SubHeading>Reading the schematic</SubHeading>
              <p className="text-pl-text leading-relaxed">
                The schematic (Casing Design, Tubing Design and the Visualizer tab) draws on white
                with the Petrolord mark, diameters to scale across and measured depth down a
                round-stepped axis in the wellbore&apos;s unit. Every casing string ends in a shoe
                symbol labelled with its shoe depth; the tubing and the packer are labelled the
                same way. The Vertical control at the top right stretches or squeezes the depth
                scale (0.5 to 8 times) without touching the diameters, so a deep well with thin
                strings can be read section by section; the schematic scrolls when stretched, and
                Fit returns to one to one. The setting is remembered per schematic.
              </p>
              <SubHeading>Why does my shallow section govern burst?</SubHeading>
              <Para>
                Gas-filled casing puts the biggest differential at surface because the gas
                column loses much less pressure than the backup water column. The profile
                scan catches this; a shoe-only check would not.
              </Para>
              <SubHeading>Why did collapse drop when I added overpull?</SubHeading>
              <Para>
                Tension derates collapse through the axial-adjusted yield. The running
                case carries the buoyed string weight plus your overpull, so deep sections
                see less collapse capacity while being pulled.
              </Para>
              <SubHeading>What is out of scope in this version?</SubHeading>
              <Para>
                Annular pressure buildup, sour-service and temperature derating, wear-derated
                ratings, connection-specific ratings beyond the nominal efficiencies, and
                buckling post-lockup analysis. Only the first tubing string is analyzed;
                extra tubing strings are schematic.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['EMW', 'Equivalent mud weight: pressure divided by (g x TVD)'],
                  ['D/t', 'Outside diameter over wall thickness, the collapse regime variable'],
                  ['Ypa', 'Axial-adjusted yield used for collapse under tension'],
                  ['VME', 'Von Mises equivalent stress for the triaxial check'],
                  ['PBR', 'Polished bore receptacle: the seal stroke allowance at the packer'],
                  ['Piston force', 'Pressure change acting on the seal-bore and tubing area differences'],
                  ['Ballooning', 'Radial pressure change swelling or contracting the tubing'],
                  ['pp-1.0.0', 'The published pore-pressure curve contract from Pore Pressure Studio'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default CasingTubingHelpGuide;
