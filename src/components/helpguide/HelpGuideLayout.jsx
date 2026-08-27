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
import { Button } from '@/components/ui/button';

export const SectionHeading = ({ icon: Icon, children }) => (
  <h2 className="flex items-center gap-3 text-3xl font-bold text-white mb-4 mt-0 pt-2">
    {Icon ? <Icon className="w-7 h-7 text-cyan-300" /> : null} {children}
  </h2>
);

export const SubHeading = ({ children }) => (
  <h3 className="text-xl font-semibold text-lime-200 mt-6 mb-2">{children}</h3>
);

export const Para = ({ children }) => (
  <p className="text-slate-200 leading-relaxed mb-3">{children}</p>
);

export const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-900/70 text-cyan-200 text-sm font-mono">{children}</code>
);

export const Formula = ({ children }) => (
  <div className="my-3 px-4 py-3 rounded bg-slate-900/70 border border-white/10 text-cyan-100 font-mono text-sm overflow-x-auto">
    {children}
  </div>
);

export const Callout = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-cyan-900/30 border-cyan-500/40 text-cyan-100',
    warn: 'bg-amber-900/30 border-amber-500/40 text-amber-100',
    danger: 'bg-red-900/30 border-red-500/40 text-red-100',
    success: 'bg-green-900/30 border-green-500/40 text-green-100',
  };
  return (
    <div className={`border-l-4 rounded p-4 my-4 ${tones[tone] || tones.info}`}>
      {title ? <div className="font-semibold mb-1">{title}</div> : null}
      <div className="text-sm">{children}</div>
    </div>
  );
};

export const Step = ({ n, title, children }) => (
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

export const Table = ({ headers, rows }) => (
  <div className="my-3 overflow-x-auto">
    <table className="min-w-full text-sm border border-white/10">
      <thead className="bg-slate-800/60">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 text-left text-cyan-200 font-semibold border-b border-white/10">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-slate-800/20' : ''}>
            {r.map((c, j) => (
              <td key={j} className="px-3 py-2 text-slate-200 border-b border-white/5 align-top">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// One guide section. The id becomes `section-<id>` so the contents rail and
// the per-guide tests can both find it.
export const GuideSection = ({ id, children }) => (
  <section id={`section-${id}`} className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
    {children}
  </section>
);

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
                <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                  <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
                </Button>
              </Link>
            </div>
          ) : null}
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-3 rounded-xl">
              <HeaderIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">{title}</h1>
              {subtitle ? <p className="text-lime-200 text-lg">{subtitle}</p> : null}
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
                  const isActive = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-green-500/20 to-cyan-500/20 text-white border-l-2 border-cyan-400'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
      </div>
    </>
  );
};

export default HelpGuideShell;
