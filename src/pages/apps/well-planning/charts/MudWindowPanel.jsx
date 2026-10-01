// PPFG mud-window track (WD5): pore / fracture / overburden vs TVD
// beside the section view, in pressure (MPa) or equivalent mud weight
// (ppg or g/cc). The safe drilling window is the shaded band between PP
// and FP. Suite chart standard (white chartTheme + ChartLogo).
// PP-U1-005: ppg EMW (the driller's unit; the default on a feet wellbore),
// TVD in the wellbore's depth unit, and the curves' source and unit named.

import React, { useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

const FT = 0.3048;
const MODES = {
  ppg: { pp: 'ppPpg', fp: 'fpPpg', obg: 'obgPpg', unit: 'ppg EMW', digits: 2, label: 'ppg' },
  emw: { pp: 'ppEmw', fp: 'fpEmw', obg: 'obgEmw', unit: 'g/cc EMW', digits: 2, label: 'g/cc' },
  mpa: { pp: 'ppMpa', fp: 'fpMpa', obg: 'obgMpa', unit: 'MPa', digits: 0, label: 'MPa' },
};

/** rows from services/ppfg.buildMudWindow. */
const MudWindowPanel = ({ rows = [], summary = null, sourceLabel = '', note = null, depthUnit = 'm' }) => {
  const [mode, setMode] = useState(depthUnit === 'ft' ? 'ppg' : 'emw'); // ppg | emw | mpa
  const keys = MODES[mode] || MODES.emw;
  const dz = (m) => (depthUnit === 'ft' ? m / FT : m);

  const data = rows.map((r) => ({
    ...r,
    tvdShown: dz(r.tvd),
    window: r[keys.pp] != null && r[keys.fp] != null ? [r[keys.pp], r[keys.fp]] : null,
  }));

  return (
    <div className="bg-white relative flex h-full w-full min-h-0 min-w-0 flex-col" data-testid="mud-window-panel" data-canvas="chart">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[11px] font-semibold text-slate-700">
          Mud window ({keys.unit} vs TVD below RKB)
        </span>
        <div className="flex gap-1">
          {Object.entries(MODES).map(([k, m]) => (
            <button key={k} type="button" data-testid={`mud-window-mode-${k}`} onClick={() => setMode(k)}
              className={`rounded px-1.5 py-0.5 text-[9px] ${mode === k ? 'bg-slate-200 text-slate-800' : 'text-slate-500'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {sourceLabel && <div className="px-3 text-[9px] text-slate-500" data-testid="mud-window-source">Curves: {sourceLabel}</div>}
      {note && <div className="px-3 text-[9px] text-amber-700" data-testid="mud-window-note">{note}</div>}
      {summary && (
        <div className="px-3 text-[9px] text-slate-500" data-testid="mud-window-summary">
          TVD {dz(summary.fromTvd).toFixed(0)} to {dz(summary.toTvd).toFixed(0)} {depthUnit};
          tightest window {summary.tightest.windowMpa.toFixed(2)} MPa at {dz(summary.tightest.tvd).toFixed(0)} {depthUnit}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
              tickFormatter={(v) => v.toFixed(keys.digits)}
              label={{ value: keys.unit, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <YAxis dataKey="tvdShown" type="number" domain={['dataMin', 'dataMax']} {...axisProps}
              tickFormatter={(v) => v.toFixed(0)}
              label={{ value: `TVD (${depthUnit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v) => (Array.isArray(v)
                ? v.map((x) => (Number.isFinite(x) ? x.toFixed(2) : EMPTY_VALUE)).join(' to ')
                : (Number.isFinite(v) ? v.toFixed(2) : EMPTY_VALUE))}
              labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} ${depthUnit}`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area dataKey="window" name="Safe window" fill="#86efac" fillOpacity={0.35}
              stroke="none" isAnimationActive={false} connectNulls />
            <Line dataKey={keys.pp} name="Pore pressure" stroke="#b91c1c" strokeWidth={2}
              dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey={keys.fp} name="Fracture pressure" stroke="#1d4ed8" strokeWidth={2}
              dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey={keys.obg} name="Overburden" stroke="#57534e" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo style={{ height: 40 }} />
    </div>
  );
};

export default MudWindowPanel;
