// Shared shell and typographic primitives for full-page in-app help guides.
//
// The EPE guide established this pattern (sticky contents rail, dark glass
// cards, numbered steps, toned callouts) and the eleven drilling guides each
// re-declared it locally. This module is that pattern extracted once, for the
// Reservoir guides written against it. The older guides still carry their own
// copies; they can migrate here when they are next touched.
//
// Copy rule reminder for anyone writing a guide with these: no em dashes and
// no "X, not Y" contrastives in user-facing text. The reservoir guide test
// (src/components/__tests__/reservoirHelpGuides.test.js) enforces it.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { buildLabel } from '@/lib/platformBuild';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useDsTheme } from '@/design/themeContext';

// Design system (pilot 4, Seismolord): inside an opted-in <ThemedApp> scope
// the guide uses the theme roles; everywhere else (every guide whose app has
// not migrated) the legacy dark classes render byte for byte.
// src/components/workstation/__tests__/sharedShellsOptIn.test.jsx holds that.
const LEGACY = {
  h2: 'flex items-center gap-3 text-3xl font-bold text-white mb-4 mt-0 pt-2',
  h2Icon: 'w-7 h-7 text-cyan-300',
  h3: 'text-xl font-semibold text-lime-200 mt-6 mb-2',
  para: 'text-slate-200 leading-relaxed mb-3',
  code: 'px-1.5 py-0.5 rounded bg-slate-900/70 text-cyan-200 text-sm font-mono',
  formula: 'my-3 px-4 py-3 rounded bg-slate-900/70 border border-white/10 text-cyan-100 font-mono text-sm overflow-x-auto',
  tones: {
    info: 'bg-cyan-900/30 border-cyan-500/40 text-cyan-100',
    warn: 'bg-amber-900/30 border-amber-500/40 text-amber-100',
    danger: 'bg-red-900/30 border-red-500/40 text-red-100',
    success: 'bg-green-900/30 border-green-500/40 text-green-100',
  },
  stepBadge: 'flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm',
  stepTitle: 'font-semibold text-white mb-1',
  stepBody: 'text-slate-200 text-sm leading-relaxed',
  table: 'min-w-full text-sm border border-white/10',
  thead: 'bg-slate-800/60',
  th: 'px-3 py-2 text-left text-cyan-200 font-semibold border-b border-white/10',
  trOdd: 'bg-slate-800/20',
  td: 'px-3 py-2 text-slate-200 border-b border-white/5 align-top',
  section: 'bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6',
  back: 'text-white border-white/20 hover:bg-white/10',
  headerBadge: 'bg-gradient-to-r from-indigo-500 to-purple-500 p-3 rounded-xl',
  headerIcon: 'w-8 h-8 text-white',
  h1: 'text-4xl font-bold text-white',
  subtitle: 'text-lime-200 text-lg',
  rail: 'sticky top-6 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-4',
  railLabel: 'text-xs uppercase tracking-wider text-lime-300/70 mb-2 px-2',
  navActive: 'bg-gradient-to-r from-green-500/20 to-cyan-500/20 text-white border-l-2 border-cyan-400',
  navIdle: 'text-slate-300 hover:bg-white/5 hover:text-white',
  footer: 'mt-10 border-t border-white/10 pt-4 text-xs text-slate-500',
};
const THEMED = {
  h2: 'flex items-center gap-3 text-3xl font-semibold text-pl-text mb-4 mt-0 pt-2',
  h2Icon: 'w-7 h-7 text-pl-primary-text',
  h3: 'text-xl font-semibold text-pl-text mt-6 mb-2',
  para: 'text-pl-text leading-relaxed mb-3',
  code: 'px-1.5 py-0.5 rounded bg-pl-sunken text-pl-text text-sm font-pl-mono',
  formula: 'my-3 px-4 py-3 rounded bg-pl-sunken border border-pl-border text-pl-text font-pl-mono text-sm overflow-x-auto',
  tones: {
    info: 'bg-pl-info-bg border-pl-info text-pl-info-text',
    warn: 'bg-pl-warning-bg border-pl-warning text-pl-warning-text',
    danger: 'bg-pl-danger-bg border-pl-danger text-pl-danger-text',
    success: 'bg-pl-success-bg border-pl-success text-pl-success-text',
  },
  stepBadge: 'flex-shrink-0 w-8 h-8 rounded-full bg-pl-primary flex items-center justify-center text-pl-primary-fg font-bold text-sm font-pl-mono',
  stepTitle: 'font-semibold text-pl-text mb-1',
  stepBody: 'text-pl-text text-sm leading-relaxed',
  table: 'min-w-full text-sm border border-pl-border',
  thead: 'bg-pl-sunken',
  th: 'px-3 py-2 text-left text-pl-muted text-xs uppercase tracking-wide font-semibold border-b border-pl-border',
  trOdd: 'bg-pl-sunken/50',
  td: 'px-3 py-2 text-pl-text border-b border-pl-border align-top',
  section: 'bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm',
  back: '',
  headerBadge: 'bg-pl-accent p-3 rounded-xl',
  headerIcon: 'w-8 h-8 text-pl-accent-fg',
  h1: 'font-pl-display text-4xl font-semibold text-pl-text',
  subtitle: 'text-pl-muted text-lg',
  rail: 'sticky top-6 bg-pl-surface border border-pl-border rounded-xl p-4 shadow-pl-sm',
  railLabel: 'text-xs uppercase tracking-wider text-pl-accent-text mb-2 px-2',
  navActive: 'bg-pl-primary/10 text-pl-primary-text font-medium border-l-2 border-pl-primary',
  navIdle: 'text-pl-text hover:bg-pl-sunken',
  footer: 'mt-10 border-t border-pl-border pt-4 text-xs text-pl-muted',
};
const useGuideClasses = () => (useDsTheme() ? THEMED : LEGACY);

export const SectionHeading = ({ icon: Icon, children }) => {
  const c = useGuideClasses();
  return (
    <h2 className={c.h2}>
      {Icon ? <Icon className={c.h2Icon} /> : null} {children}
    </h2>
  );
};

export const SubHeading = ({ children }) => {
  const c = useGuideClasses();
  return <h3 className={c.h3}>{children}</h3>;
};

export const Para = ({ children }) => {
  const c = useGuideClasses();
  return <p className={c.para}>{children}</p>;
};

export const Code = ({ children }) => {
  const c = useGuideClasses();
  return <code className={c.code}>{children}</code>;
};

export const Formula = ({ children }) => {
  const c = useGuideClasses();
  return <div className={c.formula}>{children}</div>;
};

export const Callout = ({ tone = 'info', title, children }) => {
  const { tones } = useGuideClasses();
  return (
    <div className={`border-l-4 rounded p-4 my-4 ${tones[tone] || tones.info}`}>
      {title ? <div className="font-semibold mb-1">{title}</div> : null}
      <div className="text-sm">{children}</div>
    </div>
  );
};

export const Step = ({ n, title, children }) => {
  const c = useGuideClasses();
  return (
    <div className="flex gap-3 mb-4">
      <div className={c.stepBadge}>
        {n}
      </div>
      <div className="flex-1">
        <div className={c.stepTitle}>{title}</div>
        <div className={c.stepBody}>{children}</div>
      </div>
    </div>
  );
};

export const Table = ({ headers, rows }) => {
  const k = useGuideClasses();
  return (
    <div className="my-3 overflow-x-auto">
      <table className={k.table}>
        <thead className={k.thead}>
          <tr>
            {headers.map((h) => (
              <th key={h} className={k.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? k.trOdd : ''}>
              {r.map((c, j) => (
                <td key={j} className={k.td}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// One guide section. The id becomes `section-<id>` so the contents rail and
// the per-guide tests can both find it.
export const GuideSection = ({ id, children }) => {
  const c = useGuideClasses();
  return (
    <section id={`section-${id}`} className={c.section}>
      {children}
    </section>
  );
};

/**
 * Full-page help guide shell.
 *
 * sections: [{ id, icon, title }] drives the sticky contents rail. Every entry
 * must have a matching <GuideSection id="..."> among the children.
 */
export const HelpGuideShell = ({
  title,
  subtitle,
  metaDescription,
  backTo,
  backLabel = 'Back to the app',
  icon: HeaderIcon = BookOpen,
  sections,
  children,
}) => {
  const [activeSection, setActiveSection] = useState(sections?.[0]?.id);
  const c = useGuideClasses();

  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>{title} - Petrolord Suite</title>
        <meta name="description" content={metaDescription || subtitle || title} />
      </Helmet>
      <div className="p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          {backTo ? (
            <div className="mb-4">
              <Link to={backTo}>
                <Button variant="outline" className={c.back}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
                </Button>
              </Link>
            </div>
          ) : null}
          <div className="flex items-center space-x-4">
            <div className={c.headerBadge}>
              <HeaderIcon className={c.headerIcon} />
            </div>
            <div>
              <h1 className={c.h1}>{title}</h1>
              {subtitle ? <p className={c.subtitle}>{subtitle}</p> : null}
            </div>
            {/* the light/dark switch of the dashboard scope (renders nothing outside a scope) */}
            <ThemeToggle className="!ml-auto" />
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3">
            <div className={c.rail}>
              <div className={c.railLabel}>Contents</div>
              <nav className="space-y-1">
                {sections.map((s) => {
                  const Icon = s.icon;
                  const isActive = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                        isActive ? c.navActive : c.navIdle
                      }`}
                    >
                      {Icon ? <Icon className="w-4 h-4 flex-shrink-0" /> : null}
                      <span>{s.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-9 space-y-10">{children}</main>
        </div>
        <footer className={c.footer} data-testid="helpguide-build">
          {buildLabel()}. This guide describes the build you are running.
        </footer>
      </div>
    </>
  );
};

export default HelpGuideShell;
