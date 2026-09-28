// Completion Design Studio in-app help guide (D7/CD3).
// EPE/WDS help pattern; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  ArrowLeft, BookOpen, Zap, Wrench, Layers, PenTool, Ruler, Gauge,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'string', icon: Wrench, title: 'Building the string' },
  { id: 'program', icon: Layers, title: 'Casing program & clearance' },
  { id: 'schematic', icon: PenTool, title: 'Schematic & BOM' },
  { id: 'checks', icon: Ruler, title: 'Access, volumes, space-out' },
  { id: 'sizing', icon: Gauge, title: 'Tubing sizing' },
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

const CompletionDesignHelpGuideContent = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Completion Design Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Guide to the Completion Design Studio: string architecture, clearances, schematic, BOM and tubing sizing." />
      </Helmet>
      <div className="p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link to="/dashboard/apps/drilling/completion-design-studio">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Completion Design Studio
              </Button>
            </Link>
            <ThemeToggle />
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-pl-primary p-3 rounded-xl shrink-0">
              <Wrench className="w-8 h-8 text-pl-primary-fg" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-pl-text">Completion Design Studio Help Guide</h1>
              <p className="text-pl-muted text-lg">Architect the string, prove it runs, hand over the tally</p>
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
                Completion Design Studio turns a planned wellbore into a completion handover package: an ordered component
                stack with real stack-up depths, run-in clearance against the exposed casing program, wireline through-bore
                access, capacities and displacements, a seal space-out check, a to-scale schematic and a grouped bill of
                materials. It sits on the same well planning spine as the rest of the Drilling module: sites, wellbores and
                the definitive trajectory come from Well Design Studio, and the casing program can be snapshotted straight
                from a saved Casing and Tubing Design Studio case.
              </Para>
              <Para>
                The geometric engine is small on purpose and validated hard: API 5CT drift diameters with their exact
                deduction classes, telescoping stack-up, innermost-exposed-bore logic for overlapping strings and liners,
                and breakpoint-exact volume integration, all gated against an independent oracle.
              </Para>
              <Callout tone="info" title="Where force analysis lives">
                Tubing stress, packer forces and tubing movement are the Casing and Tubing Design Studio's Lubinski
                analysis. This Studio consumes its expected length change for the seal space-out check and links back for
                the rest. One implementation, one owner.
              </Callout>
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 min)</SectionHeading>
              <Step n={1} title="Pick the wellbore">Choose a site and wellbore in the explorer. The definitive Well Design Studio plan supplies the trajectory and total depth context.</Step>
              <Step n={2} title="Create a completion case">New case seeds a sensible 3-1/2 inch string: tubing, safety valve, packer, no-go nipple, entry guide, inside a 9-5/8 inch program.</Step>
              <Step n={3} title="Set the casing program">Snapshot a saved Casing and Tubing case, or edit the manual sections. This is the clearance basis, so make it match what is actually in the hole, liners included.</Step>
              <Step n={4} title="Build the string">Add components from the catalog on the String and Program tab. Order is top to bottom; the engine stacks depths live as you edit lengths.</Step>
              <Step n={5} title="Read the Checks tab">Run-in clearance names the controlling casing section per component. The through-bore table tells you the largest tool that reaches bottom. Fix FAILs before anything else.</Step>
              <Step n={6} title="Size the tubing">The Tubing Sizing tab screens every API 5CT tubing size with the Production nodal engine at your design rate and wellhead pressure.</Step>
              <Step n={7} title="Save and hand over">Ctrl+S saves the case. Save a run snapshot for the record, export the BOM as CSV and the schematic as PNG.</Step>
            </Section>

            <Section id="string">
              <SectionHeading icon={Wrench}>Building the string</SectionHeading>
              <Para>
                The string is an ordered list of components from the tubing hanger down. Tubing rows are run lengths you
                set; jewelry comes from the catalog with nominal planning dimensions. Every catalog row is marked with a
                tilde in the builder because vendor data sheets govern the exact model: the catalog gets you a buildable
                plan, the vendor sheet closes it out.
              </Para>
              <SubHeading>The equipment catalog</SubHeading>
              <Table
                headers={['Type', 'What it models', 'Bore behaviour']}
                rows={[
                  ['Tubing / flow coupling / blast joint', 'Plain pipe with the published EUE coupling OD', 'Full tubing ID'],
                  ['X / XN landing nipples', 'Standard selective and no-go profiles', 'Published seat bores; usually the string restriction'],
                  ['TRSV safety valve', 'Tubing retrievable flapper valve', 'X-profile bore, larger body OD'],
                  ['Side pocket mandrel', 'Gas lift pocket, eccentric body', 'Full ID, but the body OD governs run-in'],
                  ['Sliding sleeve', 'Circulation device', 'X-profile bore'],
                  ['Packer / PBR / seal assembly', 'Anchor and seal system', 'Packer bore; PBR sets the space-out'],
                  ['Custom', 'Anything else, vendor dims typed in', 'As entered'],
                ]}
              />
              <Callout tone="warn" title="Nominal dimensions">
                Catalog ODs, IDs and lengths are customary planning values, deliberately conservative and clearly flagged.
                The armed L14 validation gate spot-checks this table against a vendor data book when the owner supplies
                one. Before ordering steel, replace anything critical with the vendor sheet numbers via a custom component.
              </Callout>
            </Section>

            <Section id="program">
              <SectionHeading icon={Layers}>Casing program &amp; clearance</SectionHeading>
              <Para>
                The clearance basis is the exposed wellbore: for every depth the engine takes the smallest inner string
                covering it, so a 7 inch liner inside 9-5/8 inch casing correctly controls everything below the hanger.
                Drift diameters follow the API 5CT standard deductions per size class, computed from the catalog ID, never
                typed in.
              </Para>
              <Para>
                A component's run-in check is the whole journey, not the destination: its OD is compared against the
                minimum drift of every casing interval above its final depth. The table names the controlling section, so
                a FAIL tells you immediately whether the problem is the liner or the wear-prone top joint.
              </Para>
              <Callout tone="info" title="Snapshots, not links">
                Snapshotting a Casing and Tubing case copies its casing program into this case. Later edits over there do
                not silently move your clearance basis; re-snapshot when the casing design changes.
              </Callout>
            </Section>

            <Section id="schematic">
              <SectionHeading icon={PenTool}>Schematic &amp; BOM</SectionHeading>
              <Para>
                The schematic draws exactly what the case models: casing walls and shoes to diameter scale, the completion
                stack with type glyphs, packer slips, perforation marks, the TD line, and labeled jewelry depths. Nothing
                decorative is invented; if you do not model a cement top, none is drawn. Export is a plain PNG sized for
                reports.
              </Para>
              <Para>
                The bill of materials groups identical items with quantities and summed lengths, and carries the
                nominal-dimensions marker per row so a procurement reader knows what still needs a vendor sheet. CSV export
                drops straight into a tally book or order sheet.
              </Para>
            </Section>

            <Section id="checks">
              <SectionHeading icon={Ruler}>Access, volumes, space-out</SectionHeading>
              <SubHeading>Through-bore</SubHeading>
              <Para>
                The through-bore table walks the string from surface and reports the cumulative minimum bore at each
                component, naming the restriction. This is the largest gauge cutter, plug or shifting tool that physically
                passes. It is geometric access only: tool length, deviation drag and fluid effects are intervention
                planning questions outside this Studio.
              </Para>
              <SubHeading>Volumes</SubHeading>
              <Para>
                Capacities integrate the actual IDs per interval in measured depth: string capacity, annulus above the
                packer against the exposed casing, the rathole below, and closed-end displacement for running. Uncased
                intervals are skipped with a visible warning rather than silently zeroed.
              </Para>
              <SubHeading>Seal space-out</SubHeading>
              <Para>
                For PBR completions the check compares the remaining seal stroke against the expected tubing length change.
                Heating pushes seals deeper into the bore; cooling and ballooning during stimulation pull them out. Take
                the expected length change from the Casing and Tubing tubing analysis for the governing case, usually
                stimulation.
              </Para>
            </Section>

            <Section id="sizing">
              <SectionHeading icon={Gauge}>Tubing sizing</SectionHeading>
              <Para>
                The sizing table runs the Production module's validated nodal VLP engine for every API 5CT tubing size at
                your design rate, water cut, GOR and wellhead pressure, over the real trajectory. It reports the flowing
                bottomhole pressure each size demands and its friction share. Smaller tubing burns pressure in friction;
                oversized tubing risks liquid loading at low rates. The screen makes the trade visible in one table.
              </Para>
              <Callout tone="warn" title="A screen, not a match">
                Whether the reservoir can deliver the demanded pressure is an inflow question. Match the operating point in
                Nodal Analysis Studio; this table deliberately stops at the outflow side.
              </Callout>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                The engine is validated against an independent Python oracle that recomputes everything by a different
                route: drift closed forms asserted against published table values such as the 9-5/8 inch 47 lb/ft drift of
                8.525 inches, capacity checked against the classic ID squared over 1029.4 identity, and volumes
                cross-checked by brute-force one-centimetre slicing against the engine's breakpoint integration. The suite
                validation runner gates A24 and A25 on byte-identical golden agreement; the engines repo carries twenty
                more jest gates.
              </Para>
              <Table
                headers={['Gate', 'What it proves']}
                rows={[
                  ['A24', 'Drift closed forms, stack-up bookkeeping, volumes vs the oracle golden'],
                  ['A25', 'Clearance and through-bore governing logic, space-out statuses vs the oracle'],
                  ['L14 (armed)', 'Equipment catalog dims vs an owner-supplied vendor data book'],
                ]}
              />
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls &amp; FAQ</SectionHeading>
              <SubHeading>My SPM fails clearance but the vendor says it runs</SubHeading>
              <Para>
                The catalog side pocket mandrel is a nominal eccentric body. Real SPMs come in slim variants per casing
                weight; enter the vendor OD as a custom component and the check will use it.
              </Para>
              <SubHeading>Why does the annulus volume ignore my liner top packer?</SubHeading>
              <Para>
                The volume split is at the production packer in the string. Liner hanger packers are casing equipment and
                belong to the casing case; the annulus above your production packer is still one connected volume here.
              </Para>
              <SubHeading>What is deliberately out of scope</SubHeading>
              <Para>
                Annular pressure buildup, sour service derating, sand control screen and gravel sizing (the Perforation
                and Sand Control Designer covers that), intelligent completions, multilaterals, and artificial lift design
                (Production module). The absorbed Well Schematic Designer's drag-and-drop drawing is replaced by this
                engineering model; there is no free-floating drawing mode.
              </Para>
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['Drift', 'Guaranteed passable diameter of a tubular per API 5CT, smaller than the ID'],
                  ['Through-bore', 'Cumulative minimum ID from surface; the largest tool that passes'],
                  ['Stack-up / tally', 'Component lengths summed from the hanger to place every item at depth'],
                  ['PBR', 'Polished bore receptacle; a honed bore the seal assembly strokes in'],
                  ['Space-out', 'Setting the seal insertion so thermal and pressure strokes stay inside the bore'],
                  ['No-go nipple', 'A landing nipple whose seat stops oversized tools; the intended smallest bore'],
                  ['SPM', 'Side pocket mandrel; eccentric body holding a gas lift or dummy valve'],
                  ['BOM', 'Bill of materials; grouped components with quantities and lengths'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 3C: the guide follows the same per-user theme
// as the Completion Design Studio itself, so the look does not flip between the two pages.
const CompletionDesignHelpGuide = () => (
  <ThemedApp className="min-h-screen" data-testid="cd-help-theme-scope">
    <CompletionDesignHelpGuideContent />
  </ThemedApp>
);

export default CompletionDesignHelpGuide;
