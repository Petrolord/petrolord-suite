// Proof test interval sensitivity and the longest interval for a target (PS1).
//
// The chart varies ONE subsystem's proof test interval and holds everything
// else, plotting that subsystem's PFDavg and the whole SIF's (engine values at
// every point). The longest interval comes from the engine's
// maxProofTestInterval and is reported with the engine's own state.
import React, { useMemo } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Label } from '@/components/ui/label';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS,
  XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { useLopaStudio } from '@/contexts/LopaStudioContext';
import {
  INTERVAL_STATE_TEXT, formatHours, formatSci, longestInterval, parseIntervalsMonths,
  sensitivitySeries, subsystemTarget,
} from '@/utils/processSafety/lopaStudy';
import {
  EngineError, Note, NumField, Stat, TextField, Warnings,
} from './shared';

const SERIES = { sif: '#2563eb', subsystem: '#d97706', required: '#dc2626', band: '#94a3b8' };
const BAND_LINES = [1e-1, 1e-2, 1e-3, 1e-4];

const SensitivityChart = ({ rows, required }) => {
  const data = rows.map((r) => ({ years: r.years, sif: r.sifPfd, subsystem: r.subsystemPfd }));
  const values = data.flatMap((d) => [d.sif, d.subsystem]).filter((v) => v > 0);
  if (Number.isFinite(required) && required > 0) values.push(required);
  const lo = 10 ** Math.floor(Math.log10(Math.min(...values)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  const tickStyle = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
  return (
    <div className="relative h-80 rounded-lg bg-white p-2" data-testid="sensitivity-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="years" type="number" domain={['dataMin', 'dataMax']} tick={tickStyle}
            stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT}
            label={{ value: 'Proof test interval T1 (years)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <YAxis
            type="number" scale="log" domain={[lo, hi]} allowDataOverflow tick={tickStyle}
            stroke={CHART_COLORS.axisLine} tickFormatter={(v) => formatSci(v, 2)} width={70}
            label={{ value: 'PFDavg (-)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <Tooltip
            {...PINNED_TOOLTIP_PROPS}
            labelFormatter={(v) => `T1 = ${Number(Number(v).toPrecision(3))} yr`}
            formatter={(v, name) => [formatSci(v), name]}
          />
          <Legend {...LEGEND_PROPS} />
          {BAND_LINES.filter((b) => b >= lo && b <= hi).map((b) => (
            <ReferenceLine key={b} y={b} stroke={SERIES.band} strokeDasharray="2 4" ifOverflow="hidden" />
          ))}
          {Number.isFinite(required) && required > 0 ? (
            <ReferenceLine
              y={required} stroke={SERIES.required} strokeDasharray="6 3"
              label={{ value: 'Required SIF PFDavg', position: 'insideTopRight', fill: SERIES.required, fontSize: CHART_TYPOGRAPHY.annotationFontSize }}
            />
          ) : null}
          <Line type="linear" dataKey="sif" name="SIF PFDavg" stroke={SERIES.sif} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
          <Line type="linear" dataKey="subsystem" name="Chosen subsystem PFDavg" stroke={SERIES.subsystem} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ChartLogo />
    </div>
  );
};

const LongestInterval = ({ subsystemId }) => {
  const { active, evaluation, setSensitivity } = useLopaStudio();
  const mode = active.sensitivity?.targetMode || 'share';
  const target = subsystemTarget(active, evaluation, subsystemId);
  const result = target.error ? null : longestInterval(active, subsystemId, target.target);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">Longest proof test interval for a target</h3>
      <div className="flex flex-wrap items-end gap-4 text-sm text-slate-200">
        <label className="flex items-center gap-2">
          <input
            type="radio" name="target-mode" checked={mode === 'share'}
            onChange={() => setSensitivity({ targetMode: 'share' })}
          />
          This subsystem&apos;s share of the required SIF PFDavg
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio" name="target-mode" checked={mode === 'custom'}
            onChange={() => setSensitivity({ targetMode: 'custom' })}
          />
          A target PFDavg I type
        </label>
        {mode === 'custom' ? (
          <NumField
            label="Target PFDavg" unit="-" value={active.sensitivity?.customTargetPfd}
            onChange={(v) => setSensitivity({ customTargetPfd: v })} className="w-40"
          />
        ) : null}
      </div>
      {mode === 'share' && !target.error ? (
        <Note>
          Share = required SIF PFDavg {formatSci(target.required)} less the other subsystems&apos; PFDavg
          {' '}{formatSci(target.othersPfd)} as they stand = {formatSci(target.target)}. This subtraction is the
          studio&apos;s own arithmetic on engine results; the interval search below is the engine&apos;s.
        </Note>
      ) : null}
      {target.error ? <EngineError result={target} /> : null}
      {result?.error ? <EngineError result={result} /> : null}
      {result && !result.error ? (
        <div className="space-y-2" data-testid="interval-result">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-600 px-2 py-0.5 font-mono text-xs text-slate-200" data-testid="interval-state">{result.state}</span>
            <span className="text-sm text-slate-200">{INTERVAL_STATE_TEXT[result.state]}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Stat label="Target PFDavg" unit="-" value={formatSci(target.target)} />
            {result.proofTestIntervalHours !== null && result.proofTestIntervalHours !== undefined ? (
              <Stat label="Longest interval" value={formatHours(result.proofTestIntervalHours)} emphasis testId="interval-hours" />
            ) : null}
            {Number.isFinite(result.pfdAvg) ? <Stat label="PFDavg at that interval" unit="-" value={formatSci(result.pfdAvg)} /> : null}
            {Number.isFinite(result.floorPfdAvg) ? <Stat label="Interval independent floor" unit="-" value={formatSci(result.floorPfdAvg)} emphasis /> : null}
          </div>
          <Warnings warnings={result.warnings} />
          {result.basis?.method ? <p className="text-[11px] text-slate-500">Engine basis: {result.basis.method}.</p> : null}
        </div>
      ) : null}
    </div>
  );
};

const ProofTestPanel = () => {
  const { active, evaluation, setSensitivity } = useLopaStudio();
  const subs = active.sif?.subsystems || [];
  const chosen = subs.find((s) => s.id === active.sensitivity?.subsystemId)
    || subs.find((s) => s.role === 'final') || subs[0];
  const chosenId = chosen?.id;
  const parsed = useMemo(() => parseIntervalsMonths(active.sensitivity?.months), [active.sensitivity?.months]);
  const series = useMemo(
    () => (chosenId ? sensitivitySeries(active, chosenId, parsed.hours) : { error: 'Add a subsystem first.' }),
    [active, chosenId, parsed.hours],
  );
  const required = evaluation.withoutSif?.requiredSifPfdAvg;
  const lambdaWarnings = series.rows
    ? [...new Set(series.rows.flatMap((r) => r.warnings || []))]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-[11px] text-slate-400">Subsystem to vary</Label>
          <select
            aria-label="Subsystem to vary"
            value={chosenId || ''}
            onChange={(e) => setSensitivity({ subsystemId: e.target.value })}
            className="block h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
          >
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.architecture})</option>)}
          </select>
        </div>
        <TextField
          label="Proof test intervals (months, separated by commas)"
          value={active.sensitivity?.months}
          onChange={(v) => setSensitivity({ months: v })}
          className="min-w-[18rem] flex-1"
        />
      </div>
      {parsed.bad.length ? <p className="text-xs text-amber-200">Ignored because they are not positive numbers of months: {parsed.bad.join(', ')}</p> : null}
      <Note>
        One month is taken as 730 h (8760 h a year over twelve). Every other input of every subsystem is
        held as entered on the SIF verification tab. The dashed grey lines are the decade band edges
        (1e-1 to 1e-4); an exact decade belongs to the lower SIL band.
      </Note>
      {series.error ? <EngineError result={series} /> : (
        <>
          <SensitivityChart rows={series.rows} required={required} />
          {series.rows.some((r) => r.sifError) ? (
            <p className="text-xs text-amber-200">The SIF total is missing where another subsystem has an input the engine refused.</p>
          ) : null}
          <Warnings warnings={lambdaWarnings} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" data-testid="sensitivity-table">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">T1 (h)</th>
                  <th className="px-2 py-1 text-left">T1 (yr)</th>
                  <th className="px-2 py-1 text-left">Subsystem PFDavg (-)</th>
                  <th className="px-2 py-1 text-left">SIF PFDavg (-)</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-200">
                {series.rows.map((r) => (
                  <tr key={r.hours} className="border-t border-slate-800">
                    <td className="px-2 py-1">{Number(r.hours.toPrecision(6))}</td>
                    <td className="px-2 py-1">{Number(r.years.toPrecision(3))}</td>
                    <td className="px-2 py-1">{formatSci(r.subsystemPfd)}</td>
                    <td className="px-2 py-1">{r.sifPfd === null ? 'n/a' : formatSci(r.sifPfd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="border-t border-slate-800 pt-4">
        {chosenId ? <LongestInterval subsystemId={chosenId} /> : null}
      </div>
    </div>
  );
};

export default ProofTestPanel;
