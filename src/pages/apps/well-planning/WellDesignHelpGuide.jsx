// Well Design Studio in-app help guide (WD6 follow-on). Sectioned
// single-page component with sticky left navigation, on the EPE help
// guide pattern (dark glass cards, slate/lime/cyan tokens). Content
// mirrors the delivered user manual v1.0 and the shipped app at
// WD0-WD6; owner copy rule: no em dashes.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Zap, FolderTree, Ruler, Wand2, Target, LayoutGrid,
  Compass, GitCompareArrows, CircleDot, Shield, Share2, FileText,
  BadgeCheck, AlertTriangle, BookMarked,
} from 'lucide-react';

const sections = [
  { id: 'overview', icon: BookOpen, title: 'What is the Studio?' },
  { id: 'quickstart', icon: Zap, title: 'Quick Start (10 min)' },
  { id: 'workspace', icon: FolderTree, title: 'Sites, wellbores, designs' },
  { id: 'design', icon: Ruler, title: 'Designing the trajectory' },
  { id: 'solvers', icon: Wand2, title: 'Design methods (solvers)' },
  { id: 'targets', icon: Target, title: 'Targets' },
  { id: 'views', icon: LayoutGrid, title: 'Charts, table and 3D' },
  { id: 'north', icon: Compass, title: 'North references and magnetics' },
  { id: 'surveys', icon: GitCompareArrows, title: 'Actual surveys' },
  { id: 'uncertainty', icon: CircleDot, title: 'Uncertainty (EOU)' },
  { id: 'anticollision', icon: Shield, title: 'Anti-collision' },
  { id: 'publish', icon: Share2, title: 'Publish and integrations' },
  { id: 'reports', icon: FileText, title: 'Exports and reports' },
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

const WellDesignHelpGuide = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Well Design Studio Help Guide - Petrolord Suite</title>
        <meta name="description" content="Comprehensive guide to Well Design Studio: trajectory design, uncertainty, anti-collision, publishing and reports." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
          <div className="mb-4">
            <Link to="/dashboard/apps/drilling/well-planning">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Well Design Studio
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-lime-600 to-cyan-600 p-3 rounded-xl">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Well Design Studio Help Guide</h1>
              <p className="text-lime-200 text-lg">Plan the well, prove the separation, publish the trajectory</p>
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
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${activeSection === s.id ? 'bg-lime-500/15 text-lime-200' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" /> {s.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-9">
            <Section id="overview">
              <SectionHeading icon={BookOpen}>What is Well Design Studio?</SectionHeading>
              <Para>
                Well Design Studio is the Suite's directional well planning application. It takes a well from an empty pad
                to a deliverable plan: wellhead and datum setup on a real coordinate reference system, trajectory design with
                exact profile solvers, drilling targets picked from your geoscience data, actual-survey management with
                plan-versus-actual comparison, ISCWSA positional uncertainty, industry-standard anti-collision, 3D
                visualization, machine-readable exports and a printable report pack.
              </Para>
              <SubHeading>Built on validated engines</SubHeading>
              <Para>
                Every calculation is gated against published truth before it ships: analytic minimum-curvature oracles, the
                official NOAA WMM2025 magnetic test values, the official ISCWSA error-model example well, the official ISCWSA
                anti-collision example wells, and the Applied Drilling Engineering chapter 8 survey example. See the
                Validation section for the full chain.
              </Para>
              <SubHeading>The six tabs</SubHeading>
              <Table
                headers={['Tab', 'What you do there']}
                rows={[
                  ['Design', 'Segments, solvers, charts, survey table, 3D, EOU, mud window, exports, publish.'],
                  ['Targets', 'The site target library on an equal-aspect map; targets by hand or from registry tops and surfaces.'],
                  ['Surveys', 'Import as-drilled runs, build the definitive composite, compare plan versus actual, project ahead.'],
                  ['Anti-Collision', 'Separation scans against offset wells, ladder and traveling-cylinder views, immutable run history.'],
                  ['Reports', 'Wall plot, survey listing and anti-collision PDFs.'],
                  ['Apps', 'Jump to casing design, torque and drag, cost and stability apps with the well context.'],
                ]}
              />
            </Section>

            <Section id="quickstart">
              <SectionHeading icon={Zap}>Quick Start (10 minutes)</SectionHeading>
              <Step n={1} title="Create a site">
                Tree header, New site. Name it, pick the projected CRS your coordinates are in, set the north reference and
                the origin. Optionally add pad slots and lease lines. The CRS is not decoration: it places wells on the
                earth, drives the magnetic lookup, and lines your data up with seismic and registry wells.
              </Step>
              <Step n={2} title="Create a wellbore">
                Site menu, New wellbore. Pick a slot or type wellhead coordinates, set the KB elevation, the depth unit and
                the azimuth reference your team plans in. The dialog shows the live WMM2025 declination, dip and field plus
                the grid convergence; saving caches them on the wellbore.
              </Step>
              <Step n={3} title="Add a target">
                Targets tab, New target. For example a circle of radius 120 m at a depth of 2470 m TVDSS. Or create one from
                a registry formation top or a mapped surface with From registry.
              </Step>
              <Step n={4} title="Solve the trajectory">
                Design tab, Design methods. Pick Build and hold (J), the target, a kickoff depth and a build rate, then
                Apply. The KPI strip and charts update; hand-edit segments if you like.
              </Step>
              <Step n={5} title="Save">
                Save writes the segments and the computed station cache. Publishing, exports, reports and anti-collision all
                read the saved trajectory, never the live editor.
              </Step>
              <Step n={6} title="Prove and deliver">
                Toggle EOU to see uncertainty. Run the Anti-Collision scan if the pad has neighbors and save the run. Publish
                to the registry so Seismolord and the geoscience apps see the well. Print the wall plot from Reports.
              </Step>
            </Section>

            <Section id="workspace">
              <SectionHeading icon={FolderTree}>Sites, wellbores and designs</SectionHeading>
              <Table
                headers={['Level', 'Holds', 'Key properties']}
                rows={[
                  ['Site', 'The pad. Share root and coordinate context.', 'CRS, north reference, origin, slot template, lease lines.'],
                  ['Wellbore', 'One hole from one wellhead.', 'Wellhead, KB and ground elevation, water depth, depth unit, azimuth reference, cached convergence and magnetic model, sidetrack parent, registry bridge.'],
                  ['Design', 'One versioned plan.', 'Segments, station cache, revision and status, survey program, AC history, publish stamps.'],
                ]}
              />
              <SubHeading>Design lifecycle</SubHeading>
              <Para>
                Draft designs are editable. Set definitive (tree menu) promotes a design to the plan of record; exactly one
                per wellbore, and the previous definitive is archived automatically. Definitive and archived designs are
                read-only; Duplicate as revision creates the next editable draft. Unsaved edits are kept per design in your
                browser, but only Save makes the trajectory real for downstream features.
              </Para>
              <SubHeading>Sharing</SubHeading>
              <Para>
                Share a site with your organization from the site menu: members see everything under it read-only, marked in
                the tree. Only the owner writes. Stop sharing at any time. There is no partial share; the site is the unit.
              </Para>
              <Callout tone="info" title="Units">
                Storage is metres and grid azimuths everywhere; the interface follows the wellbore's depth unit and azimuth
                reference. DLS reports per 30 m on metric wells and per 100 ft on feet wells.
              </Callout>
            </Section>

            <Section id="design">
              <SectionHeading icon={Ruler}>Designing the trajectory</SectionHeading>
              <Para>
                A design is an ordered list of segments compiled to survey stations by the validated minimum-curvature
                engine. Drag to reorder; the trajectory recompiles a moment after each edit, and compile problems are shown
                in red, never swallowed.
              </Para>
              <Table
                headers={['Segment', 'Parameters', 'Behavior']}
                rows={[
                  ['Hold', 'Length', 'Constant inclination and azimuth.'],
                  ['Build', 'Length, build rate', 'Inclination change at the rate (negative drops).'],
                  ['Turn', 'Length, turn rate', 'Azimuth change at constant inclination.'],
                  ['TF Arc', 'Length, DLS, toolface', 'A slide: circular arc at the DLS with fixed toolface; builds and turns together.'],
                ]}
              />
              <SubHeading>Design settings</SubHeading>
              <Para>
                <Code>Max DLS</Code> is the design constraint; violations flag in the KPI strip. <Code>KO Azi</Code> is
                entered in the wellbore's azimuth reference (the label says which); the compile runs in grid north through
                the cached chain. <Code>Survey program</Code> assigns instruments per interval for uncertainty.{' '}
                <Code>EOU</Code> toggles the 2-sigma uncertainty overlays.
              </Para>
              <SubHeading>The KPI strip</SubHeading>
              <Para>
                Total MD, TVD at TD, horizontal displacement, maximum inclination and maximum DLS, plus the bottom-hole
                location as latitude and longitude when the CRS allows. The quality check flags DLS above your limit.
              </Para>
            </Section>

            <Section id="solvers">
              <SectionHeading icon={Wand2}>Design methods (the solvers)</SectionHeading>
              <Para>
                Five exact solvers. Replace methods rebuild the segment list from surface; append methods continue from the
                current design end, so you can chain an upper solve with a landing.
              </Para>
              <Table
                headers={['Method', 'Mode', 'Solves']}
                rows={[
                  ['Build and hold (J)', 'Replace', 'Vertical, one build at your rate, a hold that lands on the target.'],
                  ['S-profile', 'Replace', 'Build, hold, then drop toward a final inclination while hitting the target.'],
                  ['Curve to target', 'Append', 'One circular arc from the design end to the target, with the required DLS reported.'],
                  ['Horizontal landing', 'Append', 'Curve-hold-curve arriving at a specified inclination and azimuth (typically 90 degrees) at the landing point.'],
                  ['Nudge', 'Replace', 'A shallow deviation and return for slot separation on crowded pads.'],
                ]}
              />
              <Callout tone="success" title="Infeasible is an answer">
                When a target cannot be reached at the requested rates, the solver says so with the constraint that failed.
                Raise the rate, move the kickoff, or rethink the target; the app will not invent a path.
              </Callout>
            </Section>

            <Section id="targets">
              <SectionHeading icon={Target}>Targets</SectionHeading>
              <Para>
                Targets are site-level: name, category (Geological or Driller's), shape, center in site metres, depth in
                TVDSS, optional dip and dip azimuth, color and notes. Shapes: point, circle (radius), ellipse (semi-axes and
                rotation) and polygon. They draw in true geometry on the plan view, at true depth in 3D, and populate every
                solver's picker.
              </Para>
              <SubHeading>From your geoscience data</SubHeading>
              <Para>
                From registry creates targets from shared data: pick a registry well and one of its formation tops, or pick a
                mapped surface and a location to sample its depth. Provenance is recorded on the target.
              </Para>
            </Section>

            <Section id="views">
              <SectionHeading icon={LayoutGrid}>Charts, the survey table and 3D</SectionHeading>
              <Para>
                Four views on the Design tab: Section (TVD versus vertical section, with the EOU band and the PPFG mud
                window), Plots (plan, section, inclination, DLS), Survey (the full station table), and 3D.
              </Para>
              <SubHeading>Plan view</SubHeading>
              <Para>
                A true equal-aspect map: north is never stretched against east. Wellpath, slots, lease lines, targets in true
                shape, EOU ellipses and a north arrow.
              </Para>
              <SubHeading>The 3D window</SubHeading>
              <Para>
                The pad in an interactive cube: your plan, the definitive actual composite, the other wellbores' definitive
                designs, EOU rings, targets, registry tops, axes with Easting, Northing and TVDSS ticks, and a north arrow.
                Drag orbits, shift-drag pans, the wheel zooms; Vexag exaggerates the vertical; layer buttons toggle EOU,
                targets, tops and offsets; PNG captures a snapshot.
              </Para>
              <Callout tone="warn" title="WebGL2 required">
                The 3D view needs WebGL2. Some remote desktops cannot provide it; the view says so and everything else keeps
                working.
              </Callout>
            </Section>

            <Section id="north">
              <SectionHeading icon={Compass}>North references and magnetics</SectionHeading>
              <Table
                headers={['North', 'Definition', 'Conversion']}
                rows={[
                  ['Grid', 'Map north of the site CRS. All storage and computation.', 'The reference frame.'],
                  ['True', 'Geographic north.', 'True = grid + convergence.'],
                  ['Magnetic', 'What the MWD measures.', 'True = magnetic + declination.'],
                ]}
              />
              <Para>
                The wellbore's azimuth reference declares the north you type and read; every field is labeled, listings say{' '}
                <Code>Azi grid</Code> explicitly, and all conversions use the cached convergence and declination. A non-grid
                reference without the cache warns loudly and treats input as grid until you re-save the wellbore.
              </Para>
              <Para>
                Declination, dip and total field come from WMM2025, computed in-app from the official NOAA coefficients and
                verified against all 24 official NOAA test points. Re-save the wellbore to refresh the planning cache;
                survey runs carry their own reference per run.
              </Para>
            </Section>

            <Section id="surveys">
              <SectionHeading icon={GitCompareArrows}>Actual surveys</SectionHeading>
              <SubHeading>Importing runs</SubHeading>
              <Para>
                New survey imports stations manually (paste MD, inclination, azimuth lines; strict, line-numbered
                validation), from a CSV with column mapping, or from a registry well's deviation. Each run records its MD
                unit and azimuth reference; stations are stored in metres with a grid-converted cache, so nothing downstream
                re-guesses what the numbers meant.
              </Para>
              <SubHeading>The definitive composite</SubHeading>
              <Para>
                Flag the official runs as definitive. The composite follows the industry rule: the deeper run wins from its
                tie-on down. It is the actual well in 3D and an available anti-collision reference.
              </Para>
              <SubHeading>Plan versus actual, and project ahead</SubHeading>
              <Para>
                The overlay charts and the delta table give differences in inclination, azimuth, TVD, North, East and 2D/3D
                separation at every actual station, with the plan interpolated exactly on its arcs. Project ahead solves one
                continuous-build arc from the last actual station to a target under a DLS guard: can we still get there, and
                how hard do we steer.
              </Para>
            </Section>

            <Section id="uncertainty">
              <SectionHeading icon={CircleDot}>Positional uncertainty (EOU)</SectionHeading>
              <Para>
                Uncertainty uses the ISCWSA MWD Revision 4 instrument error model: 27 sources (depth, accelerometer,
                magnetometer, geomagnetic reference, drillstring interference, sag and misalignment) propagated through the
                survey geometry to a covariance at every station. The implementation reproduces the official ISCWSA example
                well to numerical precision.
              </Para>
              <Para>
                Displays: 2-sigma ellipses on the plan view, a TVD band on the section, rings in 3D. The same covariances
                feed anti-collision, so the pictures and the rule always agree.
              </Para>
              <SubHeading>Survey programs</SubHeading>
              <Para>
                Assign instruments to MD intervals in the Survey program editor; intervals must tile surface to TD. At a
                tool change the accumulated uncertainty freezes and the new tool grows from the tie-on (the ISCWSA
                convention). The library ships validated tools only.
              </Para>
              <Callout tone="warn" title="Prerequisite">
                Uncertainty needs the wellbore's cached magnetic model (or a transformable site CRS for a live lookup).
                Without it, EOU and anti-collision state exactly what is missing.
              </Callout>
            </Section>

            <Section id="anticollision">
              <SectionHeading icon={Shield}>Anti-collision</SectionHeading>
              <Para>
                The industry separation rule (SPE 187073) with the ISCWSA pedal-curve method. For each reference station the
                engine finds the exact closest point on each offset (on the arcs, not just stations), projects both wells'
                covariance onto the center-to-center line, and evaluates:
              </Para>
              <Para>
                <Code>SF = (distance - radii - Sm) / (k x combined sigma incl. projection-ahead)</Code>
              </Para>
              <Table
                headers={['Parameter', 'Default', 'Meaning']}
                rows={[
                  ['k', '3.5', 'How many combined standard deviations of clearance the rule demands.'],
                  ['Sigma pa', '0.5 m', 'Bit position allowance ahead of the last survey.'],
                  ['Sm', '0.3 m', 'Fixed surface margin for unmodeled effects.'],
                  ['Radii', '0.4572 / 0.3048 m', 'Physical hole radii; the rule is edge to edge.'],
                  ['No-go / Review', '1.0 / 1.5', 'Your action thresholds.'],
                ]}
              />
              <SubHeading>Workflow</SubHeading>
              <Para>
                Pick the reference (plan or actual composite), tick offsets (other wellbores' designs and same-CRS registry
                wells), set the rule, Run. Read the status cards, the SF and distance ladders (distance mode shows MASD, the
                distance at which SF would equal 1), the traveling cylinder (highside or north), and the violations table.
              </Para>
              <Callout tone="success" title="Save the run">
                Save run stores the scan immutably on the design: your evidence the plan was checked, the input to the AC
                report, and viewable later exactly as computed. Rerun after any plan change; saved runs never auto-update.
              </Callout>
            </Section>

            <Section id="publish">
              <SectionHeading icon={Share2}>Publish and integrations</SectionHeading>
              <Para>
                Publish turns the saved trajectory into a registry well. First publish creates it and bridges the wellbore;
                every later publish updates the same registry row in place, so references held by other apps keep working.
                Optional checkshot borrow copies a nearby well's time-depth so the plan hangs in time domains.
              </Para>
              <Table
                headers={['Consumer', 'What it does with your plan']}
                rows={[
                  ['Seismolord', 'Co-renders the well in the 3D cube and on sections with your seismic.'],
                  ['Well Data Manager', 'Lists and manages it like any registry well.'],
                  ['Correlation / Petrophysics', 'Use it for tops and log work.'],
                  ['Pore Pressure Studio', 'Computes a prognosis on it; publish that and the mud window lights up here.'],
                ]}
              />
              <SubHeading>The PPFG mud window</SubHeading>
              <Para>
                With a bridged registry well carrying a published prognosis (PP, FP, OBG), toggle PPFG in the Section view:
                curves hang on your trajectory by exact MD-to-TVD conversion, in MPa or EMW g/cc, with the safe window shaded
                and the tightest window called out. Missing prerequisites are stated exactly.
              </Para>
            </Section>

            <Section id="reports">
              <SectionHeading icon={FileText}>Exports and reports</SectionHeading>
              <SubHeading>Export menu</SubHeading>
              <Table
                headers={['Export', 'Contents']}
                rows={[
                  ['Survey CSV (quick)', 'The on-screen listing in the wellbore unit.'],
                  ['Trajectory contract (JSON)', 'The versioned machine interface: full header, azimuth chain, geomagnetics, stations in both frames. Feed this to torque-and-drag, casing and external tools.'],
                  ['Trajectory CSV / Excel', 'The contract stations as CSV or a two-sheet workbook.'],
                  ['DXF', 'The wellpath as a CAD 3D polyline in site coordinates, elevation positive up.'],
                ]}
              />
              <SubHeading>The report pack</SubHeading>
              <Para>
                Reports tab: the wall plot (A4 landscape; header block, vector plan and section with EOU, key stations,
                targets), the survey listing (full table with TD summary), and the anti-collision report (from a saved run:
                parameters, per-offset minimum SF, the SF ladder, violations). All render from the saved trajectory, in your
                browser, with the Petrolord brand.
              </Para>
            </Section>

            <Section id="validation">
              <SectionHeading icon={BadgeCheck}>Validation basis</SectionHeading>
              <Para>
                Hard gates run on every change; a failure blocks release. Nothing is silently skipped.
              </Para>
              <Table
                headers={['Engine', 'Validated against']}
                rows={[
                  ['Minimum curvature and survey math', 'Closed-form analytic oracles, metres and feet.'],
                  ['Compiler and solvers', 'Closed-form build-hold plus randomized round-trip property tests.'],
                  ['WMM2025', 'All 24 official NOAA test values within table rounding.'],
                  ['ISCWSA Rev4 error model', 'The official example Well #1 workbook: 112 per-source covariances and all-station totals.'],
                  ['Separation rule', 'The official ISCWSA clearance wells: 11 scenarios at the standard tolerance.'],
                  ['ADE ch.8 example', 'The published survey-methods answers (TVD 1653.99 ft, ND 954.93 ft), cross-checked against the closed form.'],
                  ['The browser build', 'End-to-end probes assert solver, declination, SF, exports and PDF pagination digit for digit.'],
                ]}
              />
              <Para>
                Two literature gates remain armed awaiting source documents (the Mitchell and Miska survey table and the
                Amoco MD-TVD table); armed gates report as pending on every run and can never silently pass.
              </Para>
            </Section>

            <Section id="pitfalls">
              <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
              <Table
                headers={['Symptom', 'Fix']}
                rows={[
                  ['Azimuth warning about missing convergence or declination', 'Set a transformable site CRS, then re-save the wellbore to cache the chain.'],
                  ['EOU or anti-collision say no geomagnetic reference', 'Same cache; re-save the wellbore with wellhead coordinates set.'],
                  ['Design is locked', 'It is definitive or archived. Duplicate as revision from the tree.'],
                  ['Publish or reports disabled', 'Save the design first; deliverables read the saved cache.'],
                  ['No AC offset candidates', 'Other wellbores need saved designs; registry wells need a deviation in the site CRS.'],
                  ['PPFG panel empty', 'Publish the design, run Pore Pressure Studio on the published well, publish its curves.'],
                  ['3D unavailable', 'No WebGL2 in this browser session; use a local browser.'],
                  ['Solver says infeasible', 'The constraint that failed is named; adjust rate, kickoff or target.'],
                  ['Survey paste rejected', 'The line number is named; MD must increase, inclination 0 to 180, 2+ stations.'],
                  ['Shared site is read-only', 'By design. Ask the owner, or copy into your own site.'],
                ]}
              />
            </Section>

            <Section id="glossary">
              <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
              <Table
                headers={['Term', 'Meaning']}
                rows={[
                  ['Closure', 'Horizontal distance and bearing from wellhead to a station.'],
                  ['Composite survey', 'The official as-drilled survey; deeper run wins from its tie-on down.'],
                  ['Convergence', 'Angle between grid north and true north at a location.'],
                  ['Declination', 'Angle between magnetic north and true north at a location and date.'],
                  ['DLS', 'Dogleg severity: rate of change of hole direction.'],
                  ['EOU', 'Ellipse of uncertainty from the instrument error model.'],
                  ['ISCWSA', 'Industry Steering Committee on Wellbore Survey Accuracy.'],
                  ['KB', 'Kelly bushing elevation: the depth datum.'],
                  ['KOP', 'Kickoff point: where the well leaves vertical.'],
                  ['MASD', 'Minimum Allowable Separation Distance: where SF would equal 1.'],
                  ['Pedal curve', 'The ISCWSA projection of the uncertainty ellipsoid onto the line between wells.'],
                  ['SF', 'Separation factor; below 1.0 violates the rule.'],
                  ['Tie-on', 'The depth and attitude a run, program leg or sidetrack starts from.'],
                  ['Toolface', 'Orientation of the steering bend; 0 is highside.'],
                  ['Traveling cylinder', 'Polar plot of offsets around the reference well.'],
                  ['TVDSS', 'TVD below the elevation datum, positive down.'],
                  ['VS', 'Vertical section: displacement projected onto a chosen azimuth.'],
                  ['WMM2025', 'The World Magnetic Model, 2025 release.'],
                ]}
              />
            </Section>
          </main>
        </div>
      </div>
    </>
  );
};

export default WellDesignHelpGuide;
