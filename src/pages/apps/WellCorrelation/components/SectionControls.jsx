// Section controls (Well Correlation G3.2 right dock): datum mode +
// flatten-on-top pick, correlation-line visibility toggles, zone-fill
// pair, and top propagation across the section. Presentational — the
// controller owns state and persistence.

import React, { useState } from 'react';

const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const inputCls = selCls;

export default function SectionControls({
  topNames, datum, onDatum, shownTops, onToggleTop,
  zonePair, onZonePair, onPropagate, canEdit,
}) {
  const [propName, setPropName] = useState(topNames[0] || '');
  const [propMd, setPropMd] = useState('');

  return (
    <div className="p-2 space-y-3 text-xs" data-testid="corr-controls">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Datum</div>
        <div className="flex items-center gap-1.5">
          <select className={selCls} value={datum.mode} data-testid="corr-datum-mode"
            onChange={(e) => onDatum(e.target.value === 'flatten'
              ? { mode: 'flatten', topName: datum.topName || topNames[0], datumM: datum.datumM ?? 1500 }
              : { mode: 'structural' })}>
            <option value="structural">Structural (true depth)</option>
            <option value="flatten">Flatten on top</option>
          </select>
          {datum.mode === 'flatten' && (
            <>
              <select className={selCls} value={datum.topName} data-testid="corr-datum-top"
                onChange={(e) => onDatum({ ...datum, topName: e.target.value })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <input className={`${inputCls} w-16`} value={datum.datumM} data-testid="corr-datum-depth"
                title="Datum depth (m)" onChange={(e) => onDatum({ ...datum, datumM: Number(e.target.value) })} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Correlation lines</div>
        <div className="space-y-0.5">
          {topNames.map((n) => (
            <label key={n} className="flex items-center gap-1.5" data-testid={`corr-toggle-${n}`}>
              <input type="checkbox" checked={shownTops.includes(n)} onChange={() => onToggleTop(n)} />
              <span className="text-slate-300">{n}</span>
            </label>
          ))}
          {!topNames.length && <p className="text-slate-600">No tops in the section yet.</p>}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Zone fill</div>
        <div className="flex items-center gap-1">
          <select className={selCls} value={zonePair?.[0] || ''} data-testid="corr-zone-top"
            onChange={(e) => onZonePair(e.target.value ? [e.target.value, zonePair?.[1] || topNames[1] || ''] : null)}>
            <option value="">—</option>
            {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-slate-500">to</span>
          <select className={selCls} value={zonePair?.[1] || ''} data-testid="corr-zone-base"
            onChange={(e) => onZonePair(zonePair?.[0] && e.target.value ? [zonePair[0], e.target.value] : zonePair)}>
            <option value="">—</option>
            {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {canEdit && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Propagate top</div>
          <div className="flex items-center gap-1">
            <input className={`${inputCls} flex-1`} placeholder="Top name" value={propName}
              data-testid="corr-prop-name" onChange={(e) => setPropName(e.target.value)} list="corr-topnames" />
            <datalist id="corr-topnames">{topNames.map((n) => <option key={n} value={n} />)}</datalist>
            <input className={`${inputCls} w-16`} placeholder="MD m" value={propMd}
              data-testid="corr-prop-md" onChange={(e) => setPropMd(e.target.value)} />
            <button type="button" data-testid="corr-prop-run"
              className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={() => onPropagate(propName.trim(), Number(propMd))}>
              Add
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-600">Seeds the top on every owned well in the section at that MD — drag each to correct.</p>
        </div>
      )}
    </div>
  );
}
