// Shared primitives for the ReservoirCalc Pro documentation articles.
//
// Articles render inside DocumentationHub's article container (role classes) and
// receive no props, so each is a zero-prop default export built from these.
//
// Copy rule: no em dashes and no "X, not Y" contrastives in user-facing text.

import React from 'react';

export const Article = ({ title, lead, children }) => (
  <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-bold text-pl-text mb-1">{title}</h1>
      {lead ? <p className="text-pl-muted text-sm leading-relaxed m-0">{lead}</p> : null}
    </div>
    {children}
  </div>
);

export const H2 = ({ children }) => (
  <h2 className="text-lg font-semibold text-pl-text mt-6 mb-2">{children}</h2>
);

export const H3 = ({ children }) => (
  <h3 className="text-sm font-semibold text-pl-text mt-4 mb-1">{children}</h3>
);

export const P = ({ children }) => (
  <p className="text-pl-text text-sm leading-relaxed mb-3">{children}</p>
);

export const UL = ({ children }) => (
  <ul className="list-disc pl-6 space-y-2 text-pl-text text-sm mb-3">{children}</ul>
);

export const OL = ({ children }) => (
  <ol className="list-decimal pl-6 space-y-2 text-pl-text text-sm mb-3">{children}</ol>
);

export const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-pl-sunken text-pl-text text-xs font-pl-mono">{children}</code>
);

export const Formula = ({ children }) => (
  <div className="my-3 px-3 py-2 rounded bg-pl-sunken border border-pl-border text-pl-text font-pl-mono text-xs overflow-x-auto">
    {children}
  </div>
);

export const Note = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-pl-info-bg border-pl-info/40 text-pl-info-text',
    warn: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
    danger: 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text',
    success: 'bg-pl-success-bg border-pl-success/40 text-pl-success-text',
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
    <table className="min-w-full text-xs border border-pl-border">
      <thead className="bg-pl-sunken">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-2 py-1.5 text-left text-pl-muted font-semibold border-b border-pl-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? 'bg-pl-sunken' : ''}>
            {r.map((c, j) => (
              <td key={j} className="px-2 py-1.5 text-pl-text border-b border-pl-border align-top">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
