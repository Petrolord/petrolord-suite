// Main area for the RTA tab (WT9): material-balance-time log-log
// diagnostics, the flowing material balance with its regression line, and
// the transient linear-flow card.
import React, { useMemo } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { ChartCard, Kpi, LINE, WarningBanner, fmt, logTicks, logTickFormatter } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const RtaResults = () => {
  const { rtaResult, rtaRows, reservoirSpec, unitSystem } = useWellTestStudio();
  const isGas = rtaResult?.isGas ?? (reservoirSpec.reservoir?.fluid === 'gas');
  const normKind = isGas ? 'pseudoPressure' : 'pressure';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  // normalized drawdown per rate: (psi or psi2/cp) / (STB/D or Mscf/D)
  const normUnit = `${unitLabel(normKind, unitSystem)} per ${unitLabel(rateKind, unitSystem)}`;
  const uNorm = (v) => fromOilfield(normKind, v, unitSystem) / (fromOilfield(rateKind, 1, unitSystem));

  // in-place volume display: MMSTB / Bcf in oilfield, MM m3 / 10^9 m3 in SI
  const inPlace = useMemo(() => {
    const fmbResult = rtaResult?.fmb;
    if (!fmbResult) return { value: '—', unit: isGas ? 'Bcf' : 'MMSTB' };
    if (isGas) {
      return unitSystem === 'si'
        ? { value: fmt.f3((fmbResult.G * 28.3168466) / 1e9), unit: '10⁹ m³' }
        : { value: fmt.f2(fmbResult.G / 1e6), unit: 'Bcf' };
    }
    return unitSystem === 'si'
      ? { value: fmt.f3((fmbResult.N * 0.158987294928) / 1e6), unit: 'MM m³' }
      : { value: fmt.f2(fmbResult.N / 1e6), unit: 'MMSTB' };
  }, [rtaResult, isGas, unitSystem]);

  const loglogData = useMemo(
    () => (rtaResult?.loglogRta || []).map((p) => ({
      x: p.x,
      y: p.y > 0 ? uNorm(p.y) : null,
      derivative: p.derivative > 0 ? uNorm(p.derivative) : null,
    })),
    [rtaResult, unitSystem], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const fmbData = useMemo(() => {
    const fmbResult = rtaResult?.fmb;
    if (!fmbResult) return [];
    // gas plots against material-balance pseudo-time; oil against te
    const xs = isGas ? fmbResult.tca : rtaResult.rowsTe.map((r) => r.te);
    const pts = isGas
      ? rtaResult.rowsTe.filter((r) => r.q > 0 && r.pwf > 0 && r.pwf < reservoirSpec.reservoir.pi)
      : rtaResult.rowsTe.filter((r) => r.te > 0);
    const paOf = isGas ? reservoirSpec.reservoir.mOfP : (v) => v;
    const paI = paOf(reservoirSpec.reservoir.pi);
    return pts.map((r, i) => ({
      x: xs[i],
      observed: uNorm((paI - paOf(r.pwf)) / r.q),
      line: uNorm(fmbResult.intercept + fmbResult.slope * xs[i]),
    }));
  }, [rtaResult, isGas, reservoirSpec, unitSystem]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rtaRows.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center space-y-2">
        <p className="text-slate-300 font-medium">No production data loaded.</p>
        <p className="text-sm text-slate-500">
          Import a production CSV in the left rail (time in days, rate, flowing pressure). Reservoir and fluid
          properties are taken from the Data tab.
        </p>
      </div>
    );
  }

  if (!rtaResult) {
    return <WarningBanner warnings={[reservoirSpec.error || 'At least 3 valid production rows and valid reservoir inputs are needed.']} />;
  }

  const fmbResult = rtaResult.fmb;
  const linear = rtaResult.linear;

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title={isGas ? 'OGIP G (flowing MB)' : 'OOIP N (flowing MB)'} value={inPlace.value} unit={inPlace.unit} accent={!!fmbResult} />
        <Kpi title="Productivity index J" value={fmt.sig3(fmbResult?.J)} unit={isGas ? `${unitLabel(rateKind, unitSystem)} per ${unitLabel('pseudoPressure', unitSystem)}` : `${unitLabel(rateKind, unitSystem)}/${unitLabel('pressure', unitSystem)}`} />
        <Kpi title="FMB fit r²" value={fmt.f3(fmbResult?.r2)} />
        <Kpi title="Production points" value={fmt.int(rtaResult.rows.length)} />
      </div>

      {isGas && fmbResult && (
        <p className="text-[11px] text-slate-500">
          Dynamic material balance: {fmbResult.iterations} iterations{fmbResult.converged ? ' (converged)' : ' (not converged, review)'} on
          the G, average-pressure and pseudo-time loop.
        </p>
      )}

      <ChartCard title="Rate-normalized log-log vs material-balance time" height={340}>
        <ComposedChart data={loglogData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" scale="log" domain={['auto', 'auto']}
            ticks={logTicks(loglogData.map((d) => d.x))} tickFormatter={logTickFormatter} {...axisProps}
            label={{ value: 'Material-balance time te (days)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis type="number" scale="log" domain={['auto', 'auto']}
            ticks={logTicks(loglogData.flatMap((d) => [d.y, d.derivative]).filter((v) => v > 0))}
            tickFormatter={logTickFormatter} {...axisProps}
            label={{ value: `${isGas ? 'Δm(p)/q' : 'Δp/q'} and derivative (${normUnit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} formatter={(v) => (Number.isFinite(v) ? v.toPrecision(4) : v)} labelFormatter={(v) => `te = ${Number(v).toPrecision(3)} days`} />
          <Legend {...legendProps} />
          <Scatter dataKey="y" name={isGas ? 'Δm(p)/q' : 'Δp/q'} fill={LINE.dp} isAnimationActive={false} />
          <Scatter dataKey="derivative" name="Derivative" fill={LINE.derivative} isAnimationActive={false} />
        </ComposedChart>
      </ChartCard>

      <ChartCard title={`Flowing material balance (${isGas ? 'Δm(p)/q vs material-balance pseudo-time' : 'Δp/q vs te'})`} height={300}>
        <ComposedChart data={fmbData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: isGas ? 'Material-balance pseudo-time tca (days)' : 'Material-balance time te (days)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: `${isGas ? 'Δm(p)/q' : 'Δp/q'} (${normUnit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} formatter={(v) => (Number.isFinite(v) ? v.toPrecision(4) : v)} />
          <Legend {...legendProps} />
          <Scatter dataKey="observed" name="Data" fill={LINE.dp} isAnimationActive={false} />
          {fmbResult && <Line type="monotone" dataKey="line" name="FMB line" stroke={LINE.fit} dot={false} strokeWidth={2} isAnimationActive={false} />}
        </ComposedChart>
      </ChartCard>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Transient linear flow (Wattenbarger)</p>
        {linear ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <Kpi title="xf √k" value={fmt.sig3(unitSystem === 'si' ? linear.xfSqrtK * 0.3048 : linear.xfSqrtK)} unit={unitSystem === 'si' ? 'm·√md' : 'ft·√md'} accent />
            <Kpi title="√t slope" value={fmt.sig3(uNorm(linear.slope))} unit={`${normUnit}/√day`} />
            <Kpi title="Fit r²" value={fmt.f3(linear.r2)} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Set the linear window over an early half-slope trend (needs at least 3 points inside the window and valid
            reservoir properties).
          </p>
        )}
      </div>
    </div>
  );
};

export default RtaResults;
