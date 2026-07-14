// QC & volumes view (Earth Modeling G8.2): the numbers behind the
// model, never silent — well-tie residuals, clamp report, population
// provenance (incl. every fallback), and the per-zone per-block volume
// tables. Tabular workstation surface; volumes in 10^6 m3 (SI
// internal; fluids/contacts stay in ReservoirCalc Pro).

import React from 'react';

const th = 'px-2 py-1 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium';
const td = 'px-2 py-1 text-xs text-slate-300 whitespace-nowrap';
const card = 'rounded border border-slate-800 bg-slate-900/60';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fmtM = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(3) : '—');

export default function QcPanel({ built, surfaceNames = [] }) {
  if (!built) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="em-qc-empty">
        Build the model to see QC and volumes.
      </div>
    );
  }
  const blockKeys = Object.keys(built.zones[0]?.volumes || { total: 1 })
    .sort((a, b) => (a === 'total' ? 1 : b === 'total' ? -1 : a.localeCompare(b)));

  return (
    <div className="h-full overflow-auto p-3 space-y-3" data-testid="em-qc">
      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">Clamp report (stacking rule: depth-down monotonic)</div>
          <table className="w-full">
            <thead><tr><th className={th}>Surface</th><th className={th}>Clamped nodes</th></tr></thead>
            <tbody data-testid="em-clamps">
              {built.counts.map((c, i) => (
                <tr key={i} className="border-t border-slate-800/60">
                  <td className={td}>{surfaceNames[i] || `Surface ${i + 1}`}</td>
                  <td className={td} data-testid={`em-clamp-${i}`}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={card}>
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">Fault blocks</div>
          <table className="w-full">
            <thead><tr><th className={th}>Block</th><th className={th}>Nodes</th></tr></thead>
            <tbody data-testid="em-census">
              {Object.entries(built.census).map(([lab, n]) => (
                <tr key={lab} className="border-t border-slate-800/60">
                  <td className={td}>{lab === '0' || lab === 0 ? 'Block 0 (outside polygons)' : `Block ${lab}`}</td>
                  <td className={td} data-testid={`em-census-${lab}`}>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">
          Well ties — residual = pick TVDSS − surface (m); positive ⇒ pick deeper than surface
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Well</th><th className={th}>Top</th><th className={th}>MD (m)</th>
              <th className={th}>TVDSS (m)</th><th className={th}>Surface z (m)</th><th className={th}>Residual (m)</th>
            </tr>
          </thead>
          <tbody data-testid="em-ties">
            {built.ties.map((t) => (
              <tr key={`${t.well}-${t.top}`} className="border-t border-slate-800/60">
                <td className={td}>{t.well}</td>
                <td className={td}>{t.top}</td>
                <td className={td}>{fmt(t.md, 1)}</td>
                <td className={td}>{fmt(t.tvdss, 2)}</td>
                <td className={td}>{t.surfaceZ === null ? 'off grid' : fmt(t.surfaceZ, 2)}</td>
                <td className={`${td} ${t.residualM !== null && Math.abs(t.residualM) > 10 ? 'text-amber-400' : ''}`}
                  data-testid={`em-tie-${t.well}-${t.top}`}>
                  {t.residualM === null ? '—' : fmt(t.residualM, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {built.zones.map((zone) => (
        <div className={card} key={zone.name}>
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">
            {zone.name} — volumes (×10⁶ m³) and population provenance
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Block</th><th className={th}>Cells</th><th className={th}>Bulk</th>
                <th className={th}>Net</th><th className={th}>Pore</th><th className={th}>HCPV</th>
              </tr>
            </thead>
            <tbody data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              {blockKeys.filter((k) => zone.volumes[k]).map((k) => (
                <tr key={k} className={`border-t border-slate-800/60 ${k === 'total' ? 'font-semibold text-slate-100' : ''}`}>
                  <td className={td}>{k === 'total' ? 'TOTAL' : `Block ${k}`}</td>
                  <td className={td}>{zone.volumes[k].cells}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-bulk`}>{fmtM(zone.volumes[k].bulk_m3)}</td>
                  <td className={td}>{fmtM(zone.volumes[k].net_m3)}</td>
                  <td className={td}>{fmtM(zone.volumes[k].pore_m3)}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-hcpv`}>{fmtM(zone.volumes[k].hcpv_m3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1.5 text-[11px] text-slate-500 border-t border-slate-800/60">
            {Object.entries(zone.provenance).map(([prop, rows]) => (
              <span key={prop} className="mr-3">
                {prop}: {rows.map((r) => `block ${r.block} ${r.methodUsed}(${r.wells}w)${r.fellBack ? ' FELL BACK' : ''}`).join(', ')}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
