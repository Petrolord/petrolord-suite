// PPFG mud-window track (WD5): pore / fracture / overburden vs TVD
// beside the section view, in pressure (MPa) or equivalent mud weight
// (g/cc). The safe drilling window is the shaded band between PP and
// FP. Suite chart standard (white chartTheme + ChartLogo).

import React, { useState } from 'react';
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

/** rows from services/ppfg.buildMudWindow. */
const MudWindowPanel = ({ rows = [], summary = null, sourceLabel = '' }) => {
  const [mode, setMode] = useState('emw'); // emw | mpa
  const keys = mode === 'emw'
    ? { pp: 'ppEmw', fp: 'fpEmw', obg: 'obgEmw', unit: 'g/cc EMW' }
    : { pp: 'ppMpa', fp: 'fpMpa', obg: 'obgMpa', unit: 'MPa' };

  const data = rows.map((r) => ({
    ...r,
    window: r[keys.pp] != null && r[keys.fp] != null ? [r[keys.pp], r[keys.fp]] : null,
  }));

  return (
    <div className="bg-white relative flex h-full w-full min-h-0 min-w-0 flex-col" data-testid="mud-window-panel">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[11px] font-semibold text-slate-700">
          Mud window ({keys.unit} vs TVD){sourceLabel ? ` — ${sourceLabel}` : ''}
        </span>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode('emw')}
            className={`rounded px-1.5 py-0.5 text-[9px] ${mode === 'emw' ? 'bg-slate-200 text-slate-800' : 'text-slate-500'}`}>
            EMW
          </button>
          <button type="button" onClick={() => setMode('mpa')}
            className={`rounded px-1.5 py-0.5 text-[9px] ${mode === 'mpa' ? 'bg-slate-200 text-slate-800' : 'text-slate-500'}`}>
            MPa
          </button>
        </div>
      </div>
      {summary && (
        <div className="px-3 text-[9px] text-slate-500">
          TVD {summary.fromTvd.toFixed(0)}–{summary.toTvd.toFixed(0)} m;
          tightest window {summary.tightest.windowMpa.toFixed(2)} MPa at {summary.tightest.tvd.toFixed(0)} m
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
              tickFormatter={(v) => v.toFixed(mode === 'emw' ? 2 : 0)}
              label={{ value: keys.unit, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <YAxis dataKey="tvd" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
              tickFormatter={(v) => v.toFixed(0)}
              label={{ value: 'TVD (m)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v) => (Array.isArray(v)
                ? v.map((x) => x?.toFixed(2)).join(' – ')
                : (Number.isFinite(v) ? v.toFixed(2) : '--'))}
              labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} m`} />
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
