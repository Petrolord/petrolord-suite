// Bowers unloading crossplot (AppUpgrade PP-U2-007): velocity against
// density, the loading trend fitted above the unloading top, the samples
// below it that fall under the trend (velocity reversal at near-constant
// density) marked as unloading, and V_max with the sigma max the loading
// curve gives there, ready to set Bowers unloading. White chartTheme and
// ChartLogo (the Suite chart standard).

import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { bowersCrossplot, suggestUnloadingTop } from '../services/bowersCrossplot';
import { depthToDisplay, depthFromDisplay, pressureToDisplay, stressUnit } from '../services/units';

const FT = 0.3048;

export default function CrossplotPanel({ input, params, units, onUseUnloading }) {
  const zU = units.depth; const sU = stressUnit(units.pressure);
  const suggested = useMemo(() => suggestUnloadingTop(input), [input]);
  const [topText, setTopText] = useState('');
  const [uText, setUText] = useState(params.bowers?.U != null ? String(params.bowers.U) : '3');
  const topM = topText === '' ? suggested : depthFromDisplay(Number(topText), zU);
  const A = params.bowers?.A ?? 10; const B = params.bowers?.B ?? 0.75;
  const xp = useMemo(() => (Number.isFinite(topM) ? bowersCrossplot(input, { topM, A, B, vMlFts: params.bowers?.vMlFts ?? 5000 }) : { error: 'Set the unloading top.' }), [input, topM, A, B, params.bowers?.vMlFts]);
  const vOut = (ms) => (zU === 'ft' ? ms / FT : ms);
  const vU = zU === 'ft' ? 'ft/s' : 'm/s';

  const series = useMemo(() => {
    if (xp.error) return null;
    const pick = (b) => xp.points.filter((p) => p.branch === b).map((p) => ({ rho: p.rho / 1000, v: vOut(p.v), z: depthToDisplay(p.z, zU) }));
    const rs = xp.points.map((p) => p.rho);
    const lo = Math.min(...rs); const hi = Math.max(...rs);
    const trend = Array.from({ length: 30 }, (_, k) => { const r = lo + ((hi - lo) * k) / 29; return { rho: r / 1000, v: vOut(xp.trend.at(r)) }; });
    return { loading: pick('loading'), unloading: pick('unloading'), below: pick('below'), trend };
  }, [xp, zU]); // eslint-disable-line react-hooks/exhaustive-deps

  const U = Number(uText);
  const canUse = !xp.error && xp.sigmaMaxPa > 0 && U >= 1;
  return (
    <div className="h-full flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-pl-text">
        <label htmlFor="pp-xp-top" className="text-pl-muted">Unloading top ({zU} bml)</label>
        <input id="pp-xp-top" data-testid="pp-xp-top" className="w-20 px-1.5 py-0.5 rounded bg-pl-surface border border-pl-border-strong text-pl-text"
          value={topText} placeholder={Number.isFinite(suggested) ? depthToDisplay(suggested, zU).toFixed(0) : ''} onChange={(e) => setTopText(e.target.value)} />
        <span className="text-pl-muted">(empty: where the velocity peaks)</span>
        <label htmlFor="pp-xp-u" className="text-pl-muted ml-2">U</label>
        <input id="pp-xp-u" data-testid="pp-xp-u" className="w-12 px-1.5 py-0.5 rounded bg-pl-surface border border-pl-border-strong text-pl-text" value={uText} onChange={(e) => setUText(e.target.value)} />
        <button type="button" data-testid="pp-xp-use" disabled={!canUse}
          title={canUse ? 'Set Bowers unloading with this sigma max and U' : 'Needs a crossplot, a sigma max and U of 1 or more'}
          onClick={() => onUseUnloading({ U, sigmaMaxPa: xp.sigmaMaxPa })}
          className="px-2 py-0.5 rounded border border-pl-primary text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40">
          Use for Bowers unloading
        </button>
      </div>
      <div className="text-[11px] text-pl-muted" data-testid="pp-xp-summary" data-unloaded={xp.error ? 0 : xp.unloadedCount}>
        {xp.error || (
          <>
            Loading trend V = {vOut(xp.trend.a).toPrecision(4)} rho^{xp.trend.b.toFixed(3)} ({vU}, kg/m3) above {depthToDisplay(topM, zU).toFixed(0)} {zU} bml.
            {' '}Below it, {xp.unloadedCount} of {xp.belowCount} samples sit more than 3% under the trend at their density: {xp.unloadedCount ? 'unloading (velocity reversal with density held).' : 'no unloading seen.'}
            {' '}V max {vOut(xp.vMaxMs).toFixed(0)} {vU}; {xp.sigmaMaxPa != null ? `sigma max on the loading curve (A ${A}, B ${B}) ${pressureToDisplay(xp.sigmaMaxPa, sU).toFixed(sU === 'psi' ? 0 : 2)} ${sU}.` : xp.sigmaError}
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-300 p-4 relative" data-canvas="chart" data-testid="pp-xp-chart">
        {series && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={CHART_MARGINS.standard}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" dataKey="rho" name="Density" domain={['auto', 'auto']} stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(v) => v.toFixed(2)}
                label={{ value: 'Bulk density (g/cc)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
              <YAxis type="number" dataKey="v" name="Velocity" domain={['auto', 'auto']} stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{ value: `Velocity (${vU})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <Scatter name="Loading (above the top)" data={series.loading} fill="#456990" isAnimationActive={false} />
              <Scatter name="Below the top, on the trend" data={series.below} fill="#94a3b8" isAnimationActive={false} />
              <Scatter name="Unloading" data={series.unloading} fill="#e76f51" isAnimationActive={false} />
              <Scatter name="Loading trend" data={series.trend} fill="none" line={{ stroke: '#2a9d8f', strokeWidth: 1.5 }} shape={() => null} isAnimationActive={false} legendType="line" />
              {xp.vMaxMs && <ReferenceLine y={vOut(xp.vMaxMs)} stroke="#334155" strokeDasharray="4 3" label={{ value: 'V max', position: 'insideTopLeft', fill: '#334155', fontSize: 10 }} />}
            </ScatterChart>
          </ResponsiveContainer>
        )}
        <ChartLogo />
      </div>
    </div>
  );
}
