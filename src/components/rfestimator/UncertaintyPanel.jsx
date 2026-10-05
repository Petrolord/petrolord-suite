// RF x in-place uncertainty (RF-U2-002): the distributions, the seeded run
// through the canonical Monte Carlo (src/utils/rfestimator/uncertainty.js on
// src/lib/monteCarlo.js), P90, P50 and P10 on the Suite's exceedance
// convention (P90 the low case), the seed and the realisation count, and the
// exceedance curve of the recoverable volume on the white chart standard.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { exceedanceSeries } from '@/utils/rfestimator/series';
import { RF_MC_DEFAULTS } from '@/utils/rfestimator/uncertainty';
import { fmtPct, fmtRes } from './rfFields';
import RfField from './RfField';

const selectClass = 'h-9 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text';

const UncertaintyPanel = () => {
  const {
    inputs, u, uncertainty, inPlaceIntake, setMcField, setMcEnabled, newMcSeed,
  } = useRfEstimator();
  const mc = { ...RF_MC_DEFAULTS, ...(inputs.mc || {}) };
  const gas = inputs.phase === 'gas';
  const bigKind = gas ? 'gasVolumeB' : 'oilVolumeMM';
  const series = useMemo(() => exceedanceSeries(uncertainty, inputs.phase, u.system), [uncertainty, inputs.phase, u.system]);
  const st = uncertainty?.ok ? uncertainty.stats : null;
  const field = (key, label, kind) => (
    <RfField key={key} id={`rf-mc-${key}`} label={label} kind={kind} u={u} value={mc[key] ?? ''} onChange={(v) => setMcField(key, v)} />
  );
  const row = (name, s, fmt) => [name, fmt(s?.p90), fmt(s?.p50), fmt(s?.p10), fmt(s?.mean)];
  const rows = st ? [
    row('Recovery factor', st.rf, fmtPct),
    row(gas ? 'OGIP' : 'OOIP', st.inPlace, (v) => fmtRes(v, inputs.phase, u.system)),
    row('Recoverable volume', st.recoverable, (v) => fmtRes(v, inputs.phase, u.system)),
  ] : [];

  return (
    <Card data-testid="rf-uncertainty">
      <CardHeader className="pb-2"><CardTitle className="text-base">Uncertainty: recovery factor x in-place volume</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-xs text-pl-text">
          <input type="checkbox" checked={!!mc.enabled} onChange={(e) => setMcEnabled(e.target.checked)} data-testid="rf-mc-enabled" />
          Run a seeded Monte Carlo of RF x {gas ? 'OGIP' : 'OOIP'} (the Suite's canonical sampler)
        </label>
        {mc.enabled && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-pl-muted" htmlFor="rf-mc-rfsource">Recovery factor distribution</label>
                <select id="rf-mc-rfsource" data-testid="rf-mc-rfsource" className={selectClass} value={mc.rfSource} onChange={(e) => setMcField('rfSource', e.target.value)}>
                  <option value="analog">Triangular on the analog range (typical as mode)</option>
                  <option value="estimate">Triangular on the analog range (the estimate as mode)</option>
                  <option value="stated">Triangular as stated</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-pl-muted" htmlFor="rf-mc-ipsource">{gas ? 'OGIP' : 'OOIP'} distribution</label>
                <select id="rf-mc-ipsource" data-testid="rf-mc-ipsource" className={selectClass} value={mc.ipSource} onChange={(e) => setMcField('ipSource', e.target.value)}>
                  <option value="fixed">Fixed at the value of the case</option>
                  <option value="stated">Triangular as stated</option>
                  <option value="percentiles">P90, P50, P10 as stated (for example from ReservoirCalc Pro)</option>
                  {(inPlaceIntake?.ci95 || mc.ipSource === 'intake95') && <option value="intake95">Normal from the Material Balance 95 percent interval</option>}
                </select>
              </div>
            </div>
            {mc.rfSource === 'stated' && (
              <div className="grid grid-cols-3 gap-3">{field('rfMin', 'RF minimum', 'fraction')}{field('rfMode', 'RF mode', 'fraction')}{field('rfMax', 'RF maximum', 'fraction')}</div>
            )}
            {mc.ipSource === 'stated' && (
              <div className="grid grid-cols-3 gap-3">{field('ipMin', 'Minimum', bigKind)}{field('ipMode', 'Mode', bigKind)}{field('ipMax', 'Maximum', bigKind)}</div>
            )}
            {mc.ipSource === 'percentiles' && (
              <div className="grid grid-cols-3 gap-3">{field('ipP90', 'P90 (low)', bigKind)}{field('ipP50', 'P50', bigKind)}{field('ipP10', 'P10 (high)', bigKind)}</div>
            )}
            <div className="grid grid-cols-3 gap-3 items-end">
              {field('iterations', 'Realisations', 'dimensionless')}
              {field('seed', 'Seed', 'dimensionless')}
              <Button size="sm" variant="outline" className="h-9 text-xs" onClick={newMcSeed} data-testid="rf-mc-newseed">New seed</Button>
            </div>
            {uncertainty && !uncertainty.ok && (
              <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-xs text-pl-warning-text" data-testid="rf-mc-errors">
                {uncertainty.errors.map((e) => <p key={e}>{e}</p>)}
              </div>
            )}
            {st && (
              <>
                <div className="overflow-x-auto" data-testid="rf-mc-table">
                  <table className="w-full text-xs">
                    <thead><tr className="text-pl-muted">{['Quantity', 'P90 (low)', 'P50', 'P10 (high)', 'Mean'].map((h) => <th key={h} className="text-left font-medium pr-3 pb-1">{h}</th>)}</tr></thead>
                    <tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-pl-border">{r.map((c, j) => <td key={j} className="pr-3 py-1 font-pl-mono tabular-nums">{c ?? EMPTY_VALUE}</td>)}</tr>)}</tbody>
                  </table>
                </div>
                <p className="text-[11px] text-pl-muted" data-testid="rf-mc-run">
                  Seed {uncertainty.seed}, {uncertainty.accepted.toLocaleString('en-US')} realisations{uncertainty.rejected ? ` (${uncertainty.rejected} rejected)` : ''}. {uncertainty.convention} RF: {uncertainty.words.rf}. {gas ? 'OGIP' : 'OOIP'}: {uncertainty.words.ip}. Drawn independently.
                </p>
                {uncertainty.notes.map((n) => <p key={n} className="text-[11px] text-pl-warning-text">{n}</p>)}
                <ChartFrame height={240}>
                  <LineChart data={series.pts} margin={{ top: 12, right: 20, bottom: 18, left: 8 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis type="number" dataKey="x" domain={['auto', 'auto']} stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(v) => `${+v.toPrecision(3)}`}
                      label={{ value: `Recoverable volume (${series.unit})`, position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                    <YAxis type="number" domain={[0, 100]} ticks={[0, 10, 50, 90, 100]} stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{ value: 'Probability of exceedance (%)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                      formatter={(v) => [`${(+v).toFixed(1)} percent`, 'Exceedance']} labelFormatter={(v) => `${(+v).toPrecision(4)} ${series.unit}`} />
                    <Line type="stepAfter" dataKey="y" stroke="#2563eb" dot={false} isAnimationActive={false} />
                    {series.marks.map((m) => <ReferenceDot key={m.label} x={m.x} y={m.y} r={4} fill="#dc2626" stroke="none" label={{ value: m.label, position: 'right', fontSize: 11, fill: CHART_COLORS.axisText }} />)}
                  </LineChart>
                </ChartFrame>
              </>
            )}
          </>
        )}
        {!mc.enabled && <p className="text-[11px] text-pl-muted">Off: the estimate is deterministic. Switched on, the run draws RF and the in-place volume from the distributions you choose, seeded so it can be repeated; the seed and the realisation count are saved with the project and printed in the report.</p>}
      </CardContent>
    </Card>
  );
};

export default UncertaintyPanel;
