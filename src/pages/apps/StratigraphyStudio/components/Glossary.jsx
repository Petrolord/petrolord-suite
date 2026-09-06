// Vocabulary legend and glossary (Stratigraphy Studio ST0). Renders from
// the engine's legend(scheme): every surface type with its marker style
// and both names, the systems tracts with their fill colours, the log
// motifs. Where the chosen scheme has no term the Catuneanu name shows
// with a badge, which is the visible proof that Exxon is display-only.

import React, { useMemo } from 'react';
import { legend } from '@/lib/stratigraphy/vocabulary';

/** A short line drawn with the surface type's dash pattern and width. */
export function StyleSwatch({ style, colour = '#e2e8f0', width = 64 }) {
  return (
    <svg width={width} height={10} className="shrink-0" aria-hidden="true">
      <line x1={0} y1={5} x2={width} y2={5} stroke={colour} strokeWidth={style.width} strokeDasharray={style.dash.length ? style.dash.join(' ') : undefined} />
    </svg>
  );
}

export function FallbackBadge({ code }) {
  return (
    <span data-testid={`strat-fallback-${code}`} title="The chosen scheme has no term for this; the Catuneanu name is shown"
      className="ml-1 inline-block px-1 rounded bg-amber-500/20 text-amber-300 text-[10px] align-middle">Catuneanu</span>
  );
}

/**
 * @param {Object} p
 * @param {'catuneanu'|'exxon'} p.scheme
 * @param {boolean} [p.compact] dock mode: surfaces only, one line each
 */
export default function Glossary({ scheme, compact = false }) {
  const L = useMemo(() => legend(scheme), [scheme]);
  if (compact) {
    return (
      <div className="p-2 space-y-1 text-[11px]" data-testid="strat-legend">
        <div className="text-slate-400 font-medium mb-1">Surface types ({scheme === 'exxon' ? 'Exxon display' : 'Catuneanu'})</div>
        {L.surfaces.map((s) => (
          <div key={s.code} className="flex items-center gap-2" data-testid={`strat-legend-${s.code}`}>
            <StyleSwatch style={s.style} width={40} />
            <span className="text-slate-200 w-14 shrink-0">{s.abbrev}</span>
            <span className="text-slate-400 truncate" title={s.description}>{s.label}</span>
            {s.fallback && <FallbackBadge code={s.code} />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="p-4 space-y-6 text-xs max-w-4xl" data-testid="strat-glossary">
      <section>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Surface types</h3>
        <p className="text-slate-400 mb-2">
          Stored in the Catuneanu scheme. The display option relabels them; it never changes what is stored.
          {scheme === 'exxon' ? ' Exxon labels are shown; where Exxon has no term the Catuneanu name carries a badge.' : ''}
        </p>
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left font-medium text-slate-500 pr-3 pb-1">Marker</th>
              <th className="text-left font-medium text-slate-500 pr-3 pb-1">Code</th>
              <th className="text-left font-medium text-slate-500 pr-3 pb-1">{scheme === 'exxon' ? 'Exxon label' : 'Name'}</th>
              {scheme === 'exxon' && <th className="text-left font-medium text-slate-500 pr-3 pb-1">Catuneanu</th>}
              <th className="text-left font-medium text-slate-500 pr-3 pb-1">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {L.surfaces.map((s) => (
              <tr key={s.code} data-testid={`strat-glossary-${s.code}`} className="align-top">
                <td className="pr-3 py-1"><StyleSwatch style={s.style} /></td>
                <td className="pr-3 py-1 text-slate-200 font-mono">{s.code}</td>
                <td className="pr-3 py-1 text-slate-100">{s.label}{s.fallback && <FallbackBadge code={s.code} />}</td>
                {scheme === 'exxon' && <td className="pr-3 py-1 text-slate-400">{s.catuneanu}</td>}
                <td className="py-1 text-slate-400 max-w-md">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Systems tracts</h3>
        <table className="text-xs">
          <tbody>
            {L.tracts.map((t) => (
              <tr key={t.code} data-testid={`strat-glossary-${t.code}`} className="align-top">
                <td className="pr-3 py-1"><span className="inline-block w-6 h-3 rounded-sm" style={{ background: t.colour }} /></td>
                <td className="pr-3 py-1 text-slate-200 font-mono">{t.code}</td>
                <td className="pr-3 py-1 text-slate-100">{t.label}{t.fallback && <FallbackBadge code={t.code} />}</td>
                {scheme === 'exxon' && <td className="pr-3 py-1 text-slate-400">{t.catuneanu}</td>}
                <td className="py-1 text-slate-400 max-w-md">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Log motifs</h3>
        <table className="text-xs">
          <tbody>
            {L.motifs.map((m) => (
              <tr key={m.code} className="align-top">
                <td className="pr-3 py-1 text-slate-200 font-mono">{m.code}</td>
                <td className="pr-3 py-1 text-slate-100">{m.label}</td>
                <td className="py-1 text-slate-400 max-w-md">{m.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-slate-500">
        References: Catuneanu, O. (2006) Principles of Sequence Stratigraphy; Catuneanu et al. (2009) Towards the standardization of
        sequence stratigraphy, Earth-Science Reviews 92; Van Wagoner et al. (1988, 1990) for the Exxon terms.
      </p>
    </div>
  );
}
