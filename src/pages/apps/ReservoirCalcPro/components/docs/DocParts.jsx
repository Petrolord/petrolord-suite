// Shared primitives for the ReservoirCalc Pro documentation articles.
//
// Articles render inside DocumentationHub's `prose prose-invert` container and
// receive no props, so each is a zero-prop default export built from these.
//
// Copy rule: no em dashes and no "X, not Y" contrastives in user-facing text.

import React from 'react';

export const Article = ({ title, lead, children }) => (
  <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
      {lead ? <p className="text-slate-400 text-sm leading-relaxed m-0">{lead}</p> : null}
    </div>
    {children}
  </div>
);

export const H2 = ({ children }) => (
  <h2 className="text-lg font-semibold text-lime-200 mt-6 mb-2">{children}</h2>
);

export const H3 = ({ children }) => (
  <h3 className="text-sm font-semibold text-slate-200 mt-4 mb-1">{children}</h3>
);

export const P = ({ children }) => (
  <p className="text-slate-300 text-sm leading-relaxed mb-3">{children}</p>
);

export const UL = ({ children }) => (
  <ul className="list-disc pl-6 space-y-2 text-slate-300 text-sm mb-3">{children}</ul>
);

export const OL = ({ children }) => (
  <ol className="list-decimal pl-6 space-y-2 text-slate-300 text-sm mb-3">{children}</ol>
);

export const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-900/70 text-cyan-200 text-xs font-mono">{children}</code>
);

export const Formula = ({ children }) => (
  <div className="my-3 px-3 py-2 rounded bg-slate-900/70 border border-white/10 text-cyan-100 font-mono text-xs overflow-x-auto">
    {children}
  </div>
);

export const Note = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-cyan-900/25 border-cyan-500/40 text-cyan-100',
    warn: 'bg-amber-900/25 border-amber-500/40 text-amber-100',
    danger: 'bg-red-900/25 border-red-500/40 text-red-100',
    success: 'bg-green-900/25 border-green-500/40 text-green-100',
  };
  return (
    <div className={`border-l-4 rounded p-3 my-3 ${tones[tone] || tones.info}`}>
      {title ? <div className="font-semibold text-sm mb-1">{title}</div> : null}
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
};

export const Table = ({ headers, rows }) => (
  <div className="my-3 overflow-x-auto">
    <table className="min-w-full text-xs border border-white/10">
      <thead className="bg-slate-800/60">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-2 py-1.5 text-left text-cyan-200 font-semibold border-b border-white/10">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-slate-800/20' : ''}>
            {r.map((c, j) => (
              <td key={j} className="px-2 py-1.5 text-slate-300 border-b border-white/5 align-top">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
