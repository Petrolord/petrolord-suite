// NCT view: measured transit time vs depth with the current normal-
// compaction trend overlaid, shale picks as dots, deterministic pick
// entry (depth input — the sonic value comes from the nearest sample)
// and the exact log-transform fit that writes dt_ml / c back into the
// method parameters. White chartTheme + ChartLogo.

import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  autoShalePicks, picksInSand, fitSegments, grCutoff, DEFAULT_VSH_CUTOFF,
} from '../services/shalePicks';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { fitNct } from '../engine/nct';
import { fitResistivityNct } from '../engine/resistivity';
import { thinIndices } from '../services/thin';
import {
  depthToDisplay, depthFromDisplay, slownessToDisplay, slownessUnit, compactionToDisplay, compactionUnit,
} from '../services/units';

/** Log-axis ticks: 1, 1.5, 2, 3, 5, 7 x 10^k inside [lo, hi]. */
export function logTicks(lo, hi) {
  if (!(lo > 0) || !(hi > lo)) return undefined;
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 1.5, 2, 3, 5, 7]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(Number(v.toPrecision(6))); }
  }
  return out.length >= 2 ? out : undefined;
}

export default function NctPanel({
  input, profile, params, picks, onPicksChange, onNctFitted, onResNctFitted = null, onSegmentsFitted = null, onSegmentsChange = null,
  shaleName = null, shaleKind = null, byRes = false, depthUnit = 'm',
}) {
  const [pickDepth, setPickDepth] = useState('');
  const [fitError, setFitError] = useState(null);
  // U2-005: the trade reads the trend on a semi-log axis (on by default)
  const [logAxis, setLogAxis] = useState(true);
  const hasShale = Array.isArray(input?.shale);
  const defaultCut = shaleKind === 'gr' && hasShale ? grCutoff(input.shale) : DEFAULT_VSH_CUTOFF;
  const [cutText, setCutText] = useState('');
  const cutoff = cutText === '' ? defaultCut : Number(cutText);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [everyText, setEveryText] = useState('');
  const [breakText, setBreakText] = useState('');
  const segments = params.nctSegments || [];
  const zU = depthUnit;
  const sU = slownessUnit(zU);
  // U2-001: with resistivity Eaton the trend is the shale resistivity
  // (log-linear, on a log axis); picks carry their trend
  const trend = byRes && input?.resOhmM ? 'res' : 'dt';
  const myPicks = picks.filter((p) => (p.trend === 'res' ? 'res' : 'dt') === trend);

  // chart rows in the display units (picks and the trend stay SI)
  const data = useMemo(() => {
    if (!input) return [];
    const rows = thinIndices(input.zBmlM.length).map((i) => (trend === 'res'
      ? {
        z: depthToDisplay(input.zBmlM[i], zU),
        dt: input.resOhmM[i],
        dtn: profile?.resNormalOhmM ? profile.resNormalOhmM[i] : undefined,
      }
      : {
        z: depthToDisplay(input.zBmlM[i], zU),
        dt: input.dtUsPerM[i] == null ? undefined : slownessToDisplay(input.dtUsPerM[i], zU),
        dtn: profile ? slownessToDisplay(profile.dtNormalUsPerM[i], zU) : undefined,
      }));
    for (const p of myPicks) rows.push({ z: depthToDisplay(p.z, zU), pick: trend === 'res' ? p.r : slownessToDisplay(p.dt, zU) });
    rows.sort((a, b) => a.z - b.z);
    return rows;
  }, [input, profile, myPicks, zU, trend]);

  const addPick = () => {
    const z = depthFromDisplay(Number(pickDepth), zU);
    if (!Number.isFinite(z) || !input) return;
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) {
      if (Math.abs(input.zBmlM[i] - z) < Math.abs(input.zBmlM[best] - z)) best = i;
    }
    const pick = trend === 'res'
      ? { z: input.zBmlM[best], r: input.resOhmM[best], trend: 'res' }
      : { z: input.zBmlM[best], dt: input.dtUsPerM[best] };
    if (trend === 'dt' && !(pick.dt > 0)) { setFitError('No sonic at that depth.'); return; }
    if (!myPicks.some((p) => p.z === pick.z)) onPicksChange([...picks, pick]);
    setPickDepth('');
  };

  const runFit = () => {
    setFitError(null);
    try {
      if (trend === 'res') {
        onResNctFitted(fitResistivityNct(myPicks.map((p) => p.z), myPicks.map((p) => p.r)));
        return;
      }
      if (onSegmentsFitted) {
        const r = fitSegments(myPicks, params.nct, segments);
        if (!r.fitted.length) throw new Error('Each trend needs at least two picks inside it.');
        onSegmentsFitted(r);
        return;
      }
      const fit = fitNct(myPicks.map((p) => p.z), myPicks.map((p) => p.dt), params.nct.dtMaUsPerM);
      onNctFitted(fit);
    } catch (e) {
      setFitError(e.message);
    }
  };

  const zMaxM = input?.zBmlM?.length ? input.zBmlM[input.zBmlM.length - 1] : 0;
  const autoPick = () => {
    setFitError(null);
    try {
      const fromM = fromText === '' ? 0 : depthFromDisplay(Number(fromText), zU);
      const toM = toText === '' ? zMaxM : depthFromDisplay(Number(toText), zU);
      const everyM = everyText === '' ? 50 : depthFromDisplay(Number(everyText), zU);
      const got = autoShalePicks(input, { trend, cutoff, fromM, toM, everyM });
      if (!got.length) { setFitError('No sample at or above the shale cutoff in that interval.'); return; }
      onPicksChange([...picks.filter((p) => !myPicks.includes(p)), ...got]);
    } catch (e) { setFitError(e.message); }
  };
  const inSand = hasShale && Number.isFinite(cutoff) ? picksInSand(myPicks, input, cutoff) : [];
  const addBreak = () => {
    const z = depthFromDisplay(Number(breakText), zU);
    if (!(z > 0) || segments.some((g) => Math.abs(g.zTopM - z) < 1e-6)) { setFitError('A trend break needs a new depth below the mudline.'); return; }
    onSegmentsChange?.([...segments, { zTopM: z, dtMlUsPerM: params.nct.dtMlUsPerM, cPerM: params.nct.cPerM }].sort((a, b) => a.zTopM - b.zTopM));
    setBreakText('');
  };
  const xVals = data.flatMap((r) => [r.dt, r.dtn, r.pick]).filter((v) => v > 0);
  const xLo = xVals.length ? Math.min(...xVals) * 0.95 : 1;
  const xHi = xVals.length ? Math.max(...xVals) * 1.05 : 10;
  const ticks = logAxis && xVals.length ? logTicks(xLo, xHi) : undefined;
  const inField = 'w-16 px-1.5 py-0.5 rounded bg-pl-surface border border-pl-border-strong text-pl-text';

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-pl-text" data-testid="pp-nct-shale">
        <label className="flex items-center gap-1 text-pl-muted">
          <input type="checkbox" data-testid="pp-nct-logaxis" checked={logAxis} onChange={(e) => setLogAxis(e.target.checked)} /> Log axis
        </label>
        {hasShale ? (
          <>
            <span className="text-pl-muted">Shale picks on {shaleName} at or above</span>
            <input data-testid="pp-shale-cutoff" className={inField} value={cutText} placeholder={Number.isFinite(defaultCut) ? String(Number(defaultCut.toFixed(shaleKind === 'gr' ? 0 : 2))) : ''} onChange={(e) => setCutText(e.target.value)} />
            <span className="text-pl-muted">{shaleKind === 'gr' ? 'API' : 'v/v'} from</span>
            <input data-testid="pp-shale-from" className={inField} value={fromText} placeholder="0" onChange={(e) => setFromText(e.target.value)} />
            <span className="text-pl-muted">to</span>
            <input data-testid="pp-shale-to" className={inField} value={toText} placeholder={depthToDisplay(zMaxM, zU).toFixed(0)} onChange={(e) => setToText(e.target.value)} />
            <span className="text-pl-muted">{zU} bml, one per</span>
            <input data-testid="pp-shale-every" className={inField} value={everyText} placeholder={zU === 'ft' ? '164' : '50'} onChange={(e) => setEveryText(e.target.value)} />
            <span className="text-pl-muted">{zU}</span>
            <button type="button" data-testid="pp-auto-pick" onClick={autoPick} className="px-2 py-0.5 rounded border border-pl-border hover:bg-pl-sunken">Pick shales</button>
            {inSand.length > 0 && <span className="text-pl-warning-text" data-testid="pp-picks-in-sand">{inSand.length} pick{inSand.length === 1 ? '' : 's'} in sand ({shaleName} below the cutoff)</span>}
          </>
        ) : (
          <span className="text-pl-muted" data-testid="pp-no-shale">No VSH or GR on this source: picks are not filtered by shale.</span>
        )}
        {trend === 'dt' && onSegmentsChange && (
          <>
            <span className="text-pl-muted ml-2">Trend break at</span>
            <input data-testid="pp-break-depth" className={inField} value={breakText} onChange={(e) => setBreakText(e.target.value)} />
            <span className="text-pl-muted">{zU} bml</span>
            <button type="button" data-testid="pp-add-break" onClick={addBreak} className="px-2 py-0.5 rounded border border-pl-border hover:bg-pl-sunken">Add</button>
            {segments.map((g, k) => (
              <button key={g.zTopM} type="button" data-testid={`pp-break-${k}`} title="Remove this break"
                onClick={() => onSegmentsChange(segments.filter((x) => x !== g))}
                className="px-1.5 rounded border border-pl-border text-pl-muted hover:text-pl-text">
                {depthToDisplay(g.zTopM, zU).toFixed(0)} {zU} x
              </button>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-pl-text">
        <label htmlFor="pp-pick-depth" className="text-pl-muted">Shale pick at depth ({zU} bml)</label>
        <input
          id="pp-pick-depth"
          data-testid="pp-pick-depth"
          className="w-24 px-2 py-1 rounded bg-pl-surface border border-pl-border-strong text-pl-text"
          value={pickDepth}
          onChange={(e) => setPickDepth(e.target.value)}
        />
        <button
          type="button"
          data-testid="pp-add-pick"
          className="px-2 py-1 rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
          onClick={addPick}
        >
          Add pick
        </button>
        <button
          type="button"
          data-testid="pp-fit-nct"
          disabled={myPicks.length < 2}
          className="px-2 py-1 rounded border border-pl-primary text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40"
          onClick={runFit}
        >
          {trend === 'res' ? 'Fit resistivity trend' : 'Fit NCT'} ({myPicks.length} picks)
        </button>
        {myPicks.length > 0 && (
          <button
            type="button"
            data-testid="pp-clear-picks"
            className="px-2 py-1 rounded border border-pl-border text-pl-muted hover:bg-pl-sunken"
            onClick={() => onPicksChange(picks.filter((p) => !myPicks.includes(p)))}
          >
            Clear
          </button>
        )}
        {fitError && <span className="text-pl-warning-text">{fitError}</span>}
        <span className="ml-auto text-pl-muted" data-testid="pp-nct-current">
          {trend === 'res'
            ? `R0 ${Number(params.resNct?.r0OhmM).toFixed(3)} ohm.m · b ${compactionToDisplay(params.resNct?.bPerM, zU).toExponential(3)} ${compactionUnit(zU)}`
            : `dt_ml ${slownessToDisplay(params.nct.dtMlUsPerM, zU).toFixed(2)} ${sU} · c ${compactionToDisplay(params.nct.cPerM, zU).toExponential(3)} ${compactionUnit(zU)}`}
        </span>
      </div>
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-300 p-4 relative" data-canvas="chart" data-testid="pp-nct-chart" data-trend={trend} data-log={logAxis ? 'true' : 'false'} data-picks={myPicks.length}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} layout="vertical" margin={CHART_MARGINS.standard}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              type="number"
              scale={logAxis ? 'log' : 'auto'}
              domain={logAxis ? [xLo, xHi] : ['auto', 'auto']}
              ticks={ticks}
              allowDataOverflow={false}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: `${trend === 'res' ? 'Shale resistivity (ohm.m' : `Transit time (${sU}`}${logAxis ? ', log' : ''})`, position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            {/* vertical layout already runs the numeric Y axis top-down (T1-001) */}
            <YAxis
              type="number"
              dataKey="z"
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: `Depth (${zU} below mudline)`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Line dataKey="dt" name={trend === 'res' ? 'Resistivity' : 'Sonic'} stroke="#456990" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
            <Line dataKey="dtn" name="Normal trend" stroke="#2a9d8f" dot={false} strokeWidth={1.5} strokeDasharray="6 3" connectNulls isAnimationActive={false} />
            {/* PP-U1-014: a Scatter does not plot in a vertical-layout chart (T1-002);
                a dot-only Line does, with no legend entry until there is a pick */}
            {myPicks.length > 0 && <Line dataKey="pick" name="Shale picks" stroke="none" legendType="circle"
              dot={{ r: 4, fill: '#e76f51', stroke: '#9a3412' }} activeDot={false} isAnimationActive={false} />}
            {trend === 'dt' && segments.map((g, k) => (
              <ReferenceLine key={`brk-${k}`} y={depthToDisplay(g.zTopM, zU)} stroke="#334155" strokeDasharray="4 3"
                label={{ value: 'Trend break', position: 'insideTopRight', fill: '#334155', fontSize: 10 }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <ChartLogo />
      </div>
    </div>
  );
}
