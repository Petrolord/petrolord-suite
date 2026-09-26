// Map-versus-well residuals (Mapping T1 enhancement E5, 2026-09-26): the
// QC every serious mapper reads after a grid or a depth conversion. One
// row per well: the well's value, the map's value at the well, and the
// mis-tie (well minus map; positive when the well came in shallower).

import React from 'react';

export default function ResidualTable({ title, rows, stats, fmt, fmtLen }) {
  if (!rows?.length) return null;
  const worst = stats?.maxAbs ?? 0;
  return (
    <div className="pt-2 border-t border-slate-800/60" data-testid="map-residuals">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{title}</div>
      <table className="w-full text-[11px] text-slate-300">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-normal">Well</th>
            <th className="text-right font-normal">Well</th>
            <th className="text-right font-normal">Map</th>
            <th className="text-right font-normal">Mis-tie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.well} data-testid={`map-residual-${r.well}`}>
              <td className="truncate max-w-[70px]">{r.well}</td>
              <td className="text-right">{fmt(r.wellZ)}</td>
              <td className="text-right">{r.mapZ == null ? 'off map' : fmt(r.mapZ)}</td>
              <td className={`text-right ${r.residualM != null && Math.abs(r.residualM) > 0.5 && Math.abs(r.residualM) >= worst * 0.999 ? 'text-amber-300' : ''}`}>
                {r.residualM == null ? '' : fmtLen(r.residualM)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats?.count > 0 && (
        <p className="text-[10px] text-slate-500 mt-1" data-testid="map-residual-stats">
          {stats.count} well{stats.count === 1 ? '' : 's'}: mean {fmtLen(stats.mean)}, RMS {fmtLen(stats.rms)}, worst {fmtLen(stats.maxAbs)}.
        </p>
      )}
    </div>
  );
}
