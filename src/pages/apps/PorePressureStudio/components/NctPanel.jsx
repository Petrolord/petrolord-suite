// NCT view: measured transit time vs depth with the current normal-
// compaction trend overlaid, shale picks as dots, deterministic pick
// entry (depth input — the sonic value comes from the nearest sample)
// and the exact log-transform fit that writes dt_ml / c back into the
// method parameters. White chartTheme + ChartLogo.

import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { fitNct } from '../engine/nct';

export default function NctPanel({ input, profile, params, picks, onPicksChange, onNctFitted }) {
  const [pickDepth, setPickDepth] = useState('');
  const [fitError, setFitError] = useState(null);

  const data = useMemo(() => {
    if (!input) return [];
    const rows = input.zBmlM.map((z, i) => ({
      z,
      dt: input.dtUsPerM[i],
      dtn: profile ? profile.dtNormalUsPerM[i] : undefined,
    }));
    for (const p of picks) rows.push({ z: p.z, pick: p.dt });
    rows.sort((a, b) => a.z - b.z);
    return rows;
  }, [input, profile, picks]);

  const addPick = () => {
    const z = Number(pickDepth);
    if (!Number.isFinite(z) || !input) return;
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) {
      if (Math.abs(input.zBmlM[i] - z) < Math.abs(input.zBmlM[best] - z)) best = i;
    }
    const pick = { z: input.zBmlM[best], dt: input.dtUsPerM[best] };
    if (!picks.some((p) => p.z === pick.z)) onPicksChange([...picks, pick]);
    setPickDepth('');
  };

  const runFit = () => {
    setFitError(null);
    try {
      const fit = fitNct(picks.map((p) => p.z), picks.map((p) => p.dt), params.nct.dtMaUsPerM);
      onNctFitted(fit);
    } catch (e) {
      setFitError(e.message);
    }
  };

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <label htmlFor="pp-pick-depth" className="text-slate-400">Shale pick at depth (m bml)</label>
        <input
          id="pp-pick-depth"
          data-testid="pp-pick-depth"
          className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200"
          value={pickDepth}
          onChange={(e) => setPickDepth(e.target.value)}
        />
        <button
          type="button"
          data-testid="pp-add-pick"
          className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={addPick}
        >
          Add pick
        </button>
        <button
          type="button"
          data-testid="pp-fit-nct"
          disabled={picks.length < 2}
          className="px-2 py-1 rounded border border-cyan-700 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
          onClick={runFit}
        >
          Fit NCT ({picks.length} picks)
        </button>
        {picks.length > 0 && (
          <button
            type="button"
            data-testid="pp-clear-picks"
            className="px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800"
            onClick={() => onPicksChange([])}
          >
            Clear
          </button>
        )}
        {fitError && <span className="text-amber-400">{fitError}</span>}
        <span className="ml-auto text-slate-500" data-testid="pp-nct-current">
          dt_ml {params.nct.dtMlUsPerM.toFixed(2)} us/m · c {params.nct.cPerM.toExponential(3)} 1/m
        </span>
      </div>
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-300 p-4 relative" data-testid="pp-nct-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} layout="vertical" margin={CHART_MARGINS.standard}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              type="number"
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: 'Transit time (us/m)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <YAxis
              type="number"
              dataKey="z"
              reversed
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: 'Depth (m below mudline)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Line dataKey="dt" name="Sonic" stroke="#456990" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
            <Line dataKey="dtn" name="Normal trend" stroke="#2a9d8f" dot={false} strokeWidth={1.5} strokeDasharray="6 3" connectNulls isAnimationActive={false} />
            <Scatter dataKey="pick" name="Shale picks" fill="#e76f51" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <ChartLogo />
      </div>
    </div>
  );
}
