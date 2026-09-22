// DLS colour legend shared by the section and plan views: the
// sequential ramp from 0 to the plan's Max DLS (design settings), and
// the over-max flag drawn heavier and red so it reads without colour.

import React from 'react';
import { dlsLegendBins } from '../services/sectionScale';

const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

const DlsLegend = ({ scale, className = '' }) => {
  if (!scale) return null;
  const { top, hasMax, bins } = dlsLegendBins(scale);
  return (
    <div className={`rounded border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-700 shadow-sm ${className}`}
      data-testid="dls-legend">
      <div className="mb-0.5 font-semibold">DLS ({scale.unitLabel || 'deg/30m'})</div>
      {bins.map((b) => (
        <div key={`${b.from}-${b.over}`} className="flex items-center gap-1.5 leading-tight">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="1" y1="3" x2="17" y2="3" stroke={b.color} strokeWidth={b.over ? 4 : 2.5} strokeLinecap="round" />
          </svg>
          <span>
            {b.over
              ? `above max ${fmt(top)} (flagged)`
              : `${fmt(b.from)} to ${fmt(b.to)}`}
          </span>
        </div>
      ))}
      {!hasMax && (
        <div className="mt-0.5 text-slate-500">No Max DLS set: scale runs to the plan maximum.</div>
      )}
    </div>
  );
};

export default DlsLegend;
