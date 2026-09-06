// QC & volumes view (Earth Modeling G8.2): the numbers behind the
// model, never silent — well-tie residuals, clamp report, population
// provenance (incl. every fallback), and the per-zone per-block volume
// tables. Tabular workstation surface; volumes in 10^6 m3 (SI
// internal; fluids/contacts stay in ReservoirCalc Pro).

import React from 'react';
import { fmtVolume, volumeUnitLabel, fmtDepth } from '../services/units';

const th = 'px-2 py-1 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium';
const td = 'px-2 py-1 text-xs text-slate-300 whitespace-nowrap';
const card = 'rounded border border-slate-800 bg-slate-900/60';


export default function QcPanel({ built, surfaceNames = [], depthUnit = 'm', volumeUnits = 'metric' }) {
  const u = depthUnit;
  const vu = (col) => volumeUnitLabel(col, volumeUnits);
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

      {built.adjustment && (
        <div className={card} data-testid="em-adjust-report">
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">
            Well adjustment: radius {fmtDepth(built.adjustment.radius, u, 0)} {u}
          </div>
          <table className="w-full">
            <thead><tr><th className={th}>Surface</th><th className={th}>Ties</th><th className={th}>Max residual before ({u})</th><th className={th}>After ({u})</th></tr></thead>
            <tbody>
              {built.adjustment.report.map((r) => (
                <tr key={r.surface} className="border-t border-slate-800/60">
                  <td className={td}>{surfaceNames[r.surface] || `Surface ${r.surface + 1}`}</td>
                  <td className={td}>{r.ties}</td>
                  <td className={td}>{fmtDepth(r.before, u, 2)}</td>
                  <td className={td} data-testid={`em-adjust-after-${r.surface}`}>{r.adjusted ? fmtDepth(r.after, u, 2) : 'not adjusted'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={card}>
        <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">
          Well ties: residual = pick TVDSS minus surface ({u}); positive means the pick is deeper than the surface
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Well</th><th className={th}>Top</th><th className={th}>MD ({u})</th>
              <th className={th}>TVDSS ({u})</th><th className={th}>Surface z ({u})</th>
              {built.adjustment && <th className={th}>Before ({u})</th>}
              <th className={th} data-testid="em-ties-unit">Residual ({u})</th>
            </tr>
          </thead>
          <tbody data-testid="em-ties">
            {built.ties.map((t) => (
              <tr key={`${t.well}-${t.top}`} className="border-t border-slate-800/60">
                <td className={td}>{t.well}</td>
                <td className={td}>{t.top}</td>
                <td className={td}>{fmtDepth(t.md, u, 1)}</td>
                <td className={td}>{fmtDepth(t.tvdss, u, 2)}</td>
                <td className={td}>{t.surfaceZ === null ? 'off grid' : fmtDepth(t.surfaceZ, u, 2)}</td>
                {built.adjustment && <td className={td}>{t.residualBeforeM === undefined || t.residualBeforeM === null ? '—' : fmtDepth(t.residualBeforeM, u, 2)}</td>}
                <td className={`${td} ${t.residualM !== null && Math.abs(t.residualM) > 10 ? 'text-amber-400' : ''}`}
                  data-testid={`em-tie-${t.well}-${t.top}`}>
                  {t.residualM === null ? '—' : fmtDepth(t.residualM, u, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {built.zones.map((zone) => (
        <div className={card} key={zone.name}>
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-200 border-b border-slate-800">
            {zone.name}: volumes and population provenance
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Block</th><th className={th}>Cells</th><th className={th} data-testid="em-vol-unit-bulk">Bulk ({vu('bulk_m3')})</th>
                <th className={th}>Net ({vu('net_m3')})</th><th className={th}>Pore ({vu('pore_m3')})</th><th className={th} data-testid="em-vol-unit-hcpv">HCPV ({vu('hcpv_m3')})</th>
              </tr>
            </thead>
            <tbody data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              {blockKeys.filter((k) => zone.volumes[k]).map((k) => (
                <tr key={k} className={`border-t border-slate-800/60 ${k === 'total' ? 'font-semibold text-slate-100' : ''}`}>
                  <td className={td}>{k === 'total' ? 'TOTAL' : `Block ${k}`}</td>
                  <td className={td}>{zone.volumes[k].cells}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-bulk`}>{fmtVolume(zone.volumes[k].bulk_m3, 'bulk_m3', volumeUnits)}</td>
                  <td className={td}>{fmtVolume(zone.volumes[k].net_m3, 'net_m3', volumeUnits)}</td>
                  <td className={td}>{fmtVolume(zone.volumes[k].pore_m3, 'pore_m3', volumeUnits)}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-hcpv`}>{fmtVolume(zone.volumes[k].hcpv_m3, 'hcpv_m3', volumeUnits)}</td>
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
