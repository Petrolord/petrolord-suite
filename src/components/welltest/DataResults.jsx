// Main area for the Data tab: pressure history, rate steps and QC summary.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { ChartCard, Kpi, LINE, WarningBanner, fmt, fmtU } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const DataResults = () => {
  const { gaugeRows, prepared, configSpec, reservoirSpec, flowPeriods, unitSystem } = useWellTestStudio();
  const rateKind = reservoirSpec.reservoir?.fluid === 'gas' ? 'gasRate' : 'oilRate';

  const historyData = useMemo(
    () => prepared.points.map((p) => ({
      time: Number(p.time.toPrecision(4)),
      pressure: Number(fromOilfield('pressure', p.p, unitSystem).toFixed(2)),
    })),
    [prepared, unitSystem],
  );

  const rateData = useMemo(() => {
    if (!flowPeriods.steps.length) return [];
    // step chart: duplicate each step boundary so rates plot as a staircase
    const pts = [];
    flowPeriods.steps.forEach((s, i) => {
      const next = flowPeriods.steps[i + 1];
      const q = fromOilfield(rateKind, s.q, unitSystem);
      pts.push({ time: s.start, rate: q });
      if (next) pts.push({ time: next.start, rate: q });
    });
    return pts;
  }, [flowPeriods, rateKind, unitSystem]);

  if (!gaugeRows.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center space-y-2">
        <p className="text-slate-300 font-medium">No test data loaded.</p>
        <p className="text-sm text-slate-500">
          Import a gauge CSV in the left rail, or load the sample buildup to explore the studio. Set the test type,
          producing time and reservoir properties there as well.
        </p>
      </div>
    );
  }

  const errors = [reservoirSpec.error, configSpec.error].filter(Boolean);
  const timeLabel = configSpec.config?.family === 'buildup' ? 'Shut-in time (hr)' : 'Elapsed time (hr)';

  return (
    <div className="space-y-4 overflow-y-auto">
      <WarningBanner warnings={[...errors, ...prepared.warnings]} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Gauge points" value={fmt.int(gaugeRows.length)} />
        <Kpi title="Points used" value={fmt.int(prepared.points.length)} accent />
        <Kpi title="Time span" value={prepared.points.length ? `${fmt.sig3(prepared.points[0].time)} to ${fmt.sig3(prepared.points[prepared.points.length - 1].time)}` : '—'} unit="hr" />
        <Kpi title="pwf at shut-in" value={fmtU('pressure', prepared.pwfShutIn, unitSystem, fmt.f1)} unit={unitLabel('pressure', unitSystem)} />
      </div>

      <ChartCard title="Pressure history">
        <LineChart data={historyData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="time" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: timeLabel, position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line type="monotone" dataKey="pressure" name="Gauge pressure" stroke={LINE.pressure} dot={{ r: 2 }} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      {rateData.length > 0 && (
        <ChartCard title="Rate history" height={200}>
          <LineChart data={rateData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="time" type="number" domain={['auto', 'auto']} {...axisProps}
              label={{ value: 'Time (hr)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis domain={[0, 'auto']} {...axisProps}
              label={{ value: `Rate (${unitLabel(rateKind, unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...tooltipProps} />
            <Line type="linear" dataKey="rate" name="Rate" stroke={LINE.rate} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {flowPeriods.periods.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Flow periods</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium">Start (hr)</th>
                <th className="py-1 font-medium">End (hr)</th>
                <th className="py-1 font-medium">Rate ({unitLabel(rateKind, unitSystem)})</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {flowPeriods.periods.map((p, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-1 capitalize">{p.type}</td>
                  <td className="py-1">{fmt.f1(p.start)}</td>
                  <td className="py-1">{p.end == null ? 'open' : fmt.f1(p.end)}</td>
                  <td className="py-1">{fmtU(rateKind, p.q, unitSystem, fmt.f1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {Number.isFinite(flowPeriods.equivalentTp) && (
            <p className="text-[11px] text-slate-500 mt-2">
              Equivalent producing time from the rate history (cumulative production over final rate): {fmt.f1(flowPeriods.equivalentTp)} hr.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DataResults;
